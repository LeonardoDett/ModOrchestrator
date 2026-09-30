import { Button, Spinner, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useOperations } from "../../bridge/queries";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "./use-action";

/** Kind of the full game search operation (internal/core/application/games). */
const SCAN_KIND = "games.scan";

/**
 * Progress footer of the full search (Vortex ProgressFooter): shown while the
 * search operation runs, with Cancel. It reads the operation from the backend;
 * nothing is kept here.
 */
export function ScanFooter() {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const ops = useOperations(20);
  if (ops.status !== "ready") return null;
  const scan = ops.data.find((op) => op.kind === SCAN_KIND && (op.status === "running" || op.status === "pending"));
  if (!scan) return null;
  const visited = scan.progress.current;
  return (
    <div
      role="status"
      className="sticky bottom-0 mt-6 flex items-center gap-4 rounded-xl border border-border bg-raised px-4 py-3 shadow-lg"
    >
      <Spinner size="sm" label={t("games.scan.running")} />
      <Typography variant="body-sm" color="fg" className="flex-1">
        {visited > 0 ? tp("games.scan.progress", visited) : t("games.scan.running")}
      </Typography>
      <Button size="sm" variant="outline" onClick={() => void run(() => backend.cancelOperation(scan.id), { quiet: true })}>
        {t("common.cancel")}
      </Button>
    </div>
  );
}
