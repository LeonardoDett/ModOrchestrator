import { useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "dettmann-ui/icons";
import { Alert, Button, Checkbox, DiffViewer, Input, Modal, Loader, Stack, Table, Tag, Typography, type DiffLine } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { usePluginRules } from "../../bridge/queries";
import type { LoadOrderDiff, PluginGroup, SortPreview } from "../../bridge/types";
import { toUIError, type UIError } from "../../bridge/errors";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { DialogError } from "../mods/OrderDialogs";
import { reasonText } from "./plugin-labels";

/** The label of a rule's origin: yours, imported, LOOT or another provider. */
export function ruleSourceKey(source: string) {
  switch (source) {
    case "user":
      return "plugins.rule.sourceUser" as const;
    case "import":
      return "plugins.rule.sourceImport" as const;
    case "loot":
      return "plugins.rule.sourceLoot" as const;
    default:
      return "plugins.rule.sourceOther" as const;
  }
}

/** Rules of the user and imported ones can be deleted; the others only switched off. */
export function removable(source: string) {
  return source === "user" || source === "import";
}

/** DLG-23 Regras de plugins (paridade UserlistEditor): every rule of the instance. */
export function PluginRulesDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const rules = usePluginRules(instance);
  const [plugin, setPlugin] = useState("");
  const [after, setAfter] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  if (!open) return null;
  const data = rules.status === "ready" ? rules.data : null;
  const options = (data?.plugins ?? []).map((n) => ({ value: n, label: n }));
  const add = async () => {
    const r = await run(() => backend.createPluginRule(instance, plugin, after), { quiet: true });
    if (r.ok) {
      setPlugin("");
      setAfter("");
      setError(null);
    } else setError(r.error);
  };
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("plugins.rulesDialog.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="min-h-0 overflow-auto">
          <Stack gap="md">
            <Typography variant="body-sm" color="muted-fg">
              {t("plugins.rulesDialog.help")}
            </Typography>
            <div className="flex flex-wrap items-end gap-2">
              <Input.Root value={plugin} onChange={setPlugin} className="min-w-[14rem] flex-1">
                <Input.Label>{t("plugins.rulesDialog.plugin")}</Input.Label>
                <Input.Select placeholder={t("plugins.rulesDialog.pick")} options={options} />
              </Input.Root>
              <Input.Root value={after} onChange={setAfter} className="min-w-[14rem] flex-1">
                <Input.Label>{t("plugins.rulesDialog.after")}</Input.Label>
                <Input.Select placeholder={t("plugins.rulesDialog.pick")} options={options.filter((o) => o.value !== plugin)} />
              </Input.Root>
              <Button emphasis="high" startIcon={<PlusIcon size="sm" />} disabled={!plugin || !after} onClick={() => void add()}>
                {t("plugins.rule.add")}
              </Button>
            </div>
            <DialogError error={error} />
            {rules.status === "loading" ? <Loader label={t("common.loading")} /> : null}
            {rules.status === "error" ? <ErrorAlert title="plugins.loadError" error={rules.error} onRetry={rules.reload} /> : null}
            {data && data.rules.length === 0 ? (
              <Typography variant="body-sm" color="muted-fg">
                {t("plugins.rulesDialog.empty")}
              </Typography>
            ) : null}
            {data && data.rules.length > 0 ? (
              <Table.Root aria-label={t("plugins.rulesDialog.title")}>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>{t("plugins.rulesDialog.plugin")}</Table.Head>
                    <Table.Head>{t("plugins.rulesDialog.after")}</Table.Head>
                    <Table.Head>{t("plugins.rulesDialog.source")}</Table.Head>
                    <Table.Head>
                      <span className="sr-only">{t("plugins.rulesDialog.actions")}</span>
                    </Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.rules.map((r) => (
                    <Table.Row key={r.id}>
                      <Table.Cell className="text-fg">{r.plugin}</Table.Cell>
                      <Table.Cell className="text-fg">{r.after}</Table.Cell>
                      <Table.Cell>
                        <span className="flex flex-wrap gap-1">
                          <Tag size="sm">{t(ruleSourceKey(r.source))}</Tag>
                          {r.orphan ? <Tag size="sm">{t("plugins.rule.orphan")}</Tag> : null}
                          {r.disabled ? <Tag size="sm">{t("plugins.rule.disabled")}</Tag> : null}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {removable(r.source) ? (
                          <Button size="icon-sm" emphasis="low" aria-label={t("plugins.rule.remove")} onClick={() => void run(() => backend.removePluginRule(instance, r.id))}>
                            <TrashIcon size="sm" />
                          </Button>
                        ) : (
                          // A rule of a provider (LOOT) is only switched off, so its origin stays visible (D143).
                          <Button size="sm" emphasis="low" onClick={() => void run(() => backend.setPluginRuleDisabled(instance, r.id, !r.disabled))}>
                            {t(r.disabled ? "plugins.rule.enable" : "plugins.rule.disable")}
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** DLG-24 Grupos de plugins (paridade GroupEditor, em lista na V1). */
export function PluginGroupsDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const rules = usePluginRules(instance);
  const [name, setName] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  if (!open) return null;
  const all = rules.status === "ready" ? rules.data.groups : [];
  // The user's groups are edited here; a provider's (LOOT) are listed read-only (D143).
  const groups = all.filter((g) => !g.source);
  const provided = all.filter((g) => g.source);
  const mine = new Set(groups.map((g) => g.name));
  const create = async () => {
    const r = await run(() => backend.createPluginGroup(instance, name.trim(), ["default"]), { quiet: true });
    if (r.ok) {
      setName("");
      setError(null);
    } else setError(r.error);
  };
  const toggleAfter = async (g: PluginGroup, other: string, on: boolean) => {
    const own = g.after.filter((a) => mine.has(a));
    const next = on ? [...own, other] : own.filter((a) => a !== other);
    const r = await run(() => backend.updatePluginGroup(instance, g.name, next), { quiet: true });
    setError(r.ok ? null : r.error);
  };
  const label = (g: string) => (g === "default" ? t("plugins.group.default") : g);
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("plugins.groupsDialog.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="min-h-0 overflow-auto">
          <Stack gap="md">
            <Typography variant="body-sm" color="muted-fg">
              {t("plugins.groupsDialog.help")}
            </Typography>
            <div className="flex flex-wrap items-end gap-2">
              <Input.Root value={name} onChange={setName} className="min-w-[14rem] flex-1">
                <Input.Label>{t("plugins.groupsDialog.name")}</Input.Label>
                <Input.Box>
                  <Input.Field onKeyDown={(e) => e.key === "Enter" && name.trim() && void create()} />
                </Input.Box>
              </Input.Root>
              <Button emphasis="high" startIcon={<PlusIcon size="sm" />} disabled={!name.trim()} onClick={() => void create()}>
                {t("plugins.groupsDialog.create")}
              </Button>
            </div>
            {/* A cycle is refused by the backend and shown here, inline (ui/telas/plugins.md §6). */}
            <DialogError error={error} />
            {rules.status === "loading" ? <Loader label={t("common.loading")} /> : null}
            {rules.status === "error" ? <ErrorAlert title="plugins.loadError" error={rules.error} onRetry={rules.reload} /> : null}
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.name} className="rounded-control border border-border bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <Typography variant="body-sm" color="fg" className="flex-1 font-medium">
                      {label(g.name)}
                    </Typography>
                    <Typography variant="caption" color="muted-fg">
                      {t("plugins.groupsDialog.members", { count: g.plugins.length })}
                    </Typography>
                    {!g.default ? (
                      <Button size="icon-sm" emphasis="low" aria-label={t("plugins.groupsDialog.delete", { name: g.name })} onClick={() => void run(() => backend.deletePluginGroup(instance, g.name))}>
                        <TrashIcon size="sm" />
                      </Button>
                    ) : null}
                  </div>
                  {groups.length > 1 ? (
                    <fieldset className="mt-2 flex flex-wrap gap-3">
                      <legend className="mb-1 text-xs text-fg-muted">{t("plugins.groupsDialog.after")}</legend>
                      {groups
                        .filter((o) => o.name !== g.name)
                        .map((o) => (
                          <Checkbox key={o.name} checked={g.after.includes(o.name)} onCheckedChange={(on) => void toggleAfter(g, o.name, on)} label={label(o.name)} />
                        ))}
                    </fieldset>
                  ) : null}
                  {g.after.some((a) => !mine.has(a)) ? (
                    <Typography variant="caption" color="muted-fg" className="mt-2 block">
                      {t("plugins.groupsDialog.providerAfter", { groups: g.after.filter((a) => !mine.has(a)).join(", ") })}
                    </Typography>
                  ) : null}
                  {g.plugins.length > 0 ? (
                    <Typography variant="caption" color="muted-fg" className="mt-2 block">
                      {g.plugins.join(", ")}
                    </Typography>
                  ) : null}
                </li>
              ))}
            </ul>
            {provided.length > 0 ? (
              <section aria-label={t("plugins.groupsDialog.provided")} className="flex flex-col gap-2">
                <Typography variant="heading-6">{t("plugins.groupsDialog.provided")}</Typography>
                <Typography variant="body-sm" color="muted-fg">
                  {t("plugins.groupsDialog.providedHelp")}
                </Typography>
                <ul className="flex flex-col divide-y divide-border rounded-control border border-border bg-surface">
                  {provided.map((g) => (
                    <li key={g.name} className="flex flex-col gap-0.5 px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Typography variant="body-sm" color="fg" className="flex-1 font-medium">
                          {g.name}
                        </Typography>
                        <Tag size="sm">{t(ruleSourceKey(g.source))}</Tag>
                        <Typography variant="caption" color="muted-fg">
                          {t("plugins.groupsDialog.members", { count: g.plugins.length })}
                        </Typography>
                      </span>
                      {g.after.length > 0 ? (
                        <Typography variant="caption" color="muted-fg">
                          {t("plugins.groupsDialog.afterList", { groups: g.after.map(label).join(", ") })}
                        </Typography>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** DLG-25 Prévia de sort: the moves and why, confirmed before applying. */
export function SortPreviewDialog({ preview, onConfirm, onClose }: { preview: SortPreview | null; onConfirm: () => void; onClose: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  if (!preview) return null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("loadOrder.preview.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="min-h-0 overflow-auto">
          <Stack gap="md">
            <Typography variant="body-sm" color="fg">
              {tp("loadOrder.preview.summary", preview.moves.length)}
            </Typography>
            <Table.Root aria-label={t("loadOrder.preview.title")}>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("loadOrder.column.plugin")}</Table.Head>
                  <Table.Head>{t("loadOrder.preview.move")}</Table.Head>
                  <Table.Head>{t("loadOrder.preview.because")}</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {preview.moves.map((m) => (
                  <Table.Row key={m.plugin}>
                    <Table.Cell className="text-fg">{m.plugin}</Table.Cell>
                    <Table.Cell className="tabular-nums">{t("loadOrder.preview.fromTo", { from: m.from, to: m.to })}</Table.Cell>
                    <Table.Cell className="text-sm text-fg-muted">
                      {m.because.length > 0 ? m.because.map((r) => reasonText(i18n, r)).join("; ") : t("loadOrder.preview.shifted")}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button emphasis="high" onClick={onConfirm}>{t("loadOrder.preview.apply")}</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

function diffLines(diff: LoadOrderDiff): DiffLine[] {
  const text = (l: { name: string; enabled: boolean }) => `${l.enabled ? "*" : ""}${l.name}`;
  const lines: DiffLine[] = [];
  const n = Math.max(diff.desired.length, diff.applied.length);
  for (let i = 0; i < n; i++) {
    const left = diff.desired[i];
    const right = diff.applied[i];
    const kind = !left ? "added" : !right ? "removed" : text(left) === text(right) ? "same" : "changed";
    lines.push({
      id: String(i),
      kind,
      left: left ? { lineNumber: i + 1, text: text(left) } : undefined,
      right: right ? { lineNumber: i + 1, text: text(right) } : undefined,
    });
  }
  return lines;
}

/** "Comparar com aplicada": the profile's load order against the game's file. */
export function CompareDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const [diff, setDiff] = useState<LoadOrderDiff | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  useEffect(() => {
    if (!open) return;
    setDiff(null);
    setError(null);
    backend.loadOrderDiffApplied(instance).then(setDiff, (e: unknown) => setError(toUIError(e)));
  }, [open, backend, instance]);
  if (!open) return null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("loadOrder.compare.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="min-h-0 overflow-auto">
          {error ? <ErrorAlert title="plugins.loadError" error={error} /> : null}
          {!diff && !error ? <Loader label={t("common.loading")} /> : null}
          {diff ? (
            <DiffViewer
              lines={diffLines(diff)}
              leftTitle={t("loadOrder.compare.desired")}
              rightTitle={diff.exists ? t("loadOrder.compare.applied") : t("loadOrder.compare.noFile")}
              empty={t("loadOrder.compare.empty")}
            />
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * Triage of a load order file changed outside the app (D040, core/09 §4
 * `load_order`): import it into the profile or restore the profile's. The
 * comparison shows both sides; nothing is written before the choice.
 */
export function ExternalLoadOrderDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [diff, setDiff] = useState<LoadOrderDiff | null>(null);
  const [choice, setChoice] = useState<"restore_load_order" | "import_load_order">("restore_load_order");
  useEffect(() => {
    if (open) backend.loadOrderDiffApplied(instance).then(setDiff, () => setDiff(null));
  }, [open, backend, instance]);
  if (!open) return null;
  const apply = async () => {
    const r = await run(() => backend.resolveLoadOrderChange(instance, choice), { success: "loadOrder.review.done" });
    if (r.ok) onClose();
  };
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("loadOrder.review.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="min-h-0 overflow-auto">
          <Stack gap="md">
            <Alert.Root intent="warning">
              <Alert.Description>{t("loadOrder.review.description")}</Alert.Description>
            </Alert.Root>
            <Input.Root value={choice} onChange={(v: string) => setChoice(v as typeof choice)}>
              <Input.Label>{t("loadOrder.review.action")}</Input.Label>
              <Input.Select
                options={[
                  { value: "restore_load_order", label: t("loadOrder.review.restore") },
                  { value: "import_load_order", label: t("loadOrder.review.import") },
                ]}
              />
            </Input.Root>
            <Typography variant="body-sm" color="muted-fg">
              {t(choice === "restore_load_order" ? "loadOrder.review.restoreHelp" : "loadOrder.review.importHelp")}
            </Typography>
            {diff ? <DiffViewer lines={diffLines(diff)} leftTitle={t("loadOrder.compare.desired")} rightTitle={t("loadOrder.compare.external")} /> : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button emphasis="high" onClick={() => void apply()}>{t("loadOrder.review.apply")}</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** "Importar ordem…": a pasted list passes through the engine. */
export function ImportOrderDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [text, setText] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  const [moved, setMoved] = useState<number | null>(null);
  if (!open) return null;
  const submit = async () => {
    const r = await run(() => backend.importLoadOrder(instance, text), { quiet: true });
    if (r.ok) {
      setMoved(r.value.moved);
      setError(null);
    } else setError(r.error);
  };
  const close = () => {
    setText("");
    setMoved(null);
    setError(null);
    onClose();
  };
  return (
    <Modal.Root open onOpenChange={(o) => !o && close()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("loadOrder.import.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Input.Root fullWidth value={text} onChange={setText}>
              <Input.Label>{t("loadOrder.import.label")}</Input.Label>
              <Input.Textarea autoFocus rows={10} />
            </Input.Root>
            <Typography variant="caption" color="muted-fg">
              {t("loadOrder.import.help")}
            </Typography>
            <DialogError error={error} />
            {moved !== null ? (
              <Alert.Root intent="success">
                <Alert.Description>{tp("loadOrder.import.done", moved)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={close}>
            {t("common.close")}
          </Button>
          <Button emphasis="high" disabled={!text.trim()} onClick={() => void submit()}>
            {t("loadOrder.import.apply")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
