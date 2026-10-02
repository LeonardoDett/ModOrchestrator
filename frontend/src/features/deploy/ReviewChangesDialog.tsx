import { useEffect, useState } from "react";
import { Modal, Spinner } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { toUIError, type UIError } from "../../bridge/errors";
import type { ExternalChanges, ExternalDecision } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { ExternalChangesDialog } from "./ExternalChangesDialog";

/**
 * Review of external changes outside a deploy (core/09 §6, diagnostic
 * external_changes_pending "Revisar"): the backend scans again, the user
 * decides in DLG-15, and the decisions run as a deploy (D080).
 */
export function ReviewChangesDialog({ instance, onClose }: { instance: string; onClose: () => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [scan, setScan] = useState<ExternalChanges | null>(null);
  const [loadError, setLoadError] = useState<UIError | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backend.verifyDeployment(instance).then(setScan, (e: unknown) => setLoadError(toUIError(e)));
  }, [backend, instance]);

  const apply = async (decisions: ExternalDecision[]) => {
    setBusy(true);
    const result = await run(() => backend.resolveExternalChanges(instance, decisions), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  if (!scan) {
    return (
      <Modal.Root open onOpenChange={(open) => !open && onClose()}>
        <Modal.Content size="md" aria-describedby={undefined}>
          <Modal.Header>
            <Modal.Title>{t("external.title")}</Modal.Title>
          </Modal.Header>
          <Modal.Body>{loadError ? <ErrorAlert title="external.loadError" error={loadError} /> : <Spinner label={t("common.loading")} />}</Modal.Body>
        </Modal.Content>
      </Modal.Root>
    );
  }
  return (
    <ExternalChangesDialog
      instance={instance}
      changes={scan.changes}
      changeCount={scan.changeCount}
      newFileCount={scan.newFileCount}
      mode="review"
      busy={busy}
      error={error}
      onApply={(d) => void apply(d)}
      onCancel={onClose}
    />
  );
}
