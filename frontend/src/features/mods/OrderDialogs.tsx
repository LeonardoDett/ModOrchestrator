import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Alert, Badge, Button, Checkbox, Input, Modal, Radio, Spinner, Stack, Table, Tag, TONES, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import { useModRules, useOrderHistory } from "../../bridge/queries";
import type { EntryRef, ModOrder, ModRow, MoveRequest, MoveResult, Rule, RuleKind, RulePreview, Separator } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useAction } from "../games/use-action";

export function DialogError({ error }: { error: UIError | null }) {
  const i18n = useI18n();
  if (!error) return null;
  return (
    <Alert.Root variant="danger">
      <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
    </Alert.Root>
  );
}

/** Per-profile moves a rule change causes (core/05 §4 "mostra a prévia"). */
export function RuleMoves({ preview }: { preview: RulePreview }) {
  const { t } = useI18n();
  if (preview.profiles.length === 0) {
    return (
      <Typography variant="body-sm" color="muted-fg">
        {t("mods.rules.noMoves")}
      </Typography>
    );
  }
  return (
    <div className="flex flex-col gap-2" aria-label={t("mods.rules.previewLabel")}>
      {preview.profiles.map((p) => (
        <div key={p.profileId} className="text-sm">
          <span className="font-medium text-fg">{t("mods.rules.inProfile", { name: p.name })}</span>
          <ul className="list-disc pl-5 text-fg">
            {p.moves.map((m) => (
              <li key={m.id}>{t("mods.rules.move", { name: m.name, from: m.from, to: m.to })}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "A wins B", "A requires B"… in the UI language (D025: never "load after"). */
export function useRuleText() {
  const { t } = useI18n();
  return useCallback((r: Pick<Rule, "kind" | "a" | "b">) => t(`mods.rule.${r.kind}` as MessageKey, { a: r.a.name, b: r.b.name }), [t]);
}

/**
 * Moves through the backend; a refused position opens DLG-11 with the
 * violated rules and the alternatives (core/05 §4, ui/02 F-04).
 */
export function useMoveMods(instance: string) {
  const backend = useBackend();
  const run = useAction();
  const [refused, setRefused] = useState<{ request: MoveRequest; result: MoveResult } | null>(null);
  const move = useCallback(
    async (request: MoveRequest) => {
      const res = await run(() => backend.moveMods(instance, request));
      if (res.ok && !res.value.applied) setRefused({ request, result: res.value });
    },
    [run, backend, instance],
  );
  const dialog = <MoveRefusedDialog instance={instance} refused={refused} onClose={() => setRefused(null)} />;
  return { move, dialog };
}

/** DLG-11: the requested position breaks rules; nothing was changed. */
function MoveRefusedDialog({
  instance,
  refused,
  onClose,
}: {
  instance: string;
  refused: { request: MoveRequest; result: MoveResult } | null;
  onClose: () => void;
}) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const ruleText = useRuleText();
  if (!refused) return null;
  const { request, result } = refused;
  const apply = async (mode: MoveRequest["mode"]) => {
    const res = await run(() => backend.moveMods(instance, { ...request, mode }));
    if (res.ok) onClose();
  };
  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content size="sm" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("mods.refused.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="sm">
            <Typography variant="body-sm" color="fg">
              {tp("mods.refused.description", result.violated.length)}
            </Typography>
            <ul className="list-disc pl-5 text-sm text-fg">
              {result.violated.map((r) => (
                <li key={r.id}>
                  {ruleText(r)}
                  {r.source !== "user" ? <span className="text-fg-muted"> · {t(`mods.rule.source.${r.source}` as MessageKey)}</span> : null}
                </li>
              ))}
            </ul>
          </Stack>
        </Modal.Body>
        <Modal.Footer className="flex-wrap">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="outline" tone="danger" onClick={() => void apply("remove_rules")}>
            {tp("mods.refused.removeRules", result.violated.length)}
          </Button>
          <Button disabled={!result.hasNearest} onClick={() => void apply("nearest")}>
            {result.hasNearest ? t("mods.refused.nearest", { priority: result.nearestPriority ?? "" }) : t("mods.refused.noNearest")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** "Move to…" (ui/telas/mods.md §5.2): a priority, below a mod, or into a separator block. */
export function MoveToDialog({
  entries,
  mods,
  order,
  onMove,
  onClose,
}: {
  entries: EntryRef[] | null;
  mods: readonly ModRow[];
  order: ModOrder | null;
  onMove: (request: MoveRequest) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"priority" | "after" | "end_of_block">("priority");
  const [priority, setPriority] = useState("1");
  const [target, setTarget] = useState("");
  const [separator, setSeparator] = useState("");
  useEffect(() => {
    setMode("priority");
    setPriority("1");
    setTarget("");
    setSeparator("");
  }, [entries]);
  const moving = useMemo(() => new Set((entries ?? []).map((e) => e.mod).filter(Boolean)), [entries]);
  if (!entries) return null;
  const names = new Map(mods.map((m) => [m.id, m.name]));
  const modOptions = (order?.entries ?? [])
    .filter((e) => e.kind === "mod" && e.modId && !moving.has(e.modId))
    .map((e) => ({ value: e.modId!, label: `${e.priority} · ${names.get(e.modId!) ?? e.modId}` }));
  const separators = (order?.entries ?? []).flatMap((e) => (e.separator ? [e.separator] : []));
  const n = Number.parseInt(priority, 10);
  const valid = mode === "priority" ? Number.isInteger(n) && n >= 1 : mode === "after" ? target !== "" : separator !== "";

  const submit = async () => {
    const anchor =
      mode === "priority"
        ? { kind: "priority" as const, entry: {}, priority: n }
        : mode === "after"
          ? { kind: "after" as const, entry: { mod: target } }
          : { kind: "end_of_block" as const, entry: { separator } };
    onClose();
    await onMove({ entries, anchor, mode: "exact" });
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content size="sm" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("mods.moveTo.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Radio.Group name="move-to" value={mode} onValueChange={(v: string) => setMode(v as typeof mode)}>
              <Radio.Item value="priority" label={t("mods.moveTo.priority")} />
              <Radio.Item value="after" label={t("mods.moveTo.after")} />
              <Radio.Item value="end_of_block" label={t("mods.moveTo.separator")} disabled={separators.length === 0} />
            </Radio.Group>
            {mode === "priority" ? (
              <Input.Root fullWidth value={priority} onChange={setPriority}>
                <Input.Label>{t("mods.moveTo.priorityField")}</Input.Label>
                <Input.Box>
                  <Input.Field type="number" min={1} autoFocus />
                </Input.Box>
              </Input.Root>
            ) : mode === "after" ? (
              <Input.Root fullWidth value={target} onChange={setTarget}>
                <Input.Label>{t("mods.moveTo.afterField")}</Input.Label>
                <Input.Select placeholder={t("mods.moveTo.choose")} options={modOptions} />
              </Input.Root>
            ) : (
              <Input.Root fullWidth value={separator} onChange={setSeparator}>
                <Input.Label>{t("mods.moveTo.separatorField")}</Input.Label>
                <Input.Select placeholder={t("mods.moveTo.choose")} options={separators.map((s) => ({ value: s.id, label: s.label }))} />
              </Input.Root>
            )}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid} onClick={() => void submit()}>
            {t("mods.moveTo.submit")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** Create or edit a separator: label and colour (a theme tone, ui/04 §2). */
export function SeparatorDialog({
  instance,
  editing,
  onClose,
}: {
  instance: string;
  /** A separator to edit, or the anchor of a new one; null keeps it closed. */
  editing: { separator?: Separator; before?: EntryRef } | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  useEffect(() => {
    setLabel(editing?.separator?.label ?? "");
    setColor(editing?.separator?.color ?? "");
    setError(null);
  }, [editing]);
  if (!editing) return null;
  const submit = async () => {
    const sep = editing.separator;
    const res = await run<unknown>(
      () =>
        sep
          ? backend.updateSeparator(instance, { ...sep, label, color })
          : backend.createSeparator(instance, label, color, editing.before ? { kind: "before", entry: editing.before } : { kind: "top", entry: {} }),
      { quiet: true },
    );
    if (res.ok) onClose();
    else setError(res.error);
  };
  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content size="sm" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(editing.separator ? "mods.separator.editTitle" : "mods.separator.newTitle")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Input.Root fullWidth value={label} onChange={setLabel}>
              <Input.Label>{t("mods.separator.label")}</Input.Label>
              <Input.Box>
                <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && label.trim() && void submit()} />
              </Input.Box>
            </Input.Root>
            <Input.Root fullWidth value={color} onChange={setColor}>
              <Input.Label>{t("mods.separator.color")}</Input.Label>
              <Input.Select options={[{ value: "", label: t("mods.highlight.none") }, ...TONES.map((tone) => ({ value: tone, label: t(`mods.highlight.${tone}`) }))]} />
            </Input.Root>
            <DialogError error={error} />
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!label.trim()} onClick={() => void submit()}>
            {t("common.save")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

const KINDS: RuleKind[] = ["wins", "requires", "recommends", "incompatible"];

/**
 * DLG-10 (rules of the instance, D026) with the F5 part of core/05 §4: a
 * "wins" rule shows its effect on every profile before it is created, and
 * a rule that would close a cycle is refused showing the cycle (D028).
 * Requirement and incompatibility diagnostics arrive with F9.
 */
export function RulesDialog({
  instance,
  open,
  mods,
  focusMod,
  onClose,
}: {
  instance: string;
  open: boolean;
  mods: readonly ModRow[];
  /** Pre-fills "A" and filters the list to this mod. */
  focusMod: string | null;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const rules = useModRules(instance);
  const ruleText = useRuleText();
  const [kind, setKind] = useState<RuleKind>("wins");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [onlyFocus, setOnlyFocus] = useState(true);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  useEffect(() => {
    setA(focusMod ?? "");
    setB("");
    setKind("wins");
    setOnlyFocus(true);
    setError(null);
  }, [open, focusMod]);
  useEffect(() => {
    setPreview(null);
    if (!open || kind !== "wins" || !a || !b || a === b) return;
    backend.previewOrderRule(instance, a, b).then(setPreview, (e: unknown) => setError(toUIError(e)));
  }, [backend, instance, open, kind, a, b]);
  if (!open) return null;

  const installed = [...mods].filter((m) => m.state === "installed").sort((x, y) => x.name.localeCompare(y.name));
  const options = installed.map((m) => ({ value: m.id, label: m.name }));
  const list = rules.status === "ready" ? rules.data.filter((r) => !focusMod || !onlyFocus || r.a.id === focusMod || r.b.id === focusMod) : [];
  const cycle = preview && preview.cycle.length > 0 ? preview.cycle.map((m) => m.name).join(" → ") : "";

  const create = async () => {
    setError(null);
    const res = await run(
      () =>
        kind === "wins"
          ? backend.createOrderRule(instance, a, b)
          : kind === "incompatible"
            ? backend.addIncompatibilityRule(instance, a, b)
            : backend.addDependencyRule(instance, a, b, kind),
      { quiet: true, success: "mods.rules.created" },
    );
    if (res.ok) {
      setB("");
      rules.reload();
    } else setError(res.error);
  };
  const act = async (call: () => Promise<void>) => {
    const res = await run(call, { quiet: true });
    if (res.ok) rules.reload();
    else setError(res.error);
  };

  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("mods.rules.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <section aria-labelledby="rules-new" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
              <Typography id="rules-new" variant="heading-6" color="fg">
                {t("mods.rules.new")}
              </Typography>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <Input.Root fullWidth value={a} onChange={setA}>
                  <Input.Label>{t("mods.rules.modA")}</Input.Label>
                  <Input.Select placeholder={t("mods.moveTo.choose")} options={options} />
                </Input.Root>
                <Input.Root value={kind} onChange={(v: string) => setKind(v as RuleKind)}>
                  <Input.Label>{t("mods.rules.kind")}</Input.Label>
                  <Input.Select options={KINDS.map((k) => ({ value: k, label: t(`mods.rule.kind.${k}` as MessageKey) }))} />
                </Input.Root>
                <Input.Root fullWidth value={b} onChange={setB}>
                  <Input.Label>{t("mods.rules.modB")}</Input.Label>
                  <Input.Select placeholder={t("mods.moveTo.choose")} options={options.filter((o) => o.value !== a)} />
                </Input.Root>
              </div>
              {kind === "wins" && a && b ? (
                cycle ? (
                  <Alert.Root variant="danger">
                    <Alert.Title>{t("mods.rules.cycleTitle")}</Alert.Title>
                    <Alert.Description>{t("mods.rules.cycle", { cycle })}</Alert.Description>
                  </Alert.Root>
                ) : preview ? (
                  <RuleMoves preview={preview} />
                ) : (
                  <Spinner label={t("common.loading")} />
                )
              ) : (
                <Typography variant="body-sm" color="muted-fg">
                  {t(kind === "wins" ? "mods.rules.winsHelp" : "mods.rules.diagnosticsLater")}
                </Typography>
              )}
              <div className="flex justify-end">
                <Button startIcon={<Plus aria-hidden="true" />} disabled={!a || !b || a === b || Boolean(cycle)} onClick={() => void create()}>
                  {t("mods.rules.create")}
                </Button>
              </div>
            </section>
            <DialogError error={error} />
            {focusMod ? (
              <Checkbox checked={onlyFocus} onCheckedChange={setOnlyFocus} label={t("mods.rules.onlyMod", { name: mods.find((m) => m.id === focusMod)?.name ?? "" })} />
            ) : null}
            {rules.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
            {rules.status === "ready" && list.length === 0 ? (
              <Typography variant="body-sm" color="muted-fg">
                {t("mods.rules.empty")}
              </Typography>
            ) : null}
            {list.length > 0 ? (
              <Table.Root aria-label={t("mods.rules.title")}>
                <Table.Body>
                  {list.map((r) => (
                    <Table.Row key={r.id}>
                      <Table.Cell className={r.disabled ? "text-fg-muted line-through" : "text-fg"}>{ruleText(r)}</Table.Cell>
                      <Table.Cell>
                        <span className="flex flex-wrap gap-1">
                          {r.source !== "user" ? <Tag size="sm">{t(`mods.rule.source.${r.source}` as MessageKey)}</Tag> : null}
                          {r.disabled ? <Badge variant="outline">{t("mods.rules.disabled")}</Badge> : null}
                          {r.orphan ? <Badge tone="warning">{t("mods.rules.orphan")}</Badge> : null}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {r.source === "user" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            tone="danger"
                            startIcon={<Trash2 aria-hidden="true" />}
                            onClick={() => void act(() => backend.removeRule(instance, r.id))}
                          >
                            {t("mods.rules.remove")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            startIcon={r.disabled ? <RotateCcw aria-hidden="true" /> : <Ban aria-hidden="true" />}
                            onClick={() => void act(() => backend.setRuleDisabled(instance, r.id, !r.disabled))}
                          >
                            {t(r.disabled ? "mods.rules.enable" : "mods.rules.disable")}
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
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * Reversible history of order changes of the active profile (core/05 §4,
 * core/10 §3). The full history with filters is Diagnostics › History (F9).
 */
export function OrderHistoryDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const { t, tp, formatDateTime } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const history = useOrderHistory(instance);
  if (!open) return null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("mods.orderHistory.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {history.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
          {history.status === "ready" && history.data.length === 0 ? (
            <Typography variant="body-sm" color="muted-fg">
              {t("mods.orderHistory.empty")}
            </Typography>
          ) : null}
          {history.status === "ready" && history.data.length > 0 ? (
            <Table.Root aria-label={t("mods.orderHistory.title")}>
              <Table.Body>
                {history.data.map((c) => (
                  <Table.Row key={c.id}>
                    <Table.Cell>{formatDateTime(c.at)}</Table.Cell>
                    <Table.Cell>{t(`mods.orderHistory.reason.${c.reason}` as MessageKey)}</Table.Cell>
                    <Table.Cell>{tp("mods.orderHistory.moved", c.moved)}</Table.Cell>
                    <Table.Cell className="text-right">
                      {c.reverted ? (
                        <Badge variant="outline">{t("mods.orderHistory.reverted")}</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!c.revertible}
                          title={c.revertible ? undefined : t("mods.orderHistory.notRevertible")}
                          startIcon={<Undo2 aria-hidden="true" />}
                          onClick={() => void run(() => backend.revertOrderChange(instance, c.id), { success: "mods.orderHistory.revertedToast" }).then(() => history.reload())}
                        >
                          {t("mods.orderHistory.revert")}
                        </Button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
