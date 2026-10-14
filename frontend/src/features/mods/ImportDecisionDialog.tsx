import { useEffect, useMemo, useState } from "react";
import { FolderIcon } from "dettmann-ui/icons";
import { Alert, Button, Input, Modal, Radio, Stack, Tree, Typography, type TreeNode } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, type UIError } from "../../bridge/errors";
import type { ImportAnswer, QueueItem } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { FomodWizard } from "./FomodWizard";

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
 * (DLG-05, also for scripted FOMODs), the zip-bomb confirmation and the
 * FOMOD wizard (DLG-06). It only collects the answer; the backend validates
 * it.
 */
export function ImportDecisionDialog({ instance, item, onClose }: { instance: string; item: QueueItem | null; onClose: () => void }) {
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
  const isRoot = decision ? ["root_ambiguous", "root_unrecognized", "fomod_script"].includes(decision.kind) : false;
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
  if (decision.kind === "fomod" && decision.fomod) return <FomodWizard key={item.operationId} instance={instance} item={item} onClose={onClose} />;

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
                  <Alert.Root intent="warning">
                    <Alert.Description>{t(`mods.decision.${decision.kind}.warning` as MessageKey)}</Alert.Description>
                  </Alert.Root>
                ) : null}
                <Typography variant="body-sm" color="fg">
                  {t("mods.decision.chosenRoot", { root: root || t("mods.installation.archiveRoot") })}
                </Typography>
                <div className="max-h-[45vh] overflow-auto rounded-control border border-border p-2">
                  <Tree
                    aria-label={t("mods.decision.tree")}
                    nodes={[{ id: "\u0000root", label: t("mods.installation.archiveRoot"), data: "", children: nodes }]}
                    defaultExpanded={new Set(["\u0000root", ...decision.candidates.flatMap((c) => c.split("/").map((_, i, a) => a.slice(0, i + 1).join("/")))])}
                    selectedId={root === "" ? "\u0000root" : root}
                    onSelect={(node) => setRoot((node.data as string) ?? "")}
                    renderIcon={() => <FolderIcon size="sm" className="text-fg-muted" />}
                  />
                </div>
              </>
            ) : null}

            {error ? (
              <Alert.Root intent="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button disabled={busy} onClick={() => void answer({ choice: "cancel" })}>
            {t("mods.decision.cancelImport")}
          </Button>
          <Button emphasis="high" disabled={busy || (choice === "variant" && !label.trim())} loading={busy} onClick={confirm}>
            {t(isRoot ? "mods.decision.install" : decision.kind === "suspicious_ratio" ? "mods.decision.continue" : "mods.decision.confirm")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
