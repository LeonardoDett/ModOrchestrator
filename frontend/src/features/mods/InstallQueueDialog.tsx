import { ListChecks } from "lucide-react";
import { InfoIcon, PackageIcon, XIcon } from "dettmann-ui/icons";
import { Button, Icon, Modal, Progress, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useOperations } from "../../bridge/queries";
import type { ModRow, QueueItem } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { operationStepLabel } from "../operations/operation-labels";
import { formatSize } from "./mod-labels";

/** Mods imported and not installed (archive kept, nothing queued for them). */
export function waitingMods(rows: readonly ModRow[]): ModRow[] {
  return rows.filter((r) => r.state === "imported" && !r.queued);
}

/** The icon square of a queue row: info while installing, warning when it asks, neutral otherwise. */
function Tile({ intent, asks }: { intent?: "info" | "warning"; asks?: boolean }) {
  return (
    <span data-intent={intent} className={`flex size-9 shrink-0 items-center justify-center rounded-control ${intent ? "bg-intent-subtle text-intent-text" : "bg-sunken text-fg-muted"}`}>
      {asks ? <Icon icon={ListChecks} size="sm" /> : <PackageIcon size="sm" />}
    </span>
  );
}

/**
 * The install queue (D065, D124, board JogoFilaInstalacao): what is
 * installing or waiting for an answer, and the mods imported but not
 * installed. "Install all" installs what needs no choice; the backend
 * leaves the mods that ask imported, without blocking the others.
 */
export function InstallQueueDialog({
  instance,
  open,
  items,
  waiting,
  onDecide,
  onClose,
}: {
  instance: string;
  open: boolean;
  items: readonly QueueItem[];
  waiting: readonly ModRow[];
  onDecide: (item: QueueItem) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const ops = useOperations(30);
  if (!open) return null;
  const running = items.filter((i) => i.status === "running").length;
  const total = items.length + waiting.length;
  const cancellable = items.filter((i) => i.cancellable);
  const asking = items.filter((i) => i.decision).length;
  const progressOf = (id: string) => {
    const op = ops.status === "ready" ? ops.data.find((o) => o.id === id) : undefined;
    return op && op.progress.total > 0 ? op.progress : undefined;
  };
  const row = (key: string, tile: React.ReactNode, name: string, detail: React.ReactNode, actions: React.ReactNode, progress?: { current: number; total: number }) => (
    <li key={key} className="grid h-16 shrink-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-border-subtle pl-6 pr-4">
      {tile}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[13px] font-medium text-fg">{name}</span>
        {progress ? <Progress.Root value={(progress.current / progress.total) * 100} intent="info" className="h-1" aria-label={name} /> : null}
        <span className="truncate text-xs">{detail}</span>
      </span>
      <span className="flex items-center gap-1.5">{actions}</span>
    </li>
  );
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="custom" className="h-[min(40rem,90vh)] w-full max-w-[47.5rem]" aria-describedby="install-queue-summary">
        <Modal.Header className="h-16 px-6 py-0 pr-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Modal.Title>{t("mods.queue.dialogTitle")}</Modal.Title>
            <Typography id="install-queue-summary" variant="caption" color="muted-fg">
              {total === 0 ? t("mods.queue.empty") : t("mods.queue.summary", { waiting: total - running, running })}
            </Typography>
          </div>
          <Button
            emphasis="high"
            disabled={waiting.length === 0}
            onClick={() => void run(() => backend.installAll(instance, waiting.map((m) => m.id)), { success: "mods.queue.installAllToast" })}
          >
            {t("mods.queue.installAllEmpty")}
          </Button>
          <Button size="icon" emphasis="low" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
            <XIcon size="sm" />
          </Button>
        </Modal.Header>
        <Modal.Body className="p-0">
          <ul aria-label={t("mods.queue.list")} className="flex flex-col">
            {items.map((item) => {
              const asks = Boolean(item.decision);
              const isRunning = item.status === "running" && !asks;
              const detail = asks ? (
                <span data-intent="warning" className="text-intent-text">
                  {t("mods.queue.asks")}
                </span>
              ) : (
                <span className="text-fg-muted">{item.step ? operationStepLabel(i18n, item.step) : t(isRunning ? "mods.queue.running" : "mods.queue.pending")}</span>
              );
              const label = isRunning ? t("mods.queue.cancel", { name: item.label }) : t("mods.queue.remove", { name: item.label });
              return row(
                item.operationId,
                <Tile intent={asks ? "warning" : isRunning ? "info" : undefined} asks={asks} />,
                item.label,
                detail,
                <>
                  {asks ? (
                    <Button intent="warning" onClick={() => onDecide(item)}>
                      {t("mods.queue.choose")}
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    emphasis="low"
                    disabled={!item.cancellable}
                    title={label}
                    aria-label={label}
                    onClick={() => void run(() => backend.cancelImport(item.operationId))}
                  >
                    <XIcon size="sm" />
                  </Button>
                </>,
                isRunning ? progressOf(item.operationId) : undefined,
              );
            })}
            {waiting.map((mod) =>
              row(
                mod.id,
                <Tile />,
                mod.name,
                <span className="text-fg-muted">{t("mods.queue.imported", { size: formatSize(i18n.language, mod.size) })}</span>,
                <Button onClick={() => void run(() => backend.installMods(instance, [mod.id]))}>{t("mods.action.install")}</Button>,
              ),
            )}
          </ul>
        </Modal.Body>
        <Modal.Footer className="h-14 min-h-0 justify-start gap-3 py-0 text-[13px] text-fg-muted">
          <span data-intent="brand" className="text-intent-text">
            <InfoIcon size="sm" />
          </span>
          <span className="flex-1">{asking > 0 ? tp("mods.queue.installAllSkips", asking) : t("mods.queue.installAllHelp")}</span>
          <Button
            emphasis="low"
            intent="danger"
            disabled={cancellable.length === 0}
            onClick={() => void run(async () => Promise.all(cancellable.map((i) => backend.cancelImport(i.operationId))))}
          >
            {t("mods.queue.clear")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
