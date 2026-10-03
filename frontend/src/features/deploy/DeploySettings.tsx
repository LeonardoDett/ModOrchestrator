import { useEffect, useState, type ReactNode } from "react";
import { FolderInput, FolderOpen, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Input, Modal, Spinner, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import { useDeployMethods, useInstanceDetails } from "../../bridge/queries";
import type { ArchivesPreview, DeployMethod, GameFolders, ManagedGame, StagingPreview } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { SettingLine, SettingsSection } from "../settings/SettingControls";
import { formatBytes } from "./deploy-labels";

/**
 * Settings › Mods of one game (ui/telas/settings-extensions.md): the
 * folders and the deploy method. Paths and the method are not edited in
 * place: they open an operation with preview (DLG-18 move staging, move the
 * ArchiveStore, change method: purge, change, deploy again).
 */
export function GameFoldersSection({ instance }: { instance: string }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const details = useInstanceDetails(instance);
  const [moving, setMoving] = useState<"staging" | "archives" | null>(null);

  if (details.status === "loading") return <Spinner label={t("common.loading")} />;
  if (details.status === "error") return <ErrorAlert title="games.loadError" error={details.error} onRetry={details.reload} />;
  if (details.status !== "ready") return null;
  const g = details.data;
  const rows = [
    { which: "staging", label: "settings.mods.stagingPath.label", help: "settings.mods.stagingPath.description", path: g.staging },
    { which: "archives", label: "settings.mods.archiveStorePath.label", help: "settings.mods.archiveStorePath.description", path: g.archiveStore },
  ] as const;

  return (
    <SettingsSection id="mods-folders" title={t("settings.mods.folders")}>
      {rows.map((r) => (
        <SettingLine key={r.which} label={t(r.label)} description={t(r.help)}>
          <span className="max-w-xs break-all font-mono text-xs text-fg">{r.path}</span>
          <Button size="sm" variant="ghost" startIcon={<FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.openInstanceFolder(instance, r.which))}>
            {t("settings.open")}
          </Button>
          <Button size="sm" variant="outline" startIcon={<FolderInput aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setMoving(r.which)}>
            {t("settings.mods.moveStaging")}
          </Button>
        </SettingLine>
      ))}
      {moving === "staging" ? <MoveStagingDialog instance={instance} game={g} onClose={() => setMoving(null)} /> : null}
      {moving === "archives" ? <MoveArchivesDialog instance={instance} game={g} onClose={() => setMoving(null)} /> : null}
    </SettingsSection>
  );
}

/** Deploy section of Settings › Mods: methods (DLG-18) and the switches the caller adds. */
export function DeployMethodSection({ instance, children }: { instance: string; children?: ReactNode }) {
  const { t } = useI18n();
  const methods = useDeployMethods(instance);
  const [method, setMethod] = useState<DeployMethod | null>(null);

  if (methods.status === "loading") return <Spinner label={t("common.loading")} />;
  if (methods.status === "error") return <ErrorAlert title="settings.loadError" error={methods.error} onRetry={methods.reload} />;
  if (methods.status !== "ready") return null;

  return (
    <SettingsSection id="mods-deploy" title={t("settings.mods.deploy")} description={t("settings.mods.methodHelp")}>
      {methods.data.map((m) => (
        <SettingLine
          key={m.method}
          label={t(`deploy.method.${m.method}` as MessageKey)}
          description={m.available ? t(`settings.mods.methodAbout.${m.method}` as MessageKey) : t(`deploy.methodReason.${m.reason ?? "unknown"}` as MessageKey)}
        >
          {m.preferred ? (
            <Badge tone="success">{t("settings.mods.inUse")}</Badge>
          ) : m.available ? (
            <Button size="sm" variant="outline" onClick={() => setMethod(m)}>
              {t("settings.mods.useMethod")}
            </Button>
          ) : (
            <Badge variant="muted">{t("settings.mods.unavailable")}</Badge>
          )}
        </SettingLine>
      ))}
      {children}
      {method ? <ChangeMethodDialog instance={instance} method={method} onClose={() => setMethod(null)} /> : null}
    </SettingsSection>
  );
}

/** "Sugerir": the folder the assistant would propose for this game (core/11 §4). */
function useSuggestion(game: ManagedGame, pick: (f: GameFolders) => string) {
  const backend = useBackend();
  const run = useAction();
  return async () => {
    const r = await run(() => backend.suggestGameFolders(game.gameId, game.root, game.name), { quiet: true });
    return r.ok ? pick(r.value) : "";
  };
}

/** Folder field with "Sugerir" and "Procurar…" (ui/telas/settings-extensions.md). */
function FolderField({ label, value, onChange, onBrowse, onSuggest }: { label: string; value: string; onChange: (v: string) => void; onBrowse: () => void; onSuggest: () => void }) {
  const { t } = useI18n();
  return (
    <Input.Root fullWidth value={value} onChange={(v: string) => onChange(v)}>
      <Input.Label>{label}</Input.Label>
      <div className="flex gap-2">
        <Input.Box className="flex-1">
          <Input.Field />
        </Input.Box>
        <Button variant="ghost" startIcon={<Sparkles aria-hidden="true" />} onClick={onSuggest}>
          {t("settings.suggest")}
        </Button>
        <Button variant="outline" startIcon={<FolderOpen aria-hidden="true" />} onClick={onBrowse}>
          {t("wizard.browse")}
        </Button>
      </div>
    </Input.Root>
  );
}

function problemKey(i18n: ReturnType<typeof useI18n>, problem?: string, reason?: string): string {
  if (!problem) return "";
  return i18n.has(`error.${problem}.${reason}`) ? `error.${problem}.${reason}` : `error.${problem}`;
}

/** DLG-18 Mover staging: preview of space, purge and deploy. */
function MoveStagingDialog({ instance, game, onClose }: { instance: string; game: ManagedGame; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const suggest = useSuggestion(game, (f) => f.suggestedStaging || f.staging);
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<StagingPreview | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!path.trim()) return;
    const timer = setTimeout(() => {
      backend.previewMoveStaging(instance, path).then(setPreview, (e: unknown) => setError(toUIError(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [backend, instance, path]);

  const browse = async () => {
    const picked = await run(() => backend.pickFolder(t("settings.mods.pickStaging")), { quiet: true });
    if (picked.ok && picked.value) setPath(picked.value);
  };
  const move = async () => {
    setBusy(true);
    const result = await run(() => backend.moveStaging(instance, path), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  const problem = problemKey(i18n, preview?.problem, preview?.reason);

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("settings.mods.moveTitle")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <FolderField label={t("settings.mods.newStaging")} value={path} onChange={setPath} onBrowse={() => void browse()} onSuggest={() => void suggest().then(setPath)} />
            {preview && !preview.problem ? (
              <Stack gap="xs">
                <Typography variant="body-sm">{t("settings.mods.moveSize", { size: formatBytes(preview.bytes) })}</Typography>
                <Typography variant="body-sm" color="muted-fg">
                  {t(preview.sameVolume ? "settings.mods.moveSameVolume" : "settings.mods.moveCopy")}
                </Typography>
                {preview.deployed ? <Typography variant="body-sm" color="muted-fg">{t("settings.mods.moveDeployed")}</Typography> : null}
                {!preview.hardlinkAfter ? (
                  <Alert.Root variant="warning">
                    <Alert.Description>{t("settings.mods.moveNoHardlink")}</Alert.Description>
                  </Alert.Root>
                ) : null}
              </Stack>
            ) : null}
            {problem ? (
              <Alert.Root variant="danger">
                <Alert.Description>{t(problem as MessageKey, { folder: preview?.to ?? "", reason: preview?.reason ?? "" })}</Alert.Description>
              </Alert.Root>
            ) : null}
            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !preview || Boolean(preview.problem)} onClick={() => void move()}>
            {t("settings.mods.move")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** Move the ArchiveStore (core/13 mods.archiveStorePath: "mudar = mover archives"). */
function MoveArchivesDialog({ instance, game, onClose }: { instance: string; game: ManagedGame; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const suggest = useSuggestion(game, (f) => f.archiveStore);
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<ArchivesPreview | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!path.trim()) return;
    const timer = setTimeout(() => {
      backend.previewMoveArchives(instance, path).then(setPreview, (e: unknown) => setError(toUIError(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [backend, instance, path]);

  const browse = async () => {
    const picked = await run(() => backend.pickFolder(t("settings.mods.pickArchives")), { quiet: true });
    if (picked.ok && picked.value) setPath(picked.value);
  };
  const move = async () => {
    setBusy(true);
    const result = await run(() => backend.moveArchiveStore(instance, path), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  const problem = problemKey(i18n, preview?.problem, preview?.reason);

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("settings.mods.moveArchivesTitle")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <FolderField label={t("settings.mods.newArchives")} value={path} onChange={setPath} onBrowse={() => void browse()} onSuggest={() => void suggest().then(setPath)} />
            {preview && !preview.problem ? (
              <Stack gap="xs">
                <Typography variant="body-sm">{t("settings.mods.moveArchivesSize", { size: formatBytes(preview.bytes) })}</Typography>
                <Typography variant="body-sm" color="muted-fg">
                  {t(preview.sameVolume ? "settings.mods.moveSameVolume" : "settings.mods.moveCopy")}
                </Typography>
              </Stack>
            ) : null}
            {problem ? (
              <Alert.Root variant="danger">
                <Alert.Description>{t(problem as MessageKey, { folder: preview?.to ?? "", reason: preview?.reason ?? "" })}</Alert.Description>
              </Alert.Root>
            ) : null}
            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !preview || Boolean(preview.problem)} onClick={() => void move()}>
            {t("settings.mods.move")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** DLG-18 Trocar método: purge with the old method, deploy with the new. */
function ChangeMethodDialog({ instance, method, onClose }: { instance: string; method: DeployMethod; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UIError | null>(null);
  const change = async () => {
    setBusy(true);
    const result = await run(() => backend.changeDeployMethod(instance, method.method), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("settings.mods.methodTitle", { method: t(`deploy.method.${method.method}` as MessageKey) })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm">{t("settings.mods.methodExplain")}</Typography>
            {method.method === "copy" ? (
              <Alert.Root variant="info">
                <Alert.Description>{t("settings.mods.methodCopyNote")}</Alert.Description>
              </Alert.Root>
            ) : null}
            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void change()}>
            {t("settings.mods.useMethod")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
