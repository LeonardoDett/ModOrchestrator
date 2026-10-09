import { useEffect, useState } from "react";
import { AlertTriangle, ArchiveRestore, DatabaseZap, FileText, FolderOpen, Power, RotateCcw } from "lucide-react";
import { Accordion, Alert, Badge, Button, Card, FeaturedIcon, Modal, Radio, Spinner, Stack, Typography } from "dettmann-ui";
import type { Backend, RecoveryBackup, StartupRecovery } from "../../bridge/types";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { formatBytes } from "../deploy/deploy-labels";

/**
 * Recovery screen (core/14 §5): the database could not be used, so the
 * shell does not open. The user restores a validated backup (recommended),
 * or starts from scratch with the database set aside; both restart the
 * app. Nothing outside the data folder is touched, and the screen says so.
 */
export function RecoveryScreen({ backend, recovery }: { backend: Backend; recovery: StartupRecovery }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [backups, setBackups] = useState<RecoveryBackup[] | null>(null);
  const [loadError, setLoadError] = useState<UIError | null>(null);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UIError | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const reason = recovery.reason || "startup_failed";

  const load = () => {
    setLoadError(null);
    backend.recoveryBackups().then(
      (list) => {
        setBackups(list);
        setChosen((c) => c || (list.find((b) => b.valid)?.id ?? ""));
      },
      (e: unknown) => setLoadError(toUIError(e)),
    );
  };
  useEffect(load, [backend]);

  const act = async (call: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await call(); // the app restarts
    } catch (e) {
      setError(toUIError(e));
      setBusy(false);
    }
  };

  const valid = backups?.filter((b) => b.valid) ?? [];

  return (
    <main className="flex min-h-screen justify-center bg-page p-6 text-fg">
      {/* my-auto centers without clipping the top when the window is short. */}
      <Card.Root className="my-auto w-full max-w-2xl">
        <Card.Header>
          <Stack gap="sm">
            <FeaturedIcon icon={DatabaseZap} color="warning" className="self-start" />
            {/* The page's only heading of level 1: the window shows nothing else. */}
            <Typography variant="heading-4" as="h1" color="fg">
              {t(`recovery.title.${reason}` as MessageKey)}
            </Typography>
            <Typography variant="body-sm" color="muted-fg">
              {t(`recovery.reason.${reason}` as MessageKey)}
            </Typography>
          </Stack>
        </Card.Header>
        <Card.Body>
          <Stack gap="lg">
            <Alert.Root variant="info">
              <Alert.Description>{t("recovery.safe")}</Alert.Description>
            </Alert.Root>

            <section aria-labelledby="recovery-backups">
              <Stack gap="sm">
                <Typography variant="heading-6" id="recovery-backups">
                  {t("recovery.backups.title")}
                </Typography>
                {backups === null && !loadError ? <Spinner label={t("common.loading")} /> : null}
                {loadError ? (
                  <Alert.Root variant="danger">
                    <Alert.Description>{errorMessage(i18n, loadError)}</Alert.Description>
                  </Alert.Root>
                ) : null}
                {backups && backups.length === 0 ? (
                  <Typography variant="body-sm" color="muted-fg">
                    {t("recovery.backups.none")}
                  </Typography>
                ) : null}
                {backups && backups.length > 0 ? (
                  <Radio.Group name="recovery-backup" value={chosen} onValueChange={setChosen} aria-label={t("recovery.backups.title")}>
                    <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                      {backups.map((b) => (
                        <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                          <Radio.Item value={b.id} label={i18n.formatAbsolute(b.at)} disabled={!b.valid || busy} />
                          <Badge variant="outline">{t(`settings.backups.kind.${b.kind}` as MessageKey)}</Badge>
                          {!b.valid ? <Badge tone="danger">{t("recovery.backups.invalid")}</Badge> : null}
                          <span className="flex-1" />
                          <Typography variant="caption" color="muted-fg">
                            {formatBytes(b.size)}
                          </Typography>
                        </li>
                      ))}
                    </ul>
                  </Radio.Group>
                ) : null}
                <Typography variant="caption" color="muted-fg">
                  {t("recovery.backups.consequence")}
                </Typography>
                <div>
                  <Button
                    startIcon={<ArchiveRestore aria-hidden="true" />}
                    disabled={busy || !chosen || valid.length === 0}
                    onClick={() => void act(() => backend.recoveryRestore(chosen))}
                  >
                    {t("recovery.backups.restore")}
                  </Button>
                </div>
              </Stack>
            </section>

            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}

            <section aria-labelledby="recovery-other">
              <Stack gap="sm">
                <Typography variant="heading-6" id="recovery-other">
                  {t("recovery.other.title")}
                </Typography>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" startIcon={<FolderOpen aria-hidden="true" />} onClick={() => void backend.recoveryOpenFolder("backups").catch(() => {})}>
                    {t("recovery.other.openBackups")}
                  </Button>
                  <Button variant="outline" startIcon={<FileText aria-hidden="true" />} onClick={() => void backend.recoveryOpenFolder("logs").catch(() => {})}>
                    {t("recovery.other.openLogs")}
                  </Button>
                  <Button variant="outline" tone="danger" startIcon={<RotateCcw aria-hidden="true" />} disabled={busy} onClick={() => setConfirmFresh(true)}>
                    {t("recovery.fresh.action")}
                  </Button>
                  <Button variant="ghost" startIcon={<Power aria-hidden="true" />} disabled={busy} onClick={() => void backend.recoveryQuit()}>
                    {t("recovery.other.quit")}
                  </Button>
                </div>
              </Stack>
            </section>

            <Accordion.Root>
              <Accordion.Item value="detail">
                <Accordion.Trigger value="detail">{t("recovery.detail")}</Accordion.Trigger>
                <Accordion.Content value="detail">
                  <Stack gap="xs">
                    <code className="break-all font-mono text-xs text-fg">{recovery.detail}</code>
                    <Typography variant="caption" color="muted-fg">
                      {t("recovery.dataDir", { path: recovery.dataDir })}
                    </Typography>
                  </Stack>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </Stack>
        </Card.Body>
      </Card.Root>

      {confirmFresh ? (
        <Modal.Root open onOpenChange={(open) => !open && !busy && setConfirmFresh(false)}>
          <Modal.Content size="md" aria-describedby={undefined}>
            <Modal.Header>
              <Modal.Title>{t("recovery.fresh.title")}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Alert.Root variant="warning">
                <Alert.Title>
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                    {t("settings.backups.consequencesTitle")}
                  </span>
                </Alert.Title>
                <Alert.Description>
                  <ul className="list-disc pl-5">
                    <li>{t("recovery.fresh.kept")}</li>
                    <li>{t("recovery.fresh.folders")}</li>
                    <li>{t("recovery.fresh.setup")}</li>
                  </ul>
                </Alert.Description>
              </Alert.Root>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmFresh(false)}>
                {t("common.cancel")}
              </Button>
              <Button tone="danger" disabled={busy} onClick={() => void act(() => backend.recoveryStartFresh())}>
                {t("recovery.fresh.confirm")}
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      ) : null}
    </main>
  );
}
