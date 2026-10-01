import { useEffect, useMemo, useState } from "react";
import { CheckCheck, CircleDot, GitCompareArrows, RefreshCw, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  DataTable,
  FilterBar,
  Indicator,
  SegmentedControl,
  Spinner,
  Stack,
  Toolbar,
  Typography,
  type DataTableColumn,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useConflictPairDetail, useConflictPairs, useWorkspace } from "../bridge/queries";
import type { ConflictPair, StaleIntent } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { FileWinnersDialog, usePairDecisions } from "../features/conflicts/ConflictDialogs";
import { locationText, modLabel, useConflictText } from "../features/conflicts/conflict-labels";
import { PairFiles } from "../features/conflicts/PairFiles";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { HonestEmpty, PageBody } from "./PageBody";

type Filter = "all" | "unreviewed" | "rule" | "order" | "override" | "redundant";
const FILTERS: readonly Filter[] = ["all", "unreviewed", "rule", "order", "override", "redundant"];

/** Pending hashes are reread on this cadence until redundancy is settled. */
const HASH_POLL_MS = 1500;

const pairId = (p: Pick<ConflictPair, "a" | "b">) => `${p.a.id}|${p.b.id}`;

/**
 * Conflicts (ui/telas/conflicts.md): every dispute of the active profile,
 * who wins and why, what was not reviewed, and where to choose winners by
 * pair or by file. Divergência aprovada 1 (the Vortex has no such screen).
 */
export function ConflictsPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  if (ws.status === "loading") return <PageBody><Spinner label={t("common.loading")} /></PageBody>;
  if (ws.status === "unavailable") {
    return (
      <PageBody>
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      </PageBody>
    );
  }
  if (ws.status === "error") return <PageBody><ErrorAlert title="games.loadError" error={ws.error} onRetry={ws.reload} /></PageBody>;
  if (!ws.data.active) return null; // Routes sends the user back to Games
  return <ConflictsWorkspace key={ws.data.active.id} instance={ws.data.active.id} />;
}

function ConflictsWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const text = useConflictText();
  const backend = useBackend();
  const run = useAction();
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState<"pair" | "mod">("pair");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [rechoose, setRechoose] = useState<StaleIntent | null>(null);
  const pairs = useConflictPairs(instance, includeDisabled, search.trim());
  const data = pairs.status === "ready" ? pairs.data : null;

  // Redundancy needs hashes computed in the background; read again until done.
  const pending = data?.pendingHashes ?? 0;
  const reload = pairs.reload;
  useEffect(() => {
    if (pending === 0) return;
    const timer = setTimeout(reload, HASH_POLL_MS);
    return () => clearTimeout(timer);
  }, [pending, reload, data]);

  const rows = useMemo(() => {
    const list = data?.pairs ?? [];
    return list.filter((p) => (filter === "all" ? true : filter === "unreviewed" ? p.needsReview : p.decision === filter));
  }, [data, filter]);
  const byId = new Map(rows.map((p) => [pairId(p), p]));
  const current = (focused && byId.get(focused)) || rows[0];

  const columns = useMemo<DataTableColumn<ConflictPair>[]>(() => {
    const winner = (p: ConflictPair) => (p.winner === p.a.id ? p.a : p.b);
    const loser = (p: ConflictPair) => (p.winner === p.a.id ? p.b : p.a);
    return [
      {
        id: "pair",
        label: t("conflicts.column.pair"),
        width: 320,
        grow: true,
        cell: (p) => (
          <span className={`flex min-w-0 items-center gap-1 ${p.decision === "redundant" ? "text-fg-subtle" : "text-fg"}`}>
            <span className="truncate font-medium">{winner(p).name}</span>
            <span aria-hidden="true" className="text-fg-muted">▸</span>
            <span className="sr-only">{t("conflicts.wins")}</span>
            <span className="truncate">{loser(p).name}</span>
            {p.potential ? <Badge variant="outline">{t("conflicts.potential")}</Badge> : null}
          </span>
        ),
      },
      { id: "files", label: t("conflicts.column.files"), width: 80, numeric: true, align: "end", cell: (p) => p.files },
      { id: "decision", label: t("conflicts.column.decision"), width: 120, cell: (p) => text.decision(p.decision) },
      {
        id: "review",
        label: t("conflicts.column.review"),
        width: 130,
        cell: (p) =>
          p.needsReview ? (
            <Indicator icon={CircleDot} tone="info" label={t("conflicts.unreviewed")} />
          ) : p.reviewed ? (
            <Indicator icon={CheckCheck} tone="subtle" label={t("conflicts.reviewed")} />
          ) : null,
      },
    ];
  }, [t, text]);

  const markReviewed = (list: readonly ConflictPair[]) =>
    void run(() => backend.markConflictsReviewed(instance, list.map((p) => ({ a: p.a.id, b: p.b.id }))), { success: "conflicts.reviewedToast" });
  const selectedPairs = [...selected].flatMap((id) => byId.get(id) ?? []);

  return (
    <PageBody fill>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Toolbar
          start={
            <>
              <Button variant="outline" startIcon={<CheckCheck aria-hidden="true" />} disabled={selectedPairs.length === 0} onClick={() => markReviewed(selectedPairs)}>
                {t("conflicts.markSelected")}
              </Button>
              <Checkbox checked={includeDisabled} onCheckedChange={setIncludeDisabled} label={t("conflicts.showDisabled")} />
            </>
          }
          end={
            <Button variant="ghost" startIcon={<RefreshCw aria-hidden="true" />} onClick={reload}>
              {t("conflicts.recalculate")}
            </Button>
          }
        />

        {data ? (
          <div className="flex flex-wrap items-center gap-3">
            <Typography variant="body-sm" color="fg">
              {[
                tp("conflicts.summary.pairs", data.totals.pairs),
                tp("conflicts.summary.unreviewed", data.totals.unreviewed),
                tp("conflicts.summary.override", data.totals.override),
                tp("conflicts.summary.redundant", data.totals.redundant),
              ].join(" · ")}
            </Typography>
            {pending > 0 ? (
              <span className="flex items-center gap-2 text-xs text-fg-muted" role="status">
                <Spinner size="sm" label={tp("conflicts.hashing", pending)} />
                {tp("conflicts.hashing", pending)}
              </span>
            ) : null}
          </div>
        ) : null}

        {data && data.stale.length > 0 ? (
          <Alert.Root variant="warning">
            <Alert.Title>{tp("conflicts.stale.title", data.stale.length)}</Alert.Title>
            <Alert.Description>
              <ul className="mt-1 flex flex-col gap-1">
                {data.stale.map((s) => (
                  <li key={`${s.kind}:${s.mod.id}:${s.location.target}:${s.location.path}`} className="flex flex-wrap items-center gap-2">
                    <span>
                      {t(`conflicts.stale.${s.kind}` as MessageKey, { path: locationText(s.location), name: s.mod.name })} ·{" "}
                      {t(`conflicts.stale.reason.${s.reason}` as MessageKey)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      startIcon={<Trash2 aria-hidden="true" />}
                      onClick={() =>
                        void run(() =>
                          s.kind === "override"
                            ? backend.clearFileOverrides(instance, [s.location])
                            : backend.setFileExclusions(instance, s.mod.id, [s.location], false),
                        )
                      }
                    >
                      {t("conflicts.stale.remove")}
                    </Button>
                    {s.kind === "override" && s.rivals.length >= 2 ? (
                      <Button size="sm" variant="ghost" onClick={() => setRechoose(s)}>
                        {t("conflicts.stale.rechoose")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Alert.Description>
          </Alert.Root>
        ) : null}

        {pairs.status === "error" ? <ErrorAlert title="conflicts.loadError" error={pairs.error} onRetry={reload} /> : null}
        {pairs.status === "loading" ? <Spinner label={t("common.loading")} /> : null}

        {data && data.totals.pairs === 0 && !search && !includeDisabled ? (
          <HonestEmpty icon={GitCompareArrows} title="conflicts.emptyTitle" description="conflicts.emptyDescription" />
        ) : null}

        {data && (data.totals.pairs > 0 || search || includeDisabled) ? (
          <div className="flex min-h-0 flex-1 gap-4">
            <section aria-label={t("conflicts.pairsLabel")} className="flex min-h-0 w-[42%] min-w-[22rem] flex-col gap-2">
              <FilterBar
                className="rounded-xl border"
                query={search}
                onQueryChange={setSearch}
                queryPlaceholder={t("conflicts.search")}
                filters={
                  <SegmentedControl
                    size="sm"
                    aria-label={t("conflicts.filter.label")}
                    value={filter}
                    onChange={setFilter}
                    options={FILTERS.map((f) => ({ value: f, label: t(`conflicts.filter.${f}` as MessageKey) }))}
                  />
                }
                actions={
                  <SegmentedControl
                    size="sm"
                    aria-label={t("conflicts.group.label")}
                    value={group}
                    onChange={setGroup}
                    options={[
                      { value: "pair", label: t("conflicts.group.pair") },
                      { value: "mod", label: t("conflicts.group.mod") },
                    ]}
                  />
                }
              />
              <DataTable
                aria-label={t("conflicts.pairsLabel")}
                className="min-h-0 flex-1"
                columns={columns}
                rows={rows}
                getRowId={pairId}
                selectionMode="multiple"
                selectedIds={selected}
                onSelectedIdsChange={setSelected}
                onFocusedIdChange={setFocused}
                onRowActivate={(p) => setFocused(pairId(p))}
                getGroup={group === "mod" ? (p) => (p.winner === p.a.id ? p.a.name : p.b.name) : undefined}
                empty={<div className="p-6 text-sm text-fg-muted">{t("conflicts.noMatch")}</div>}
                labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
              />
            </section>
            <section aria-label={t("conflicts.detailLabel")} className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4">
              {current ? (
                <PairDetail key={pairId(current)} instance={instance} pair={current} includeDisabled={includeDisabled} onReviewed={() => markReviewed([current])} />
              ) : (
                <Typography variant="body-sm" color="muted-fg">
                  {t("conflicts.pickPair")}
                </Typography>
              )}
            </section>
          </div>
        ) : null}
      </div>
      <FileWinnersDialog
        instance={instance}
        pair={rechoose ? { a: rechoose.rivals.at(-1)!.id, b: rechoose.rivals.at(-2)!.id, focus: rechoose.location } : null}
        onClose={() => setRechoose(null)}
      />
    </PageBody>
  );
}

/** Right side: summary sentence, reason with priorities, pair actions and files. */
function PairDetail({ instance, pair, includeDisabled, onReviewed }: { instance: string; pair: ConflictPair; includeDisabled: boolean; onReviewed: () => void }) {
  const { t } = useI18n();
  const text = useConflictText();
  const { decide, dialog } = usePairDecisions(instance);
  const detail = useConflictPairDetail(instance, pair.a.id, pair.b.id, includeDisabled);
  const [winner, loser] = pair.winner === pair.a.id ? [pair.a, pair.b] : [pair.b, pair.a];
  const winnerWins = pair.winner === pair.a.id ? pair.winsA : pair.winsB;
  const ruleWinner = pair.rule && !pair.rule.disabled ? pair.rule.winner : null;
  const reason =
    pair.decision === "order"
      ? t("conflicts.reason.order", { winner: winner.name, wp: winner.priority, loser: loser.name, lp: loser.priority })
      : pair.decision === "rule" && ruleWinner
        ? t("conflicts.reason.rule", { winner: ruleWinner === pair.a.id ? pair.a.name : pair.b.name, loser: ruleWinner === pair.a.id ? pair.b.name : pair.a.name })
        : text.decision(pair.decision);
  const choose = (w: string, l: string) => void decide([{ mod: w, opponent: l, choice: "wins" }]);

  return (
    <Stack gap="md" className="min-h-0 flex-1">
      <Stack gap="xs">
        <Typography variant="heading-6" color="fg">
          {t("conflicts.sentence", { winner: winner.name, loser: loser.name, wins: winnerWins, files: pair.files })}
        </Typography>
        <Typography variant="body-sm" color="muted-fg">
          {t("conflicts.decidedBy", { reason })}
        </Typography>
        <Typography variant="caption" color="muted-fg">
          {modLabel(t, pair.a)} · {modLabel(t, pair.b)}
        </Typography>
      </Stack>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={ruleWinner === pair.a.id ? "solid" : "outline"} disabled={ruleWinner === pair.a.id} onClick={() => choose(pair.a.id, pair.b.id)}>
          {t("conflicts.action.wins", { winner: pair.a.name, loser: pair.b.name })}
        </Button>
        <Button size="sm" variant={ruleWinner === pair.b.id ? "solid" : "outline"} disabled={ruleWinner === pair.b.id} onClick={() => choose(pair.b.id, pair.a.id)}>
          {t("conflicts.action.wins", { winner: pair.b.name, loser: pair.a.name })}
        </Button>
        {pair.rule && !pair.rule.disabled ? (
          <Button size="sm" variant="ghost" tone="danger" onClick={() => void decide([{ mod: pair.a.id, opponent: pair.b.id, choice: "order" }])}>
            {t("conflicts.action.removeRule")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" startIcon={<CheckCheck aria-hidden="true" />} disabled={!pair.needsReview} onClick={onReviewed}>
          {t("conflicts.action.markReviewed")}
        </Button>
      </div>
      {detail.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
      {detail.status === "error" ? <ErrorAlert title="conflicts.loadError" error={detail.error} onRetry={detail.reload} /> : null}
      {detail.status === "ready" ? <PairFiles instance={instance} files={detail.data.files} /> : null}
      {dialog}
    </Stack>
  );
}
