import { useState } from "react";
import { AlertTriangle, ArchiveRestore, DatabaseBackup, FileWarning, FolderOpen, RefreshCw, ScanSearch, Trash2, Wrench } from "lucide-react";
import { Alert, Badge, Button, Modal, Radio, Spinner, Stack, Typography, useToast } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, type UIError } from "../../bridge/errors";
import { useBackupStatus, useDeployStatus, useWorkarounds } from "../../bridge/queries";
import type { Backup, BackupStatus, ManagedGame } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { formatBytes } from "../deploy/deploy-labels";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { GameSettingsSelect, SettingLine, SettingsSection } from "./SettingControls";

/**
 * Settings › Workarounds (core/13, core/14 §3–4, Vortex `recovery`): the
 * database backups (last automatic, last manual, last good startup; create;
 * restore from the list or from a file), the deployment checks of a game
 * and the maintenance actions. Restoring needs a restart (DLG-27).
 */
export function WorkaroundsTab({ games, instance, onInstance }: { games: readonly ManagedGame[]; instance: string; onInstance: (id: string) => void }) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const status = useBackupStatus();
  const facts = useWorkarounds();
  const anyPlugins = games.some((g) => g.capabilities.includes("plugins"));

  const cleanTemp = async () => {
    const r = await run(() => backend.cleanTempFiles());
    if (r.ok) {
      addToast({ title: tp("settings.workarounds.tempDone", r.value.removed), variant: "success", duration: 3000 });
      if (r.value.skipped > 0) addToast({ title: tp("settings.workarounds.tempSkipped", r.value.skipped), variant: "warning" });
    }
  };

  return (
    <Stack gap="lg">
      <DatabaseSection status={status} />

      {games.length > 0 ? (
        <>
          <GameSettingsSelect games={games} value={instance} onChange={onInstance} />
          <DeploymentChecks instance={instance} />
        </>
      ) : null}

      <SettingsSection id="workarounds-maintenance" title={t("settings.workarounds.maintenance")}>
        <SettingLine label={t("settings.workarounds.cleanTemp.label")} description={t("settings.workarounds.cleanTemp.description")}>
          <Button size="sm" variant="outline" startIcon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void cleanTemp()}>
            {t("settings.workarounds.cleanTemp.action")}
          </Button>
        </SettingLine>
        {anyPlugins ? (
          <SettingLine label={t("settings.workarounds.headerCache.label")} description={t("settings.workarounds.headerCache.description")}>
            <Button size="sm" variant="outline" startIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.rebuildPluginHeaderCache(), { success: "settings.workarounds.headerCache.done" })}>
              {t("settings.workarounds.headerCache.action")}
            </Button>
          </SettingLine>
        ) : null}
        <SettingLine label={t("settings.workarounds.longPaths.label")} description={t("settings.workarounds.longPaths.description")}>
          {facts.status === "ready" ? (
            <Badge tone={facts.data.longPaths === "enabled" ? "success" : facts.data.longPaths === "disabled" ? "warning" : undefined} variant={facts.data.longPaths === "unknown" ? "muted" : undefined}>
              {t(`settings.workarounds.longPaths.${facts.data.longPaths}` as MessageKey)}
            </Badge>
          ) : null}
        </SettingLine>
      </SettingsSection>
    </Stack>
  );
}

function DatabaseSection({ status }: { status: ReturnType<typeof useBackupStatus> }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [dialog, setDialog] = useState<"list" | "file" | null>(null);

  let body;
  if (status.status === "loading") body = <Spinner label={t("common.loading")} />;
  else if (status.status === "error") body = <ErrorAlert title="settings.workarounds.loadError" error={status.error} onRetry={status.reload} />;
  else if (status.status === "unavailable") body = null;
  else {
    const s = status.data;
    body = (
      <>
        {s.failure ? (
          <div className="px-4 pt-3">
            <Alert.Root variant="warning">
              <Alert.Title>{t("settings.backups.failedTitle")}</Alert.Title>
              <Alert.Description>{t("settings.backups.failed", { when: i18n.formatDateTime(s.failure.at), kind: t(`settings.backups.kind.${s.failure.kind}` as MessageKey) })}</Alert.Description>
            </Alert.Root>
          </div>
        ) : null}
        {s.restorePending ? (
          <div className="px-4 pt-3">
            <Alert.Root variant="info">
              <Alert.Title>{t("settings.backups.pendingTitle")}</Alert.Title>
              <Alert.Description>
                <Stack gap="xs">
                  <span>{t("settings.backups.pending", { backup: s.restorePending })}</span>
                  <div className="flex gap-2">
                    <Button size="sm" startIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.restartApp())}>
                      {t("settings.restart.now")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void run(() => backend.cancelRestore())}>
                      {t("settings.backups.cancelRestore")}
                    </Button>
                  </div>
                </Stack>
              </Alert.Description>
            </Alert.Root>
          </div>
        ) : null}
        {s.restoredAt ? (
          <div className="px-4 pt-3">
            <Typography variant="caption" color="muted-fg">
              {t("settings.backups.restoredAt", { when: i18n.formatDateTime(s.restoredAt) })}
            </Typography>
          </div>
        ) : null}
        <SettingLine label={t("settings.backups.lastAuto")} description={t("settings.backups.autoHelp")}>
          <Typography variant="body-sm">{s.lastAuto ? i18n.formatDateTime(s.lastAuto) : t("settings.backups.never")}</Typography>
        </SettingLine>
        <SettingLine label={t("settings.backups.lastManual")}>
          <Typography variant="body-sm">{s.lastManual ? i18n.formatDateTime(s.lastManual) : t("settings.backups.never")}</Typography>
        </SettingLine>
        <SettingLine label={t("settings.backups.lastStartup")}>
          <Typography variant="body-sm">{s.lastStartup ? i18n.formatDateTime(s.lastStartup) : t("settings.backups.never")}</Typography>
        </SettingLine>
      </>
    );
  }

  return (
    <SettingsSection
      id="workarounds-database"
      title={t("settings.backups.title")}
      description={t("settings.backups.description")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" startIcon={<DatabaseBackup aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.createBackup(), { success: "settings.backups.created" })}>
            {t("settings.backups.create")}
          </Button>
          <Button size="sm" variant="outline" startIcon={<ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" />} disabled={status.status !== "ready" || status.data.backups.length === 0} onClick={() => setDialog("list")}>
            {t("settings.backups.restore")}
          </Button>
          <Button size="sm" variant="outline" startIcon={<FileWarning aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setDialog("file")}>
            {t("settings.backups.restoreFile")}
          </Button>
          <Button size="sm" variant="ghost" startIcon={<FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.openBackupsFolder())}>
            {t("settings.backups.openFolder")}
          </Button>
        </div>
      }
    >
      {body}
      {dialog && status.status === "ready" ? <RestoreDialog mode={dialog} status={status.data} onClose={() => setDialog(null)} /> : null}
    </SettingsSection>
  );
}

/**
 * DLG-27 Restaurar backup (destructive confirmation): choose a backup of
 * the list, or a database file ("perigoso"); the consequences are stated
 * before anything happens. The backend backs up the current state, checks
 * the chosen file and applies it at the next start.
 */
function RestoreDialog({ mode, status, onClose }: { mode: "list" | "file"; status: BackupStatus; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [chosen, setChosen] = useState<string>(mode === "list" ? (status.backups[0]?.id ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UIError | null>(null);

  const pickFile = async () => {
    const r = await run(() => backend.pickBackupFile(t("settings.backups.pickFile")), { quiet: true });
    if (r.ok && r.value) setChosen(r.value);
  };
  const restore = async () => {
    setBusy(true);
    const r = await run(() => (mode === "list" ? backend.restoreBackup(chosen) : backend.restoreBackupFromFile(chosen)), { quiet: true });
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(mode === "list" ? "settings.backups.restoreTitle" : "settings.backups.restoreFileTitle")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            {mode === "list" ? (
              <Radio.Group name="backup" value={chosen} onValueChange={setChosen} aria-label={t("settings.backups.list")}>
                <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {status.backups.map((b) => (
                    <BackupRow key={b.id} backup={b} />
                  ))}
                </ul>
              </Radio.Group>
            ) : (
              <Stack gap="sm">
                <Alert.Root variant="danger">
                  <Alert.Title>{t("settings.backups.fileWarningTitle")}</Alert.Title>
                  <Alert.Description>{t("settings.backups.fileWarning")}</Alert.Description>
                </Alert.Root>
                <div className="flex items-center gap-2">
                  <Button variant="outline" startIcon={<FolderOpen aria-hidden="true" />} onClick={() => void pickFile()}>
                    {t("settings.backups.chooseFile")}
                  </Button>
                  <span className="min-w-0 break-all font-mono text-xs text-fg">{chosen || t("settings.backups.noFile")}</span>
                </div>
              </Stack>
            )}
            <Alert.Root variant="warning">
              <Alert.Title>
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                  {t("settings.backups.consequencesTitle")}
                </span>
              </Alert.Title>
              <Alert.Description>
                <ul className="list-disc pl-5">
                  <li>{t("settings.backups.consequence.current")}</li>
                  <li>{t("settings.backups.consequence.restart")}</li>
                  <li>{t("settings.backups.consequence.verify")}</li>
                </ul>
              </Alert.Description>
            </Alert.Root>
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
          <Button tone="danger" disabled={busy || !chosen} onClick={() => void restore()}>
            {t("settings.backups.restoreConfirm")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

function BackupRow({ backup }: { backup: Backup }) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Radio.Item value={backup.id} label={i18n.formatAbsolute(backup.at)} />
      <Badge variant="outline">{t(`settings.backups.kind.${backup.kind}` as MessageKey)}</Badge>
      <span className="flex-1" />
      <Typography variant="caption" color="muted-fg">
        {formatBytes(backup.size)}
      </Typography>
    </li>
  );
}

/** Deployment checks of one game: verify now, reconcile when interrupted. */
function DeploymentChecks({ instance }: { instance: string }) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const status = useDeployStatus(instance);
  const interrupted = status.status === "ready" && status.data?.reason === "journal_pending";

  const verify = async () => {
    const r = await run(() => backend.verifyDeployment(instance));
    if (r.ok) {
      const n = r.value.changeCount + r.value.newFileCount;
      addToast({ title: n === 0 ? t("settings.workarounds.verifyClean") : tp("settings.workarounds.verifyFound", n), variant: n === 0 ? "success" : "warning", duration: 4000 });
    }
  };

  return (
    <SettingsSection id="workarounds-deploy" title={t("settings.workarounds.deployment")}>
      <SettingLine label={t("settings.workarounds.verify.label")} description={t("settings.workarounds.verify.description")}>
        <Button size="sm" variant="outline" startIcon={<ScanSearch aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void verify()}>
          {t("settings.workarounds.verify.action")}
        </Button>
      </SettingLine>
      {interrupted ? (
        <SettingLine label={t("settings.workarounds.reconcile.label")} description={t("settings.workarounds.reconcile.description")}>
          <Button size="sm" startIcon={<Wrench aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.reconcileDeploy(instance))}>
            {t("settings.workarounds.reconcile.action")}
          </Button>
        </SettingLine>
      ) : null}
    </SettingsSection>
  );
}
