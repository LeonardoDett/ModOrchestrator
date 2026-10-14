import { ListChecks } from "lucide-react";
import { PackageIcon, XIcon } from "dettmann-ui/icons";
import { Alert, Button, Icon, List, Loader, Modal, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import type { ModRow, QueueItem } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { operationStepLabel } from "../operations/operation-labels";
import { formatSize } from "./mod-labels";

/** Mods imported and not installed (archive kept, nothing queued for them). */
export function waitingMods(rows: readonly ModRow[]): ModRow[] {
  return rows.filter((r) => r.state === "imported" && !r.queued);
}

type Entry = { kind: "operation"; item: QueueItem } | { kind: "mod"; mod: ModRow };

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
  if (!open) return null;
  const entries: Entry[] = [...items.map((item) => ({ kind: "operation" as const, item })), ...waiting.map((mod) => ({ kind: "mod" as const, mod }))];
  const running = items.filter((i) => i.status === "running").length;
  const cancellable = items.filter((i) => i.cancellable);
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="xl" aria-describedby="install-queue-summary">
        <Modal.Header>
          <Modal.Title>{t("mods.queue.dialogTitle")}</Modal.Title>
          <Typography id="install-queue-summary" variant="body-sm" color="muted-fg">
            {entries.length === 0 ? t("mods.queue.empty") : t("mods.queue.summary", { waiting: entries.length - running, running })}
          </Typography>
        </Modal.Header>
        <Modal.Body className="p-0">
          {entries.length === 0 ? null : (
            <List.Root
              aria-label={t("mods.queue.list")}
              selectionMode="none"
              items={entries}
              getItemKey={(e) => (e.kind === "operation" ? e.item.operationId : e.mod.id)}
              renderItem={(e) =>
                e.kind === "operation" ? (
                  <List.Item
                    start={e.item.decision ? <Icon icon={ListChecks} size="sm" /> : e.item.status === "running" ? <Loader decorative size="xs" /> : <PackageIcon size="sm" />}
                    title={e.item.label}
                    description={
                      e.item.decision
                        ? t("mods.queue.asks")
                        : e.item.step
                          ? operationStepLabel(i18n, e.item.step)
                          : t(e.item.status === "running" ? "mods.queue.running" : "mods.queue.pending")
                    }
                    actions={
                      <>
                        {e.item.decision ? (
                          <Button size="sm" intent="warning" onClick={() => onDecide(e.item)}>
                            {t("mods.queue.choose")}
                          </Button>
                        ) : null}
                        <Button
                          size="icon-sm"
                          emphasis="low"
                          disabled={!e.item.cancellable}
                          tooltip={t("mods.queue.cancel", { name: e.item.label })}
                          aria-label={t("mods.queue.cancel", { name: e.item.label })}
                          onClick={() => void run(() => backend.cancelImport(e.item.operationId))}
                        >
                          <XIcon size="sm" />
                        </Button>
                      </>
                    }
                  />
                ) : (
                  <List.Item
                    start={<PackageIcon size="sm" />}
                    title={e.mod.name}
                    description={t("mods.queue.imported", { size: formatSize(i18n.language, e.mod.size) })}
                    actions={
                      <Button size="sm" onClick={() => void run(() => backend.installMods(instance, [e.mod.id]))}>
                        {t("mods.action.install")}
                      </Button>
                    }
                  />
                )
              }
            />
          )}
        </Modal.Body>
        <Modal.Footer className="justify-between">
          <Alert.Root intent="info" compact className="flex-1">
            <Alert.Description>{t("mods.queue.installAllHelp")}</Alert.Description>
          </Alert.Root>
          <span className="flex shrink-0 gap-2">
            <Button
              emphasis="low"
              intent="danger"
              disabled={cancellable.length === 0}
              onClick={() => void run(async () => Promise.all(cancellable.map((i) => backend.cancelImport(i.operationId))))}
            >
              {t("mods.queue.clear")}
            </Button>
            <Button
              emphasis="high"
              disabled={waiting.length === 0}
              onClick={() => void run(() => backend.installAll(instance, waiting.map((m) => m.id)), { success: "mods.queue.installAllToast" })}
            >
              {waiting.length > 0 ? tp("mods.queue.installAll", waiting.length) : t("mods.queue.installAllEmpty")}
            </Button>
          </span>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
