import { useMemo, useState } from "react";
import { History as HistoryIcon, RotateCcw, Undo2 } from "lucide-react";
import { Alert, Badge, Button, DataTable, Inline, Input, Modal, Spinner, Tag, Typography, type DataTableColumn } from "dettmann-ui";
import { useSettings } from "../../app/settings-context";
import { useBackend } from "../../bridge/backend-context";
import { useHistory, useProfiles } from "../../bridge/queries";
import type { HistoryEntry } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { HonestEmpty } from "../../pages/PageBody";
import { useNavigation } from "../../shell/navigation";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { historyText } from "./diagnostic-labels";

const PAGE = 200;
/** Above this many items a reversal asks first (ui/telas/diagnostics.md §2). */
const CONFIRM_ABOVE = 10;

const TYPE_GROUPS: Record<string, string[]> = {
  all: [],
  mod: ["mod.", "archive.", "category."],
  order: ["order.", "separator."],
  rule: ["rule."],
  conflicts: ["override.", "exclusion.", "conflict."],
  profile: ["profile.", "snapshot."],
  deployment: ["deployment.", "staging."],
};

const PERIODS: Record<string, number> = { all: 0, day: 1, week: 7, month: 30 };

/**
 * Diagnostics › History (core/10 §3): the readable projection of events,
 * filtered by profile, mod, kind of action, period and origin. "Revert"
 * appears on the entries the backend marks reversible and is a new command
 * with its own entry; nothing is erased.
 */
export function HistoryPanel({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { density } = useSettings();
  const { route, navigate } = useNavigation();
  const profiles = useProfiles(instance);
  const [type, setType] = useState("all");
  const [period, setPeriod] = useState("all");
  const [origin, setOrigin] = useState("");
  const [profile, setProfile] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [confirming, setConfirming] = useState<HistoryEntry | null>(null);
  // The period start is fixed when chosen, so rereads keep the same window.
  const from = useMemo(() => (PERIODS[period] ? new Date(Date.now() - PERIODS[period]! * 86_400_000).toISOString().slice(0, 19) + "Z" : ""), [period]);
  const mod = route.mod;
  const history = useHistory({ instance, profile, mod: mod?.id ?? "", types: TYPE_GROUPS[type] ?? [], origin, from, to: "", before: 0, limit });
  const entries = history.status === "ready" ? history.data : [];
  const profileNames = useMemo(
    () => new Map(profiles.status === "ready" ? profiles.data.map((p) => [p.id, p.name]) : []),
    [profiles],
  );

  const revert = async (e: HistoryEntry) => {
    setConfirming(null);
    await run(() => backend.revertHistoryEntry(e.id), { success: "history.revertedToast" });
  };
  const askRevert = (e: HistoryEntry) => (e.items > CONFIRM_ABOVE ? setConfirming(e) : void revert(e));

  const columns = useMemo<DataTableColumn<HistoryEntry>[]>(
    () => [
      { id: "when", label: t("history.when"), width: 180, numeric: true, cell: (e) => <time dateTime={e.at}>{i18n.formatDateTime(e.at)}</time> },
      {
        id: "who",
        label: t("history.who"),
        width: 120,
        cell: (e) => (e.origin === "user" ? t("history.origin.user") : <Badge variant="muted">{t(`history.origin.${e.origin}` as MessageKey)}</Badge>),
      },
      {
        id: "action",
        label: t("history.action"),
        grow: true,
        width: 380,
        cell: (e) => (
          <Inline gap="xs" wrap={false} className="min-w-0">
            {e.revertOf ? <Undo2 aria-label={t("history.revertOf")} className="h-4 w-4 shrink-0 text-fg-muted" /> : null}
            <span className="truncate">{historyText(i18n, e)}</span>
          </Inline>
        ),
      },
      {
        id: "profile",
        label: t("history.profile"),
        width: 150,
        cell: (e) => {
          const id = e.params.profile ?? (e.subject?.kind === "profile" ? e.subject.id : "");
          return id ? (profileNames.get(id) ?? e.params.name ?? t("common.empty")) : t("common.empty");
        },
      },
      {
        id: "revert",
        label: t("history.revert"),
        width: 130,
        cell: (e) =>
          e.revertedBy ? (
            <Badge variant="muted">{t("history.reverted")}</Badge>
          ) : e.reversible ? (
            <Button size="sm" variant="ghost" startIcon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => askRevert(e)}>
              {t("history.revert")}
            </Button>
          ) : null,
      },
    ],
    [i18n, t, profileNames, askRevert],
  );

  const select = (value: string, onChange: (v: string) => void, label: string, options: { value: string; label: string }[]) => (
    <div className="w-48">
      <Input.Root value={value} onChange={onChange} fullWidth>
        <Input.Box padding="sm">
          <Input.Select aria-label={label} options={options} />
        </Input.Box>
      </Input.Root>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Inline gap="sm" className="w-full">
        {select(type, setType, t("history.filter.type"), Object.keys(TYPE_GROUPS).map((g) => ({ value: g, label: g === "all" ? t("history.filter.allTypes") : t(`history.filter.type.${g}` as MessageKey) })))}
        {select(
          profile,
          setProfile,
          t("history.filter.profile"),
          [{ value: "", label: t("history.filter.allProfiles") }, ...(profiles.status === "ready" ? profiles.data.map((p) => ({ value: p.id, label: p.name })) : [])],
        )}
        {select(period, setPeriod, t("history.filter.period"), Object.keys(PERIODS).map((p) => ({ value: p, label: t(`history.filter.period.${p}` as MessageKey) })))}
        {select(origin, setOrigin, t("history.filter.origin"), [
          { value: "", label: t("history.filter.allOrigins") },
          { value: "user", label: t("history.origin.user") },
          { value: "auto", label: t("history.origin.auto") },
          { value: "system", label: t("history.origin.system") },
        ])}
        {mod ? (
          <Tag value={mod.id} onRemove={() => navigate({ view: "diagnostics", tab: "history" })} removeLabel={t("history.filter.clearMod")}>
            {t("history.filter.mod", { name: mod.name })}
          </Tag>
        ) : null}
      </Inline>
      {history.status === "unavailable" ? (
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      ) : null}
      {history.status === "error" ? <ErrorAlert title="history.loadError" error={history.error} onRetry={history.reload} /> : null}
      {history.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
      {history.status === "ready" && entries.length === 0 ? <HonestEmpty icon={HistoryIcon} title="history.empty" description="history.noGame" /> : null}
      {entries.length > 0 ? (
        <DataTable
          aria-label={t("diagnostics.tab.history")}
          className="min-h-0 flex-1"
          columns={columns}
          rows={entries}
          getRowId={(e) => e.id}
          density={density}
          labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
        />
      ) : null}
      {entries.length >= limit ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            {t("history.loadMore")}
          </Button>
        </div>
      ) : null}
      {confirming ? (
        <Modal.Root open onOpenChange={(open) => !open && setConfirming(null)}>
          <Modal.Content size="sm" aria-describedby={undefined}>
            <Modal.Header>
              <Modal.Title>{t("history.confirmTitle", { count: confirming.items })}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Typography variant="body-sm">{t("history.confirmDescription", { count: confirming.items })}</Typography>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onClick={() => setConfirming(null)}>
                {t("common.cancel")}
              </Button>
              <Button startIcon={<RotateCcw aria-hidden="true" />} onClick={() => void revert(confirming)}>
                {t("history.revert")}
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      ) : null}
    </div>
  );
}
