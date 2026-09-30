import { useState } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Input, Modal, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { problemMessage, toUIError, type UIError } from "../../bridge/errors";
import type { Problem, TargetSpec } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import type { WizardStart } from "./ManageGameWizard";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Continues into the assistant (Folders step). */
  onContinue: (start: WizardStart) => void;
}

interface Row extends TargetSpec {
  key: number;
}

/**
 * Generic game form (DLG-02, core/11 §4): name, root folder, one or more
 * targets (id + folder relative to the root) and an optional executable.
 * The backend checks all of it; this form only collects and relays.
 */
export function GenericGameDialog({ open, onOpenChange, onContinue }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const [name, setName] = useState("");
  const [root, setRoot] = useState("");
  const [executable, setExecutable] = useState("");
  const [rows, setRows] = useState<Row[]>([{ key: 1, id: "", path: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setRoot("");
    setExecutable("");
    setRows([{ key: 1, id: "", path: "" }]);
    setNextKey(2);
    setProblems([]);
    setError(null);
  };

  const close = (next: boolean) => {
    if (busy) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const update = (key: number, patch: Partial<TargetSpec>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    setProblems([]);
    const targets = rows.map(({ id, path }) => ({ id: id.trim(), path: path.trim() }));
    try {
      const v = await backend.verifyGameSetup({
        gameId: "generic",
        name,
        root,
        store: "manual",
        targets,
        executable,
        staging: "",
        archiveStore: "",
        backupStore: "",
        method: "",
      });
      if (v.problems.length > 0) {
        setProblems(v.problems);
        return;
      }
      onContinue({
        gameId: "generic",
        gameName: v.name,
        generic: { name: v.name, root: v.root, targets, executable },
      });
      onOpenChange(false);
      reset();
    } catch (raw) {
      setError(toUIError(raw));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal.Root open={open} onOpenChange={close} closeOnBackdropClick={false}>
      <Modal.Content size="xl" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("generic.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm" color="muted-fg">
              {t("generic.intro")}
            </Typography>
            <Input.Root fullWidth value={name} onChange={setName}>
              <Input.Label>{t("generic.name")}</Input.Label>
              <Input.Box>
                <Input.Field autoFocus />
              </Input.Box>
            </Input.Root>
            <Stack gap="xs">
              <Input.Root fullWidth value={root} onChange={setRoot}>
                <Input.Label>{t("generic.root")}</Input.Label>
                <Input.Box>
                  <Input.Field />
                </Input.Box>
              </Input.Root>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  startIcon={<FolderOpen aria-hidden="true" className="h-4 w-4" />}
                  onClick={async () => {
                    try {
                      const path = await backend.pickFolder(t("wizard.pickFolder"));
                      if (path) setRoot(path);
                    } catch (raw) {
                      setError(toUIError(raw));
                    }
                  }}
                >
                  {t("wizard.browse")}
                </Button>
              </div>
            </Stack>

            <Stack gap="sm">
              <Typography variant="heading-6" color="fg">
                {t("generic.targets")}
              </Typography>
              <Typography variant="body-sm" color="muted-fg">
                {t("generic.targetsHelp")}
              </Typography>
              {rows.map((row, index) => (
                <div key={row.key} className="grid grid-cols-[10rem_1fr_auto] items-end gap-2">
                  <Input.Root fullWidth value={row.id} onChange={(v: string) => update(row.key, { id: v })}>
                    <Input.Label>{t("generic.targetId")}</Input.Label>
                    <Input.Box>
                      <Input.Field placeholder={index === 0 ? "mods" : ""} />
                    </Input.Box>
                  </Input.Root>
                  <Input.Root fullWidth value={row.path} onChange={(v: string) => update(row.key, { path: v })}>
                    <Input.Label>{t("generic.targetPath")}</Input.Label>
                    <Input.Box>
                      <Input.Field placeholder={index === 0 ? "Mods" : ""} />
                    </Input.Box>
                  </Input.Root>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("generic.removeTarget")}
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  startIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
                  onClick={() => {
                    setRows((rs) => [...rs, { key: nextKey, id: "", path: "" }]);
                    setNextKey((k) => k + 1);
                  }}
                >
                  {t("generic.addTarget")}
                </Button>
              </div>
            </Stack>

            <Input.Root fullWidth value={executable} onChange={setExecutable}>
              <Input.Label>{t("generic.executable")}</Input.Label>
              <Input.Box>
                <Input.Field />
              </Input.Box>
              <Input.HelperText>{t("generic.executableHelp")}</Input.HelperText>
            </Input.Root>

            {problems.map((p, i) => (
              <Alert.Root key={`${p.code}-${i}`} variant="danger">
                <Alert.Description>{problemMessage(i18n, p, "error")}</Alert.Description>
              </Alert.Root>
            ))}
            {error ? <ErrorAlert title="wizard.error" error={error} /> : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={() => close(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !root.trim() || !name.trim()} loading={busy} onClick={() => void submit()}>
            {t("common.next")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
