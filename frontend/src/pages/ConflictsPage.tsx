import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, GitCompareArrows, Lightbulb, Swords } from "lucide-react";
import { CheckIcon, ChevronRightIcon, InfoIcon, LockIcon, TrashIcon } from "dettmann-ui/icons";
import { Alert, Button, ConfirmDialog, Icon, Indicator, Input, List, Loader, Radio, ResourcePage, Switch, Tag } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useConflictPairs, useModArchiveConflicts, useModConflicts } from "../bridge/queries";
import { archiveSummary } from "../features/conflicts/archive-summary";
import { errorMessage, toUIError, type UIError } from "../bridge/errors";
import type { ConflictMod, ConflictOpponent, ConflictPair, PairDecision, RulePreview, StaleIntent } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { FileWinnersDialog } from "../features/conflicts/ConflictDialogs";
import { locationText } from "../features/conflicts/conflict-labels";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";
import { BusyBand, HonestEmpty, LoadingState, WorkspaceGate } from "./PageBody";

/** Pending hashes are reread on this cadence until redundancy is settled. */
const HASH_POLL_MS = 1500;

/** A pair, whatever the side it is read from. */
const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** A staged choice: who wins the pair, saved together with the others. */
interface Staged {
  winner: string;
  loser: string;
}

/** One mod of the left list: its opponents and the pairs still to decide. */
interface ModEntry {
  id: string;
  mod: ConflictMod;
  opponents: number;
  pending: number;
}

function modEntries(pairs: readonly ConflictPair[]): ModEntry[] {
  const out = new Map<string, ModEntry>();
  for (const p of pairs) {
    for (const m of [p.a, p.b]) {
      const e = out.get(m.id) ?? { id: m.id, mod: m, opponents: 0, pending: 0 };
      e.opponents++;
      if (p.needsReview) e.pending++;
      out.set(m.id, e);
    }
  }
  return [...out.values()].sort((x, y) => y.pending - x.pending || y.opponents - x.opponents || x.mod.name.localeCompare(y.mod.name));
}

/**
 * Conflicts (ui/telas/conflicts.md, board JogoConflitos): the header line
 * with the pairs to decide and decided, "Limpar regras" and "Usar sugestões
 * em tudo"; under it, the mods that dispute files on the left and, on the
 * right, the opponents of the chosen mod, where a click on a mod stages it
 * as the winner of the pair. Choices are saved together, after the order
 * impact is shown (D004: nothing is created by itself). Suggestions and
 * locks come from the backend (D126).
 */
export function ConflictsPage() {
  return <WorkspaceGate>{(instance) => <ConflictsWorkspace instance={instance} />}</WorkspaceGate>;
}

function ConflictsWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { route } = useNavigation();
  const [hideResolved, setHideResolved] = useState(route.filter === "unreviewed");
  const [search, setSearch] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [staged, setStaged] = useState<ReadonlyMap<string, Staged>>(new Map());
  const [rechoose, setRechoose] = useState<StaleIntent | null>(null);
  const [files, setFiles] = useState<{ a: string; b: string } | null>(null);
  const [clearing, setClearing] = useState(false);
  const pairs = useConflictPairs(instance, false, "");
  const data = pairs.status === "ready" ? pairs.data : null;

  // Redundancy needs hashes computed in the background; read again until done.
  const pending = data?.pendingHashes ?? 0;
  const reload = pairs.reload;
  useEffect(() => {
    if (pending === 0) return;
    const timer = setTimeout(reload, HASH_POLL_MS);
    return () => clearTimeout(timer);
  }, [pending, reload, data]);

  const entries = useMemo(() => modEntries(data?.pairs ?? []), [data]);
  const q = search.trim().toLowerCase();
  const visible = entries.filter((e) => (!hideResolved || e.pending > 0) && (!q || e.mod.name.toLowerCase().includes(q)));
  const selected = (current && entries.find((e) => e.mod.id === current)) || visible[0] || null;

  const stage = (choices: readonly Staged[]) =>
    setStaged((s) => {
      const next = new Map(s);
      for (const c of choices) next.set(pairKey(c.winner, c.loser), c);
      return next;
    });
  // "Usar sugestões em tudo": every pair to decide that has a suggestion and no lock.
  const suggestable = (data?.pairs ?? []).filter((p) => p.needsReview && p.suggestion && !p.lock);
  const useSuggestions = () =>
    stage(suggestable.map((p) => ({ winner: p.suggestion!.winner, loser: p.suggestion!.winner === p.a.id ? p.b.id : p.a.id })));
  // "Limpar regras": the pair rules the user created here (rules from mod data stay).
  const userRules = (data?.pairs ?? []).flatMap((p) => (p.rule && p.rule.source === "user" ? [p.rule.id] : []));
  const clearRules = () => {
    setClearing(false);
    void run(async () => {
      for (const id of userRules) await backend.removeRule(instance, id);
    });
  };

  let meta: React.ReactNode = null;
  if (data && data.totals.pairs > 0) {
    meta = (
      <>
        <Indicator
          variant="chip"
          icon={Swords}
          value={String(data.totals.unreviewed)}
          label={t("conflicts.header.toDecide")}
          {...(data.totals.unreviewed > 0 ? { intent: "warning" as const } : {})}
        />
        <Indicator variant="chip" icon={CheckCircle2} value={String(data.totals.pairs - data.totals.unreviewed)} label={t("conflicts.header.decided")} />
        {pending > 0 ? (
          <span className="flex items-center gap-2 text-xs text-fg-muted" role="status">
            <Loader size="sm" decorative />
            {tp("conflicts.hashing", pending)}
          </span>
        ) : null}
      </>
    );
  }

  let body: React.ReactNode = null;
  if (pairs.status === "error") {
    body = (
      <div className="p-6">
        <ErrorAlert title="conflicts.loadError" error={pairs.error} onRetry={reload} />
      </div>
    );
  } else if (pairs.status === "loading") {
    body = <LoadingState />;
  } else if (data && data.totals.pairs === 0) {
    body = (
      <div className="p-6">
        <HonestEmpty icon={GitCompareArrows} title="conflicts.emptyTitle" description="conflicts.emptyDescription" />
      </div>
    );
  } else if (data) {
    body = (
      <div className="grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)]">
        <aside aria-label={t("conflicts.modsLabel")} className="flex min-h-0 min-w-0 flex-col border-r border-border">
          <div className="flex flex-col gap-2.5 border-b border-border px-3.5 py-3">
            <Input.Root fullWidth value={search} onChange={setSearch}>
              <Input.Box className="h-8">
                <Input.Field data-page-search aria-label={t("conflicts.searchMod")} placeholder={t("conflicts.searchMod")} />
              </Input.Box>
            </Input.Root>
            <Switch size="xs" checked={hideResolved} onCheckedChange={setHideResolved} label={t("conflicts.hideResolved")} />
          </div>
          {visible.length > 0 ? (
            <List.Root
              density="pane"
              aria-label={t("conflicts.modsLabel")}
              items={visible}
              selectedKeys={selected ? [selected.mod.id] : []}
              onSelectedChange={(keys) => keys[0] && setCurrent(keys[0])}
              renderItem={(e) => (
                <List.Item
                  title={e.mod.name}
                  description={tp("conflicts.against", e.opponents)}
                  meta={
                    e.pending > 0 ? (
                      <Tag size="xs" emphasis="medium" intent="warning" aria-label={tp("conflicts.pendingLabel", e.pending)}>
                        {e.pending}
                      </Tag>
                    ) : null
                  }
                />
              )}
            />
          ) : (
            <p className="px-3.5 py-3 text-sm text-fg-muted">{t(hideResolved ? "conflicts.allResolved" : "conflicts.noMatch")}</p>
          )}
        </aside>
        {selected ? (
          <ModDisputes key={selected.mod.id} instance={instance} mod={selected.mod} staged={staged} onStage={stage} onFiles={setFiles}>
            {staged.size > 0 ? <PendingBar instance={instance} staged={staged} onDiscard={() => setStaged(new Map())} onSaved={() => setStaged(new Map())} /> : null}
          </ModDisputes>
        ) : (
          <p className="p-6 text-sm text-fg-muted">{t("conflicts.pickMod")}</p>
        )}
      </div>
    );
  }

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      bleed
      className="focus:outline-none"
      title={t("nav.conflicts")}
      meta={meta}
      primaryActions={
        <>
          <Button disabled={userRules.length === 0} onClick={() => setClearing(true)}>
            {t("conflicts.clearRules")}
          </Button>
          <Button intent="brand" startIcon={<Icon icon={Lightbulb} size="sm" />} disabled={suggestable.length === 0} onClick={useSuggestions}>
            {t("conflicts.useSuggestions")}
          </Button>
        </>
      }
    >
      <BusyBand />
      {data && data.stale.length > 0 ? (
        <Alert.Root band intent="warning">
          <Alert.Title>{tp("conflicts.stale.title", data.stale.length)}</Alert.Title>
          <Alert.Description>
            <ul className="mt-1 flex flex-col gap-1">
              {data.stale.map((s) => (
                <li key={`${s.kind}:${s.mod.id}:${s.location.target}:${s.location.path}`} className="flex flex-wrap items-center gap-2">
                  <span>
                    {t(`conflicts.stale.${s.kind}` as MessageKey, { path: locationText(s.location), name: s.mod.name })} · {t(`conflicts.stale.reason.${s.reason}` as MessageKey)}
                  </span>
                  <Button
                    size="sm"
                    emphasis="low"
                    startIcon={<TrashIcon size="sm" />}
                    onClick={() =>
                      void run(() => (s.kind === "override" ? backend.clearFileOverrides(instance, [s.location]) : backend.setFileExclusions(instance, s.mod.id, [s.location], false)))
                    }
                  >
                    {t("conflicts.stale.remove")}
                  </Button>
                  {s.kind === "override" && s.rivals.length >= 2 ? (
                    <Button size="sm" emphasis="low" onClick={() => setRechoose(s)}>
                      {t("conflicts.stale.rechoose")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Alert.Description>
        </Alert.Root>
      ) : null}
      {body}
      <FileWinnersDialog
        instance={instance}
        pair={rechoose ? { a: rechoose.rivals.at(-1)!.id, b: rechoose.rivals.at(-2)!.id, focus: rechoose.location } : files}
        onClose={() => {
          setRechoose(null);
          setFiles(null);
        }}
      />
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        type="warning"
        title={t("conflicts.clearRulesTitle")}
        description={tp("conflicts.clearRulesDescription", userRules.length)}
        confirmLabel={t("conflicts.clearRules")}
        cancelLabel={t("common.cancel")}
        onConfirm={clearRules}
      />
    </ResourcePage>
  );
}

/** Right side: the opponents of a mod, one row per pair, a click picks the winner. */
function ModDisputes({
  instance,
  mod,
  staged,
  onStage,
  onFiles,
  children,
}: {
  instance: string;
  mod: ConflictMod;
  staged: ReadonlyMap<string, Staged>;
  onStage: (choices: readonly Staged[]) => void;
  onFiles: (pair: { a: string; b: string }) => void;
  /** The bar of unsaved changes, at the bottom of the pane. */
  children?: React.ReactNode;
}) {
  const { t, tp } = useI18n();
  const data = useModConflicts(instance, mod.id);
  let content: React.ReactNode;
  if (data.status === "error") {
    content = (
      <div className="p-6">
        <ErrorAlert title="conflicts.loadError" error={data.error} onRetry={data.reload} />
      </div>
    );
  } else if (data.status !== "ready") {
    content = <LoadingState />;
  } else {
    const opponents = data.data.opponents;
    const open = opponents.filter((o) => !o.lock);
    content = (
      <>
        <div className="flex shrink-0 flex-col gap-0.75 border-b border-border px-6 py-4">
          <h2 className="truncate text-[1.0625rem] font-semibold text-fg">{mod.name}</h2>
          <p className="text-[0.8125rem] text-fg-muted">{tp("conflicts.disputesHelp", opponents.length)}</p>
        </div>
        {open.length > 1 ? (
          <div role="group" aria-label={t("conflicts.forAllLabel")} data-layer="medium" className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border bg-sunken px-6">
            <span className="mr-1 text-[0.8125rem] font-semibold text-fg">{tp("conflicts.forAll", open.length)}</span>
            <Button size="sm" onClick={() => onStage(open.map((o) => ({ winner: mod.id, loser: o.opponent.id })))}>
              {t("conflicts.forAllMod", { name: mod.name })}
            </Button>
            <Button size="sm" onClick={() => onStage(open.map((o) => ({ winner: o.opponent.id, loser: mod.id })))}>
              {t("conflicts.forAllOthers")}
            </Button>
          </div>
        ) : null}
        <div role="table" aria-label={t("conflicts.opponentsLabel")} className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div role="row" data-layer="medium" className="grid h-8.5 shrink-0 grid-cols-[14.375rem_minmax(0,1fr)_1.5rem] items-center gap-4 border-b border-border bg-structure px-6 text-xs font-semibold text-fg-muted">
            <span role="columnheader">{t("conflicts.column.opponent")}</span>
            <span role="columnheader">{t("conflicts.column.whoWins")}</span>
            <span role="columnheader" className="sr-only">
              {t("conflicts.column.state")}
            </span>
          </div>
          {opponents.map((o) => (
            <OpponentRow key={o.opponent.id} mod={mod} o={o} staged={staged.get(pairKey(mod.id, o.opponent.id))} onStage={onStage} onFiles={onFiles} />
          ))}
        </div>
      </>
    );
  }
  return (
    <section aria-label={t("conflicts.disputesOf", { name: mod.name })} className="flex min-h-0 min-w-0 flex-col">
      {content}
      <ArchivesStrip instance={instance} mod={mod} />
      {children}
    </section>
  );
}

/**
 * The mod also disputes files inside the game's archives (D147; board
 * JogoConflitosArchives). Nothing of it is chosen here: the strip says why
 * and opens the mod detail on its Conflicts tab.
 */
function ArchivesStrip({ instance, mod }: { instance: string; mod: ConflictMod }) {
  const { t, tp } = useI18n();
  const { navigate } = useNavigation();
  const data = useModArchiveConflicts(instance, mod.id);
  if (data.status !== "ready" || !data.data.supported || data.data.opponents.length === 0) return null;
  const { files, mods } = archiveSummary(data.data);
  return (
    <div role="note" aria-label={t("mods.detail.archives.titleBare")} data-layer="medium" className="flex shrink-0 items-center gap-3 border-t border-border bg-sunken px-6 py-3">
      <span data-intent="info" className="flex size-8 shrink-0 items-center justify-center rounded-control bg-intent-subtle text-intent-text">
        <Icon icon={Archive} size="sm" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.8125rem] font-semibold text-fg">{t("conflicts.archives.title", { files: tp("mods.detail.fileCount", files), mods: tp("mods.detail.archives.modCount", mods) })}</span>
        <span className="text-xs text-fg-muted">{t("conflicts.archives.help")}</span>
      </div>
      <Button size="sm" endIcon={<ChevronRightIcon size="sm" />} onClick={() => navigate({ view: "mods", focusMod: mod.id, modTab: "conflicts" })}>
        {t("conflicts.archives.open")}
      </Button>
    </div>
  );
}

function OpponentRow({
  mod,
  o,
  staged,
  onStage,
  onFiles,
}: {
  mod: ConflictMod;
  o: ConflictOpponent;
  staged?: Staged;
  onStage: (choices: readonly Staged[]) => void;
  onFiles: (pair: { a: string; b: string }) => void;
}) {
  const { t, tp } = useI18n();
  const ruleWinner = o.rule && !o.rule.disabled ? o.rule.winner : undefined;
  const lockWinner = o.lock?.winner;
  const chosen = staged?.winner ?? ruleWinner ?? lockWinner;
  let hint: string;
  if (o.lock) hint = t("conflicts.row.locked", { rules: o.lock.rules.map((r) => t("conflicts.inspector.lockRule", { winner: r.winner.name, loser: r.loser.name })).join(", ") });
  else if (staged) hint = t("conflicts.row.unsaved");
  else if (o.needsReview) hint = t("conflicts.row.toDecide");
  else if (ruleWinner) hint = t("conflicts.row.saved");
  else hint = t("conflicts.row.byOrder", { name: o.wins >= o.loses ? mod.name : o.opponent.name });
  let stateIcon: React.ReactNode = null;
  if (o.lock) stateIcon = <LockIcon size="sm" label={t("conflicts.row.lockedShort")} />;
  else if (!o.needsReview && !staged && ruleWinner) {
    stateIcon = (
      <span data-intent="success" className="text-intent-text">
        <CheckIcon size="sm" label={t("conflicts.reviewed")} />
      </span>
    );
  }
  const option = (m: ConflictMod) => {
    const on = chosen === m.id;
    const suggested = o.suggestion?.winner === m.id && !on;
    const reason = suggested ? t(`conflicts.suggestion.${o.suggestion!.reason}` as MessageKey, { name: m.name }) : "";
    return (
      <Radio.Item
        key={m.id}
        variant="row"
        intent={o.lock ? "neutral" : "success"}
        value={m.id}
        label={m.name}
        disabled={Boolean(o.lock)}
        title={reason || undefined}
        action={
          suggested ? (
            <Tag size="sm" outline={false} intent="brand" icon={Lightbulb}>
              {t("conflicts.suggested")}
              <span className="sr-only">: {reason}</span>
            </Tag>
          ) : null
        }
      >
        {on ? (
          <span data-intent={o.lock ? undefined : "success"} className={`text-[0.6875rem] ${o.lock ? "text-fg-muted" : "text-intent-text"}`}>
            {t("conflicts.row.wins")}
          </span>
        ) : null}
      </Radio.Item>
    );
  };
  return (
    <div role="row" className="grid h-17 shrink-0 grid-cols-[14.375rem_minmax(0,1fr)_1.5rem] items-center gap-4 border-b border-border-subtle px-6">
      <div role="cell" className="flex min-w-0 flex-col gap-0.75">
        <span className="truncate text-sm font-medium text-fg">{o.opponent.name}</span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
          <Button size="inline" emphasis="low" intent="brand" className="shrink-0" onClick={() => onFiles({ a: mod.id, b: o.opponent.id })}>
            {tp("conflicts.files", o.files)}
          </Button>
          <span className="truncate" title={hint}>
            {hint}
          </span>
        </span>
      </div>
      <div role="cell" className="min-w-0">
        <Radio.Group
          name={`pair-${mod.id}-${o.opponent.id}`}
          orientation="horizontal"
          aria-label={t("conflicts.row.groupLabel", { a: mod.name, b: o.opponent.name })}
          className="grid grid-cols-2"
          value={chosen ?? ""}
          onValueChange={(winner) => onStage([{ winner, loser: winner === mod.id ? o.opponent.id : mod.id }])}
        >
          {option(mod)}
          {option(o.opponent)}
        </Radio.Group>
      </div>
      <span role="cell" className="flex justify-center text-fg-muted">
        {stateIcon}
      </span>
    </div>
  );
}

/** Unsaved choices (board JogoConflitos): how many and what saving moves in the order (D004). */
function PendingBar({ instance, staged, onDiscard, onSaved }: { instance: string; staged: ReadonlyMap<string, Staged>; onDiscard: () => void; onSaved: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const decisions = useMemo<PairDecision[]>(() => [...staged.values()].map((s) => ({ mod: s.winner, opponent: s.loser, choice: "wins" })), [staged]);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  useEffect(() => {
    let live = true;
    setPreview(null);
    setError(null);
    backend.previewPairDecisions(instance, decisions).then(
      (p) => live && setPreview(p),
      (e: unknown) => live && setError(toUIError(e)),
    );
    return () => {
      live = false;
    };
  }, [backend, instance, decisions]);
  const moved = preview ? new Set(preview.profiles.flatMap((p) => p.moves.map((m) => m.id))).size : 0;
  const cycle = preview && preview.cycle.length > 0 ? preview.cycle.map((m) => m.name).join(" → ") : "";
  const save = async () => {
    const res = await run(() => backend.decidePairs(instance, decisions), { success: "conflicts.decided" });
    if (res.ok) onSaved();
  };
  let text = tp("conflicts.pending.count", staged.size);
  if (cycle) text = t("conflicts.pending.cycle", { cycle });
  else if (error) text = errorMessage(i18n, error);
  else if (preview) text = `${tp("conflicts.pending.count", staged.size)} ${moved > 0 ? tp("conflicts.pending.moves", moved) : t("conflicts.pending.noMoves")}`;
  return (
    <div role="region" aria-label={t("conflicts.pending.label")} data-layer="medium" className="flex h-15 shrink-0 items-center gap-3 border-t border-border bg-structure px-6">
      <span data-intent="info" className="text-intent-text">
        <InfoIcon size="sm" />
      </span>
      <span className="flex-1 text-[0.8125rem] text-fg">{text}</span>
      <Button onClick={onDiscard}>{t("conflicts.pending.discard")}</Button>
      <Button emphasis="high" disabled={!preview || Boolean(cycle)} onClick={() => void save()}>
        {t("common.save")}
      </Button>
    </div>
  );
}
