import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, FolderOpen } from "lucide-react";
import { Alert, Button, Input, Modal, Radio, Spinner, Stack, Stepper, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { problemMessage, toUIError, type UIError } from "../../bridge/errors";
import type { GameFolders, GameSetup, Problem, SetupVerification, TargetSpec } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useRefresh } from "../../bridge/use-backend-query";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { ForeignAlert } from "./ForeignAlert";
import { useStoreLabel } from "./GameDetails";

/** Where the assistant starts (DLG-01, core/11 §4). */
export interface WizardStart {
  gameId: string;
  gameName: string;
  /** A detected installation; absent for "locate manually". */
  root?: string;
  store?: string;
  version?: string;
  /** Set by the generic game form (DLG-02): the assistant starts at Folders. */
  generic?: { name: string; root: string; targets: TargetSpec[]; executable: string };
}

const STEPS: MessageKey[] = ["wizard.step.installation", "wizard.step.folders", "wizard.step.verification", "wizard.step.finish"];
type StepIndex = 0 | 1 | 2 | 3;

interface Props {
  start: WizardStart | null;
  onClose: () => void;
}

/**
 * "Manage game" assistant (DLG-01): installation → folders → verification →
 * finish. The UI only collects choices and shows what the backend checked;
 * whether a folder, a method or a setup is valid is decided by the backend.
 */
export function ManageGameWizard({ start, onClose }: Props) {
  if (!start) return null;
  return <WizardBody key={`${start.gameId}|${start.root ?? ""}|${start.generic?.root ?? ""}`} start={start} onClose={onClose} />;
}

function WizardBody({ start, onClose }: { start: WizardStart; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const { navigate } = useNavigation();
  const { refresh } = useRefresh();
  const storeLabel = useStoreLabel();

  const generic = start.generic;
  const [step, setStep] = useState<StepIndex>(generic ? 1 : 0);
  const [name, setName] = useState(generic?.name ?? start.gameName);
  const [root, setRoot] = useState(generic?.root ?? start.root ?? "");
  const [version, setVersion] = useState(start.version ?? "");
  const [rootProblem, setRootProblem] = useState<Problem | null>(null);
  const [rootValid, setRootValid] = useState(Boolean(start.root) || Boolean(generic));
  const [folders, setFolders] = useState<GameFolders | null>(null);
  const [verification, setVerification] = useState<SetupVerification | null>(null);
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UIError | null>(null);
  const [done, setDone] = useState<{ instanceId: string } | null>(null);
  const requestSeq = useRef(0);
  const suggestedFor = useRef("");

  const setup = useCallback(
    (f: GameFolders | null): GameSetup => ({
      gameId: start.gameId,
      name,
      root,
      store: start.store ?? "manual",
      targets: generic?.targets ?? [],
      executable: generic?.executable ?? "",
      staging: f?.staging ?? "",
      archiveStore: f?.archiveStore ?? "",
      backupStore: f?.backupStore ?? "",
      method,
    }),
    [start.gameId, start.store, name, root, generic, method],
  );

  const pick = async (): Promise<string> => {
    try {
      return await backend.pickFolder(t("wizard.pickFolder"));
    } catch (raw) {
      setError(toUIError(raw));
      return "";
    }
  };

  const validateRoot = async (candidate: string) => {
    if (!candidate.trim()) {
      setRootValid(false);
      setRootProblem(null);
      return;
    }
    const seq = ++requestSeq.current;
    try {
      const check = await backend.validateGameRoot(start.gameId, candidate);
      if (seq !== requestSeq.current) return;
      setRoot(check.root);
      setVersion(check.version ?? "");
      setRootProblem(check.problem ?? null);
      setRootValid(!check.problem);
      setError(null);
    } catch (raw) {
      if (seq === requestSeq.current) setError(toUIError(raw));
    }
  };

  const goFolders = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = `${root}|${name}`;
      if (!folders || suggestedFor.current !== key) {
        setFolders(await backend.suggestGameFolders(start.gameId, root, name));
        suggestedFor.current = key;
      }
      setStep(1);
    } catch (raw) {
      setError(toUIError(raw));
    } finally {
      setBusy(false);
    }
  };

  // The generic form arrives at Folders without suggestions yet.
  useEffect(() => {
    if (generic && !folders) {
      backend.suggestGameFolders(start.gameId, root, name).then(setFolders, (raw) => setError(toUIError(raw)));
    }
    // Only on first render: later changes are made by the user in this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goVerification = async () => {
    setBusy(true);
    setError(null);
    setStep(2);
    try {
      const v = await backend.verifyGameSetup(setup(folders));
      setVerification(v);
      setFolders({ staging: v.staging, archiveStore: v.archiveStore, backupStore: v.backupStore });
      setName(v.name);
      // Hardlink is preselected only when it works; copy must be chosen on purpose.
      const hard = v.methods.find((m) => m.method === "hardlink");
      setMethod(hard?.available ? "hardlink" : "");
    } catch (raw) {
      setError(toUIError(raw));
    } finally {
      setBusy(false);
    }
  };

  const manage = async () => {
    setStep(3);
    setBusy(true);
    setError(null);
    try {
      const res = await backend.manageGame(setup(folders));
      refresh();
      setDone({ instanceId: res.instanceId });
    } catch (raw) {
      setError(toUIError(raw));
    } finally {
      setBusy(false);
    }
  };

  const changeFolder = async (key: keyof GameFolders) => {
    const path = await pick();
    if (path && folders) setFolders({ ...folders, [key]: path });
  };

  const blocked = (verification?.problems.length ?? 0) > 0;
  const canFinish = verification !== null && !blocked && method !== "" && !busy;

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()} closeOnEscape={!busy} closeOnBackdropClick={false}>
      <Modal.Content size="2xl" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("wizard.title", { game: start.gameName })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="lg">
            <Stepper.Root value={step} aria-label={t("wizard.steps")}>
              {STEPS.map((label, index) => (
                <Stepper.Step key={label} index={index}>
                  <Stepper.StepIndicator />
                  <Stepper.StepLabel>{t(label)}</Stepper.StepLabel>
                </Stepper.Step>
              ))}
            </Stepper.Root>

            {step === 0 ? (
              <Stack gap="md">
                <Typography variant="body-sm" color="muted-fg">
                  {t("wizard.installation.intro")}
                </Typography>
                <Input.Root fullWidth value={root} onChange={setRoot} error={rootProblem ? problemMessage(i18n, rootProblem, "error") : false}>
                  <Input.Label>{t("wizard.installation.folder")}</Input.Label>
                  <Input.Box>
                    <Input.Field autoFocus onBlur={() => void validateRoot(root)} onKeyDown={(e) => e.key === "Enter" && void validateRoot(root)} />
                  </Input.Box>
                  <Input.Error />
                </Input.Root>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    startIcon={<FolderOpen aria-hidden="true" className="h-4 w-4" />}
                    onClick={async () => {
                      const path = await pick();
                      if (path) {
                        setRoot(path);
                        await validateRoot(path);
                      }
                    }}
                  >
                    {t("wizard.browse")}
                  </Button>
                </div>
                {rootValid ? (
                  <Alert.Root variant="success">
                    <Alert.Description>
                      {t("wizard.installation.valid")}
                      {start.store ? ` · ${storeLabel(start.store)}` : ""}
                      {version ? ` · ${version}` : ""}
                    </Alert.Description>
                  </Alert.Root>
                ) : null}
                <Input.Root fullWidth value={name} onChange={setName}>
                  <Input.Label>{t("wizard.installation.name")}</Input.Label>
                  <Input.Box>
                    <Input.Field />
                  </Input.Box>
                  <Input.HelperText>{t("wizard.installation.nameHelp")}</Input.HelperText>
                </Input.Root>
              </Stack>
            ) : null}

            {step === 1 ? (
              <Stack gap="md">
                <Typography variant="body-sm" color="muted-fg">
                  {t("wizard.folders.intro")}
                </Typography>
                {folders ? (
                  <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 text-sm">
                    {(
                      [
                        ["staging", "wizard.folders.staging", "wizard.folders.stagingHelp"],
                        ["archiveStore", "wizard.folders.archives", "wizard.folders.archivesHelp"],
                        ["backupStore", "wizard.folders.backups", "wizard.folders.backupsHelp"],
                      ] as const
                    ).map(([key, label, help]) => (
                      <div key={key} className="contents">
                        <dt className="text-fg-muted">{t(label)}</dt>
                        <dd className="min-w-0">
                          <div className="break-all font-mono text-xs text-fg">{folders[key] || t("wizard.folders.choose")}</div>
                          <div className="text-xs text-fg-muted">{t(help)}</div>
                        </dd>
                        <dd className="flex gap-2">
                          {key === "staging" && !folders.staging && folders.suggestedStaging ? (
                            <Button size="sm" variant="ghost" onClick={() => setFolders({ ...folders, staging: folders.suggestedStaging ?? "" })}>
                              {t("wizard.folders.suggest")}
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => void changeFolder(key)}>
                            {t("wizard.change")}
                          </Button>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <Spinner label={t("common.loading")} />
                )}
              </Stack>
            ) : null}

            {step === 2 ? (
              <Stack gap="md">
                {busy && !verification ? <Spinner label={t("wizard.verifying")} /> : null}
                {verification ? <VerificationView v={verification} method={method} onMethod={setMethod} /> : null}
              </Stack>
            ) : null}

            {step === 3 ? (
              <Stack gap="md">
                {busy ? <Spinner label={t("wizard.finishing")} /> : null}
                {done ? (
                  <Alert.Root variant="success">
                    <Alert.Title>
                      <span className="inline-flex items-center gap-2">
                        <CircleCheck aria-hidden="true" className="h-4 w-4" />
                        {t("wizard.done.title", { name })}
                      </span>
                    </Alert.Title>
                    <Alert.Description>{t("wizard.done.description")}</Alert.Description>
                  </Alert.Root>
                ) : null}
              </Stack>
            ) : null}

            {error ? <ErrorAlert title="wizard.error" error={error} /> : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          {done ? (
            <>
              <Button variant="outline" onClick={onClose}>
                {t("common.close")}
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  navigate({ view: "overview" });
                }}
              >
                {t("wizard.openWorkspace")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                {t("common.cancel")}
              </Button>
              {step > 0 && !(generic && step === 1) ? (
                <Button variant="outline" disabled={busy} onClick={() => setStep((s) => Math.max(0, s - 1) as StepIndex)}>
                  {t("common.back")}
                </Button>
              ) : null}
              {step === 0 ? (
                <Button disabled={!rootValid || !name.trim() || busy} onClick={() => void goFolders()}>
                  {t("common.next")}
                </Button>
              ) : null}
              {step === 1 ? (
                <Button disabled={!folders || !folders.staging || busy} onClick={() => void goVerification()}>
                  {t("common.next")}
                </Button>
              ) : null}
              {step === 2 ? (
                <Button disabled={!canFinish} onClick={() => void manage()}>
                  {t("wizard.manage")}
                </Button>
              ) : null}
              {step === 3 && error ? (
                <Button onClick={() => setStep(2)}>{t("common.back")}</Button>
              ) : null}
            </>
          )}
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

function VerificationView({ v, method, onMethod }: { v: SetupVerification; method: string; onMethod: (m: string) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <Stack gap="md">
      {v.problems.map((p, i) => (
        <Alert.Root key={`${p.code}-${i}`} variant="danger">
          <Alert.Description>{problemMessage(i18n, p, "error")}</Alert.Description>
        </Alert.Root>
      ))}
      {v.warnings.map((p, i) => (
        <Alert.Root key={`${p.code}-${i}`} variant="warning">
          <Alert.Description>{problemMessage(i18n, p, "warning")}</Alert.Description>
        </Alert.Root>
      ))}
      <ForeignAlert findings={v.foreign} />
      {v.problems.length === 0 ? (
        <Stack gap="sm">
          <Typography variant="heading-6" color="fg">
            {t("wizard.verification.method")}
          </Typography>
          <Radio.Group name="deploy-method" value={method} onValueChange={onMethod}>
            {v.methods.map((m) => (
              <Radio.Item key={m.method} value={m.method} disabled={!m.available} label={t(`method.${m.method}` as MessageKey)}>
                <span className="block text-xs text-fg-muted">
                  {m.available
                    ? t(`method.${m.method}.help` as MessageKey)
                    : t(`method.unavailable.${m.reason ?? "unknown"}` as MessageKey)}
                </span>
              </Radio.Item>
            ))}
          </Radio.Group>
          {method === "" ? <Typography variant="caption" color="muted-fg">{t("wizard.verification.chooseMethod")}</Typography> : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

