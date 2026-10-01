import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Folder, X } from "lucide-react";
import { Alert, Button, Input, Modal, Radio, Stack, Tree, Typography, type TreeNode } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, type UIError } from "../../bridge/errors";
import type { ImportAnswer, QueueItem } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { OperationStatusBadge, operationStepLabel } from "../operations/operation-labels";

/** The visible install queue (core/00 §5, D065): one item at a time, cancellable per item. */
export function ImportQueuePanel({ items, onDecide }: { items: readonly QueueItem[]; onDecide: (item: QueueItem) => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="import-queue" className="rounded-xl border border-border bg-surface p-3">
      <Typography id="import-queue" variant="heading-6" color="fg" className="mb-2">
        {tp("mods.queue.title", items.length)}
      </Typography>
      <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
        {items.map((item) => (
          <li key={item.operationId} className="flex items-center gap-3 rounded-md px-2 py-1 text-sm hover:bg-hover">
            <OperationStatusBadge status={item.status} />
            <span className="min-w-0 flex-1 truncate text-fg" title={item.label}>
              {item.label}
            </span>
            {item.decision ? (
              <Button size="sm" tone="warning" startIcon={<AlertTriangle aria-hidden="true" />} onClick={() => onDecide(item)}>
                {t("mods.queue.decide")}
              </Button>
            ) : item.step ? (
              <span className="shrink-0 text-xs text-fg-muted">{operationStepLabel(i18n, item.step)}</span>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={!item.cancellable}
              title={item.cancellable ? undefined : t("error.operation_not_cancellable")}
              aria-label={t("mods.queue.cancel", { name: item.label })}
              onClick={() => void run(() => backend.cancelImport(item.operationId))}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function folderTree(folders: readonly string[]): TreeNode<string>[] {
  const roots: TreeNode<string>[] = [];
  const byPath = new Map<string, TreeNode<string> & { children: TreeNode<string>[] }>();
  for (const path of [...folders].sort((a, b) => a.localeCompare(b))) {
    const node = { id: path, label: path.split("/").pop() ?? path, data: path, children: [] as TreeNode<string>[] };
    byPath.set(path, node);
    const parent = path.includes("/") ? byPath.get(path.slice(0, path.lastIndexOf("/"))) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/**
 * Decision dialog of an import: duplicate/variant (DLG-04), root choice
 * (DLG-05) and the zip-bomb confirmation. It only collects the answer; the
 * backend validates it.
 */
export function ImportDecisionDialog({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const decision = item?.decision;
  const [choice, setChoice] = useState<string>("");
  const [mod, setMod] = useState("");
  const [label, setLabel] = useState("");
  const [root, setRoot] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  const isRoot = decision ? ["root_ambiguous", "root_unrecognized", "fomod_pending"].includes(decision.kind) : false;
  useEffect(() => {
    if (!decision) return;
    setChoice(decision.choices.find((c) => c !== "cancel") ?? "cancel");
    setMod(decision.duplicates[0]?.id ?? "");
    setLabel(decision.suggestedLabel ?? "");
    setRoot(decision.candidates[0] ?? "");
    setError(null);
  }, [decision]);
  const nodes = useMemo(() => folderTree(decision?.folders ?? []), [decision]);
  if (!item || !decision) return null;

  const answer = async (a: ImportAnswer) => {
    setBusy(true);
    const result = await run(() => backend.resolveImport(item.operationId, a), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  const confirm = () => {
    if (isRoot) return void answer({ choice: "root", root });
    return void answer({ choice: choice as ImportAnswer["choice"], mod, label: label.trim() });
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size={isRoot ? "xl" : "lg"} aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(`mods.decision.${decision.kind}.title`)}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm" color="muted-fg">
              {t(`mods.decision.${decision.kind}.description`, { name: item.label, ratio: decision.ratio ?? 0 })}
            </Typography>

            {decision.duplicates.length > 0 ? (
              <>
                {decision.duplicates.length > 1 ? (
                  <Input.Root fullWidth value={mod} onChange={setMod}>
                    <Input.Label>{t("mods.decision.target")}</Input.Label>
                    <Input.Select options={decision.duplicates.map((d) => ({ value: d.id, label: d.version ? `${d.name} (${d.version})` : d.name }))} />
                  </Input.Root>
                ) : (
                  <Typography variant="body-sm" color="fg">
                    {t("mods.decision.existing", { name: decision.duplicates[0]!.name })}
                  </Typography>
                )}
                <Radio.Group name="duplicate-choice" value={choice} onValueChange={setChoice}>
                  {decision.choices
                    .filter((c) => c !== "cancel")
                    .map((c) => (
                      <Radio.Item key={c} value={c} label={t(`mods.decision.choice.${c}` as MessageKey)}>
                        <Typography variant="caption" color="muted-fg">
                          {t(`mods.decision.choice.${c}.help` as MessageKey)}
                        </Typography>
                      </Radio.Item>
                    ))}
                </Radio.Group>
                {choice === "variant" ? (
                  <Input.Root fullWidth value={label} onChange={setLabel}>
                    <Input.Label>{t("mods.decision.variantLabel")}</Input.Label>
                    <Input.Box>
                      <Input.Field autoFocus />
                    </Input.Box>
                  </Input.Root>
                ) : null}
              </>
            ) : null}

            {isRoot ? (
              <>
                {decision.kind !== "root_ambiguous" ? (
                  <Alert.Root variant="warning">
                    <Alert.Description>{t(`mods.decision.${decision.kind}.warning` as MessageKey)}</Alert.Description>
                  </Alert.Root>
                ) : null}
                <Typography variant="body-sm" color="fg">
                  {t("mods.decision.chosenRoot", { root: root || t("mods.installation.archiveRoot") })}
                </Typography>
                <div className="max-h-[45vh] overflow-auto rounded-lg border border-border p-2">
                  <Tree
                    aria-label={t("mods.decision.tree")}
                    nodes={[{ id: "\u0000root", label: t("mods.installation.archiveRoot"), data: "", children: nodes }]}
                    defaultExpanded={new Set(["\u0000root", ...decision.candidates.flatMap((c) => c.split("/").map((_, i, a) => a.slice(0, i + 1).join("/")))])}
                    selectedId={root === "" ? "\u0000root" : root}
                    onSelect={(node) => setRoot((node.data as string) ?? "")}
                    renderIcon={() => <Folder aria-hidden="true" className="h-4 w-4 text-fg-muted" />}
                  />
                </div>
              </>
            ) : null}

            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={() => void answer({ choice: "cancel" })}>
            {t("mods.decision.cancelImport")}
          </Button>
          <Button disabled={busy || (choice === "variant" && !label.trim())} loading={busy} onClick={confirm}>
            {t(isRoot ? "mods.decision.install" : decision.kind === "suspicious_ratio" ? "mods.decision.continue" : "mods.decision.confirm")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
