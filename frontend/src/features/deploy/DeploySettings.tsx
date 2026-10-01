import { useEffect, useState } from "react";
import { FolderInput, FolderOpen } from "lucide-react";
import { Alert, Badge, Button, Input, Modal, Spinner, Stack, Switch, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import { useDeployMethods, useInstanceDetails, useInstanceSettings } from "../../bridge/queries";
import type { DeployMethod, Setting, StagingPreview } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { formatBytes } from "./deploy-labels";

/**
 * Settings › Mods of the active game (ui/telas/settings-extensions.md):
 * folders and deploy. Paths and the method are not edited in place: they
 * open DLG-18, an operation with preview (purge, change, deploy again).
 */
export function DeploySettings({ instance }: { instance: string }) {
  const { t } = useI18n();
  const details = useInstanceDetails(instance);
  const methods = useDeployMethods(instance);
  const settings = useInstanceSettings(instance);
  const [moving, setMoving] = useState(false);
  const [method, setMethod] = useState<DeployMethod | null>(null);

  if (details.status === "loading" || methods.status === "loading") return <Spinner label={t("common.loading")} />;
  if (details.status === "error") return <ErrorAlert title="games.loadError" error={details.error} onRetry={details.reload} />;
  if (methods.status === "error") return <ErrorAlert title="settings.loadError" error={methods.error} onRetry={methods.reload} />;
  if (details.status !== "ready" || methods.status !== "ready") return null;

  return (
    <Stack gap="lg" className="max-w-2xl">
      <section aria-labelledby="settings-folders" className="rounded-xl border border-border bg-surface p-4">
        <Stack gap="sm">
          <Typography id="settings-folders" variant="heading-6">
            {t("settings.mods.folders")}
          </Typography>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <Typography variant="body-sm" color="muted-fg">
                {t("games.details.staging")}
              </Typography>
              <p className="break-all font-mono text-xs text-fg">{details.data.staging}</p>
            </div>
            <Button variant="outline" size="sm" startIcon={<FolderInput aria-hidden="true" />} onClick={() => setMoving(true)}>
              {t("settings.mods.moveStaging")}
            </Button>
          </div>
        </Stack>
      </section>

      <section aria-labelledby="settings-deploy" className="rounded-xl border border-border bg-surface p-4">
        <Stack gap="sm">
          <Typography id="settings-deploy" variant="heading-6">
            {t("settings.mods.deploy")}
          </Typography>
          <Typography variant="body-sm" color="muted-fg">
            {t("settings.mods.methodHelp")}
          </Typography>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {methods.data.map((m) => (
              <li key={m.method} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Typography variant="body-sm" className="font-medium">
                    {t(`deploy.method.${m.method}` as MessageKey)}
                  </Typography>
                  <Typography variant="caption" color="muted-fg">
                    {m.available ? t(`settings.mods.methodAbout.${m.method}` as MessageKey) : t(`deploy.methodReason.${m.reason ?? "unknown"}` as MessageKey)}
                  </Typography>
                </div>
                {m.preferred ? (
                  <Badge tone="success">{t("settings.mods.inUse")}</Badge>
                ) : m.available ? (
                  <Button size="sm" variant="outline" onClick={() => setMethod(m)}>
                    {t("settings.mods.useMethod")}
                  </Button>
                ) : (
                  <Badge variant="muted">{t("settings.mods.unavailable")}</Badge>
                )}
              </li>
            ))}
          </ul>
          {settings.status === "ready" ? settings.data.map((s) => <InstanceSwitch key={s.key} instance={instance} setting={s} onSaved={settings.reload} />) : null}
        </Stack>
      </section>

      {moving ? <MoveStagingDialog instance={instance} onClose={() => setMoving(false)} /> : null}
      {method ? <ChangeMethodDialog instance={instance} method={method} onClose={() => setMethod(null)} /> : null}
    </Stack>
  );
}

function InstanceSwitch({ instance, setting, onSaved }: { instance: string; setting: Setting; onSaved: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const label = `settings.${setting.key}.label`;
  const description = `settings.${setting.key}.description`;
  return (
    <Switch
      checked={setting.value === "true"}
      label={i18n.has(label) ? t(label) : setting.key}
      description={i18n.has(description) ? t(description) : undefined}
      onCheckedChange={(on) =>
        void run(() => backend.setInstanceSetting(instance, setting.key, String(on))).then((r) => {
          if (r.ok) onSaved();
        })
      }
    />
  );
}

/** DLG-18 Mover staging: preview of space, purge and deploy. */
function MoveStagingDialog({ instance, onClose }: { instance: string; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
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
  const problem = preview?.problem ? (i18n.has(`error.${preview.problem}.${preview.reason}`) ? `error.${preview.problem}.${preview.reason}` : `error.${preview.problem}`) : "";

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("settings.mods.moveTitle")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Input.Root fullWidth value={path} onChange={(v: string) => setPath(v)}>
              <Input.Label>{t("settings.mods.newStaging")}</Input.Label>
              <div className="flex gap-2">
                <Input.Box className="flex-1">
                  <Input.Field />
                </Input.Box>
                <Button variant="outline" startIcon={<FolderOpen aria-hidden="true" />} onClick={() => void browse()}>
                  {t("wizard.browse")}
                </Button>
              </div>
            </Input.Root>
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
