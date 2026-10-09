import { useState } from "react";
import { DownloadIcon, RefreshIcon } from "dettmann-ui/icons";
import { Alert, Badge, Button, Modal, Progress, Loader, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, type UIError } from "../../bridge/errors";
import { useUpdateStatus } from "../../bridge/queries";
import type { UpdateOffer, UpdateStatus } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { formatBytes } from "../deploy/deploy-labels";
import { useAction } from "../games/use-action";
import { AppSettingRows, SettingLine, SettingsSection } from "./SettingControls";

/**
 * Settings › Aplicação › Atualizações (plano-de-publicacao.md, etapa 6;
 * D104): the opt-in check (off by default, the only network access of
 * V1), the channel, "Verificar agora" and the offered version with its
 * notes. What is offered, the checksum and signature checks and whether an
 * operation blocks the install are the backend's; this only shows them.
 */
export function UpdateSection() {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const status = useUpdateStatus();
  const [open, setOpen] = useState(false);
  const st = status.status === "ready" ? status.data : null;

  return (
    <SettingsSection id="updates" title={t("settings.section.updates")} description={t("settings.updates.description")}>
      <AppSettingRows keys={["app.updateCheck", "app.updateChannel"]} />
      {st ? (
        <SettingLine label={t("settings.updates.installed", { version: st.installed })} description={statusLine(i18n, st)}>
          {st.checking ? <Loader label={t("settings.updates.checking")} /> : null}
          <Button
            size="sm"
           
            disabled={!st.enabled || st.checking || st.installing || st.launched}
            title={!st.enabled ? t("settings.updates.disabledHint") : undefined}
            startIcon={<RefreshIcon size="sm" />}
            onClick={() => void run(() => backend.checkForUpdate())}
          >
            {t("settings.updates.check")}
          </Button>
        </SettingLine>
      ) : null}
      {st?.offer ? (
        <SettingLine
          label={t("settings.updates.available", { version: st.offer.version })}
          badge={<Badge intent="brand" size="sm">{t("settings.updates.new")}</Badge>}
          description={st.offer.published ? t("settings.updates.published", { date: i18n.formatDateTime(st.offer.published) }) : undefined}
        >
          <Button emphasis="high" size="sm" startIcon={<DownloadIcon size="sm" />} disabled={!st.enabled || st.launched} onClick={() => setOpen(true)}>
            {t("settings.updates.review")}
          </Button>
        </SettingLine>
      ) : null}
      {open && st?.offer ? <UpdateDialog status={st} offer={st.offer} onClose={() => setOpen(false)} /> : null}
    </SettingsSection>
  );
}

function statusLine(i18n: ReturnType<typeof useI18n>, st: UpdateStatus): string {
  const { t } = i18n;
  if (!st.enabled) return t("settings.updates.off");
  if (st.checking) return t("settings.updates.checking");
  if (st.checkError) return t("settings.updates.failed", { reason: errorMessage(i18n, { code: st.checkError.code, params: st.checkError.params ?? {} }) });
  if (!st.checkedAt) return t("settings.updates.never");
  const when = i18n.formatDateTime(st.checkedAt);
  return st.offer ? t("settings.updates.checkedFound", { when }) : t("settings.updates.upToDate", { when });
}

/**
 * The notes of every newer version before installing, and the install
 * itself: download, checksum and signature checks happen in the backend,
 * then the installer opens and the app closes.
 */
function UpdateDialog({ status, offer, onClose }: { status: UpdateStatus; offer: UpdateOffer; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [error, setError] = useState<UIError | null>(null);
  const busy = status.installing || status.launched;

  const install = async () => {
    setError(null);
    const result = await run(() => backend.installUpdate(offer.version), { quiet: true });
    if (!result.ok) setError(result.error);
  };

  return (
    <Modal.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("settings.updates.dialogTitle", { version: offer.version })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm" color="muted-fg">
              {t("settings.updates.dialogIntro", { installed: status.installed, size: offer.size > 0 ? formatBytes(offer.size) : "?" })}
            </Typography>
            <section aria-label={t("settings.updates.notes")} className="max-h-[45vh] overflow-auto rounded-control border border-border bg-sunken px-4 py-3">
              <Stack gap="md">
                {offer.notes.map((n) => (
                  <Stack key={n.version} gap="xs">
                    <Typography variant="heading-6">{n.version}</Typography>
                    <Typography variant="body-sm" className="whitespace-pre-wrap">
                      {n.text || t("settings.updates.noNotes")}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </section>
            <Alert.Root intent="info">
              <Alert.Description>{t("settings.updates.closeNotice")}</Alert.Description>
            </Alert.Root>
            {status.installing ? (
              <Stack gap="xs">
                <Typography variant="body-sm">{t("settings.updates.downloading")}</Typography>
                {status.total > 0 ? (
                  <Progress.Root value={status.done} max={status.total} aria-label={t("settings.updates.downloading")} />
                ) : (
                  <Loader label={t("settings.updates.downloading")} />
                )}
              </Stack>
            ) : null}
            {status.launched ? (
              <Alert.Root intent="success">
                <Alert.Description>{t("settings.updates.launched")}</Alert.Description>
              </Alert.Root>
            ) : null}
            {error ? (
              <Alert.Root intent="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button emphasis="high" disabled={busy} startIcon={<DownloadIcon size="sm" />} onClick={() => void install()}>
            {t("settings.updates.install")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
