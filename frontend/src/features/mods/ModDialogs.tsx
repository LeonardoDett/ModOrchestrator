import { useEffect, useState } from "react";
import { TrashIcon } from "dettmann-ui/icons";
import { Alert, Button, Checkbox, Modal, Loader, Stack } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import type { RemovalPreview } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";

/** DLG-07: remove mods, optionally with their archives (core/02 §7). */
export function RemoveModsDialog({ instance, ids, onClose }: { instance: string; ids: string[] | null; onClose: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [preview, setPreview] = useState<RemovalPreview | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [withArchives, setWithArchives] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPreview(null);
    setError(null);
    setWithArchives(false);
    if (!ids) return;
    backend.previewModRemoval(instance, ids).then(setPreview, (e: unknown) => setError(toUIError(e)));
  }, [backend, instance, ids]);
  if (!ids) return null;

  const remove = async () => {
    setBusy(true);
    const result = await run(() => backend.removeMods(instance, ids, withArchives), { quiet: true, success: "mods.removed" });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{tp("mods.remove.title", ids.length)}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            {preview ? (
              <>
                <ul className="max-h-40 list-disc overflow-auto pl-5 text-sm text-fg">
                  {preview.mods.map((m) => (
                    <li key={m.id}>{m.version ? `${m.name} (${m.version})` : m.name}</li>
                  ))}
                </ul>
                <Checkbox checked={withArchives} onCheckedChange={setWithArchives} label={t("mods.remove.withArchives")} />
                {withArchives && preview.sharedArchives.length > 0 ? (
                  <Alert.Root intent="info">
                    <Alert.Description>{t("mods.remove.sharedArchives", { names: preview.sharedArchives.join(", ") })}</Alert.Description>
                  </Alert.Root>
                ) : null}
                {preview.orphanRules > 0 ? (
                  <Alert.Root intent="warning">
                    <Alert.Description>{tp("mods.remove.orphanRules", preview.orphanRules)}</Alert.Description>
                  </Alert.Root>
                ) : null}
              </>
            ) : error ? null : (
              <Loader label={t("common.loading")} />
            )}
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
          <Button emphasis="high" intent="danger" disabled={busy || !preview} loading={busy} startIcon={<TrashIcon size="sm" />} onClick={() => void remove()}>
            {t("mods.action.remove")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
