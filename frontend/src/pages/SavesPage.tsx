import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Minus, Save, X } from "lucide-react";
import { CheckIcon, FolderIcon, LayersIcon, MoreHorizontalIcon, SearchIcon, TriangleAlertIcon, XIcon } from "dettmann-ui/icons";
import {
  Alert,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Icon,
  Indicator,
  Input,
  Menu,
  ResourcePage,
  SegmentedControl,
  Switch,
  Typography,
  type DataTableColumn,
} from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useSaves } from "../bridge/queries";
import type { SaveEntry, SavesView } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { SaveTransferDialog } from "../features/saves/SaveDialogs";
import { gameTimeText, saveKindText, useScreenshot } from "../features/saves/save-labels";
import { useI18n } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";
import { BusyBand, HonestEmpty, LoadingState, NoMatch, WorkspaceGate } from "./PageBody";

type QuickFilter = "all" | "missing";

/**
 * Saves (ui/telas/saves.md, board JogoSaves, D142): the saves of the
 * active profile. Header with the counts; the band says whether the
 * profile keeps saves of its own and turns it on or off; a filter row with
 * search, character and the quick filter, and the actions of the
 * selection; the table and, beside it, the panel of the chosen save. Every
 * figure (missing plugins, providers, folders) comes from the backend.
 */
export function SavesPage() {
  return <WorkspaceGate>{(instance) => <SavesWorkspace instance={instance} />}</WorkspaceGate>;
}

function SavesWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  const list = useSaves(instance);
  const [query, setQuery] = useState("");
  const [character, setCharacter] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [inspected, setInspected] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);

  const data = list.status === "ready" ? list.data : null;
  const all = useMemo(() => data?.saves ?? [], [data]);
  useEffect(() => {
    // The first save opens in the panel, as in the board; a save that left
    // the folder closes it.
    if (!data) return;
    if (inspected && !all.some((s) => s.name === inspected)) setInspected(null);
    else if (!inspected && all.length > 0) setInspected(all[0]!.name);
    setSelected((cur) => new Set([...cur].filter((n) => all.some((s) => s.name === n))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const characters = useMemo(() => [...new Set(all.filter((s) => s.readable).map((s) => s.character))].sort((a, b) => a.localeCompare(b)), [all]);
  const withMissing = all.filter((s) => s.missing.length > 0).length;
  const filtered = query.trim() !== "" || character !== "" || quick !== "all";
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((s) => {
      if (q && !s.character.toLowerCase().includes(q) && !s.location.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      if (character && s.character !== character) return false;
      if (quick === "missing" && s.missing.length === 0) return false;
      return true;
    });
  }, [all, query, character, quick]);
  const clearFilters = () => {
    setQuery("");
    setCharacter("");
    setQuick("all");
  };

  const toggle = (name: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  const allChecked = rows.length > 0 && rows.every((s) => selected.has(s.name));
  const someChecked = !allChecked && rows.some((s) => selected.has(s.name));

  const columns = useMemo<DataTableColumn<SaveEntry>[]>(
    () => [
      {
        id: "check",
        label: t("saves.selectAll"),
        header: (
          <Checkbox
            aria-label={t("saves.selectAll")}
            checked={allChecked}
            indeterminate={someChecked}
            onCheckedChange={(on) => setSelected(on ? new Set(rows.map((s) => s.name)) : new Set())}
          />
        ),
        width: 36,
        cell: (s) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox aria-label={t("saves.select", { name: saveLabel(s) })} checked={selected.has(s.name)} onCheckedChange={(on) => toggle(s.name, on)} />
          </span>
        ),
      },
      { id: "shot", label: "", width: 88, cell: (s) => <SaveThumb instance={instance} save={s} /> },
      {
        id: "character",
        label: t("saves.column.character"),
        width: 220,
        grow: true,
        cell: (s) => (
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium text-fg">{s.readable ? s.character : s.name}</span>
            <span className="truncate text-xs text-fg-muted">
              {s.readable
                ? [saveKindText(i18n, s), t("saves.level", { level: s.level }), s.race, gameTimeText(i18n, s, true)].filter(Boolean).join(" · ")
                : t("saves.unreadable")}
            </span>
          </span>
        ),
      },
      { id: "location", label: t("saves.column.location"), width: 170, cell: (s) => <span className="truncate text-fg-muted">{s.location}</span> },
      { id: "saved", label: t("saves.column.saved"), width: 140, cell: (s) => <span className="truncate text-fg-muted">{i18n.formatDateTime(s.savedAt || s.modTime)}</span> },
      {
        id: "plugins",
        label: t("saves.column.plugins"),
        width: 118,
        cell: (s) =>
          !data?.pluginsChecked || !s.readable ? (
            <span className="text-fg-muted">{t("common.empty")}</span>
          ) : s.missing.length > 0 ? (
            <span data-intent="warning" className="flex items-center gap-1.5 text-xs font-medium text-intent-text">
              <TriangleAlertIcon size="xs" />
              {tp("saves.missingShort", s.missing.length)}
            </span>
          ) : (
            <span data-intent="success" className="flex items-center gap-1.5 text-xs font-medium text-intent-text">
              <CheckIcon size="xs" />
              {t("saves.allActive")}
            </span>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n, t, instance, data?.pluginsChecked, selected, rows, allChecked, someChecked],
  );

  const chosen = [...selected];
  let meta: React.ReactNode = null;
  if (data) {
    meta = (
      <>
        <Indicator variant="chip" icon={Save} value={i18n.formatNumber(all.length)} label={tp("saves.header.count", all.length)} />
        <Indicator variant="chip" lead={t("saves.header.characters")} value={i18n.formatNumber(characters.length)} label="" />
        {data.pluginsChecked && withMissing > 0 ? (
          <Indicator variant="chip" intent="warning" icon={TriangleAlertIcon} value={i18n.formatNumber(withMissing)} label={t("saves.header.missing")} />
        ) : null}
      </>
    );
  }

  const current = all.find((s) => s.name === inspected) ?? null;

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      className="focus:outline-none"
      title={t("nav.saves")}
      meta={meta}
      primaryActions={
        <>
          <Button startIcon={<FolderIcon size="sm" />} onClick={() => void run(() => backend.openSavesFolder(instance))}>
            {t("saves.action.openFolder")}
          </Button>
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              <Button size="icon" aria-label={t("mods.toolbar.more")} title={t("mods.toolbar.more")}>
                <MoreHorizontalIcon size="sm" />
              </Button>
            </Menu.Trigger>
            <Menu.Content>
              <Menu.Item onSelect={() => list.reload()}>{t("saves.action.reload")}</Menu.Item>
              <Menu.Item onSelect={() => navigate({ view: "profiles" })}>{t("saves.action.profiles")}</Menu.Item>
            </Menu.Content>
          </Menu.Root>
        </>
      }
    >
      <BusyBand />
      {list.status === "error" ? <ErrorAlert title="saves.loadError" error={list.error} onRetry={list.reload} /> : null}
      {list.status === "loading" ? <LoadingState /> : null}
      {data ? (
        <>
          <LocalBand view={data} onChange={(on) => void run(() => backend.setLocalSaves(data.profile, on))} />
          {all.length === 0 ? (
            <HonestEmpty icon={Save} title="saves.emptyTitle" description={data.local ? "saves.emptyLocal" : "saves.emptyShared"} />
          ) : (
            <>
              <div className="mt-1 flex h-14 shrink-0 items-center gap-2.5">
                <div className="w-70 shrink-0">
                  <Input.Root fullWidth value={query} onChange={setQuery}>
                    <Input.Box>
                      <SearchIcon size="sm" className="text-fg-muted" />
                      <Input.Field data-page-search aria-label={t("saves.search")} placeholder={t("saves.search")} />
                    </Input.Box>
                  </Input.Root>
                </div>
                <div className="w-44 shrink-0">
                  <Input.Root fullWidth value={character} onChange={setCharacter}>
                    <Input.Select
                      aria-label={t("saves.filter.character")}
                      options={[{ value: "", label: t("saves.filter.characterAll") }, ...characters.map((c) => ({ value: c, label: c }))]}
                    />
                  </Input.Root>
                </div>
                <SegmentedControl<QuickFilter>
                  aria-label={t("mods.quick.label")}
                  className="ml-1.5"
                  value={quick}
                  onChange={setQuick}
                  options={[
                    { value: "all", label: <span className="whitespace-nowrap">{t("saves.filter.all")} <span className="text-xs text-fg-muted">{all.length}</span></span> },
                    {
                      value: "missing",
                      label: (
                        <span className="whitespace-nowrap">
                          {t("saves.filter.missing")}{" "}
                          <span data-intent={withMissing > 0 ? "warning" : undefined} className={`text-xs ${withMissing > 0 ? "font-semibold text-intent-text" : "text-fg-muted"}`}>
                            {withMissing}
                          </span>
                        </span>
                      ),
                    },
                  ]}
                />
                <span className="flex-1" />
                {chosen.length > 0 ? (
                  <>
                    <Typography variant="body-sm" color="muted-fg" className="shrink-0 whitespace-nowrap">
                      {tp("saves.selection", chosen.length)}
                    </Typography>
                    <Button intent="brand" className="shrink-0 whitespace-nowrap" onClick={() => setTransfer(chosen)}>
                      {t("saves.action.transfer")}
                    </Button>
                    <Button intent="danger" className="shrink-0" onClick={() => setDeleting(chosen)}>
                      {t("saves.action.delete")}
                    </Button>
                  </>
                ) : null}
              </div>

              <div className={`mt-2 grid min-h-0 flex-1 gap-4 ${current ? "grid-cols-[minmax(0,1fr)_21.25rem]" : "grid-cols-1"}`}>
                <DataTable
                  aria-label={t("saves.tableLabel")}
                  className="min-h-0 min-w-0 flex-1"
                  columns={columns}
                  rows={rows}
                  getRowId={(s) => s.name}
                  selectionMode="multiple"
                  selectedIds={selected}
                  onSelectedIdsChange={setSelected}
                  onFocusedIdChange={(id) => id && setInspected(id)}
                  onRowActivate={(s) => setInspected(s.name)}
                  density="relaxed"
                  empty={<NoMatch message="saves.noMatch" onClear={filtered ? clearFilters : undefined} />}
                  labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
                />
                {current ? (
                  <SavePanel
                    instance={instance}
                    save={current}
                    pluginsChecked={data.pluginsChecked}
                    onClose={() => setInspected(null)}
                    onTransfer={() => setTransfer([current.name])}
                    onDelete={() => setDeleting([current.name])}
                  />
                ) : null}
              </div>
            </>
          )}
          <SaveTransferDialog instance={instance} view={data} names={transfer} onClose={() => setTransfer(null)} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            type="danger"
            title={tp("saves.delete.title", deleting?.length ?? 0)}
            description={t("saves.delete.description")}
            confirmLabel={t("saves.action.delete")}
            cancelLabel={t("common.cancel")}
            onConfirm={() => {
              const names = deleting ?? [];
              setDeleting(null);
              void run(() => backend.deleteSaves(instance, names), { success: "saves.deleted" });
            }}
          />
        </>
      ) : null}
    </ResourcePage>
  );
}

/** The band "Saves próprios de <perfil>" with its switch (board JogoSaves). */
function LocalBand({ view, onChange }: { view: SavesView; onChange: (on: boolean) => void }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("saves.local.label")} className="flex shrink-0 items-center gap-3 rounded-card border border-border-subtle bg-surface px-3.5 py-3 text-sm">
      <LayersIcon size="sm" intent="brand" className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-fg">{t(view.local ? "saves.local.onTitle" : "saves.local.offTitle", { profile: view.profileName })}</span>
        <span className="text-fg-muted">{t(view.local ? "saves.local.onHelp" : "saves.local.offHelp")}</span>
      </span>
      <span className="shrink-0 whitespace-nowrap">
        <Switch size="xs" checked={view.local} onCheckedChange={onChange} label={t("saves.local.switch")} />
      </span>
    </section>
  );
}

function SaveThumb({ instance, save }: { instance: string; save: SaveEntry }) {
  const { t } = useI18n();
  const src = useScreenshot(instance, save);
  return (
    <span role="img" aria-label={t("saves.screenshotOf", { name: saveLabel(save) })} className="flex h-10 w-18 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-sunken text-fg-subtle">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon icon={ImageIcon} size="sm" />}
    </span>
  );
}

function saveLabel(s: SaveEntry) {
  return s.readable ? `${s.character}, ${s.name}` : s.name;
}

/** The panel of the chosen save (board JogoSaves, aside). */
function SavePanel({
  instance,
  save,
  pluginsChecked,
  onClose,
  onTransfer,
  onDelete,
}: {
  instance: string;
  save: SaveEntry;
  pluginsChecked: boolean;
  onClose: () => void;
  onTransfer: () => void;
  onDelete: () => void;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const src = useScreenshot(instance, save);
  const providers = new Set(save.missing.flatMap((m) => m.mods.filter((x) => !x.enabled).map((x) => x.id)));
  const fixable = save.missing.some((m) => m.present || m.mods.length > 0);
  return (
    <aside aria-label={t("saves.panel.label")} className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div className="relative h-29.5 shrink-0 border-b border-border bg-surface-sunken">
        {src ? <img src={src} alt={t("saves.screenshotOf", { name: saveLabel(save) })} className="h-full w-full object-cover" /> : null}
        <span className="absolute bottom-2.5 left-3 rounded-sm bg-surface-overlay px-2 py-0.5 text-xs text-fg-muted">{t("saves.panel.screenshot")}</span>
      </div>
      <div className="flex shrink-0 flex-col gap-1 border-b border-border px-4 pb-2.5 pt-3">
        <span className="flex items-start justify-between gap-2">
          <span className="text-md font-semibold text-fg">{save.readable ? save.character : save.name}</span>
          <Button size="icon-sm" emphasis="low" aria-label={t("saves.panel.close")} title={t("saves.panel.close")} onClick={onClose}>
            <XIcon size="sm" />
          </Button>
        </span>
        {save.readable ? (
          <span className="text-xs text-fg-muted">{[saveKindText(i18n, save), t("saves.level", { level: save.level }), save.race].filter(Boolean).join(" · ")}</span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-auto px-4 py-3.5 text-sm">
        {save.readable ? (
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.75">
            <dt className="text-fg-muted">{t("saves.panel.location")}</dt>
            <dd className="text-fg">{save.location}</dd>
            <dt className="text-fg-muted">{t("saves.panel.gameTime")}</dt>
            <dd className="text-fg">{gameTimeText(i18n, save, false)}</dd>
            <dt className="text-fg-muted">{t("saves.panel.saved")}</dt>
            <dd className="text-fg">{i18n.formatDateTime(save.savedAt || save.modTime)}</dd>
            <dt className="text-fg-muted">{t("saves.panel.file")}</dt>
            <dd className="truncate font-mono text-xs text-fg" title={save.name}>
              {save.name}
            </dd>
          </dl>
        ) : (
          <Alert.Root intent="danger">
            <Alert.Description>{t("saves.unreadableDetail", { reason: save.readError ?? "" })}</Alert.Description>
          </Alert.Root>
        )}
        {pluginsChecked && save.missing.length > 0 ? (
          <>
            <Alert.Root intent="warning">
              <Alert.Description>{tp("saves.panel.missingWarning", save.missing.length)}</Alert.Description>
            </Alert.Root>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("saves.panel.missingTitle")}</span>
              {save.missing.map((m) => {
                const absent = !m.present && m.mods.length === 0;
                const source = absent
                  ? t("saves.panel.noProvider")
                  : m.mods.length > 0
                    ? t(m.mods.some((x) => !x.enabled) ? "saves.panel.fromDisabled" : "saves.panel.from", { mod: m.mods.map((x) => x.name).join(", ") })
                    : t("saves.panel.inactive");
                return (
                  <div key={m.name} className="flex items-center gap-2">
                    <span data-intent={absent ? "danger" : "warning"} className="shrink-0 text-intent-text">
                      <Icon icon={absent ? X : Minus} size="sm" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-mono text-xs text-fg">{m.name}</span>
                      <span className="truncate text-xs text-fg-muted">{source}</span>
                    </span>
                    <span data-intent={absent ? "danger" : "warning"} className="shrink-0 text-xs text-intent-text">
                      {t(absent ? "saves.state.absent" : "saves.state.inactive")}
                    </span>
                  </div>
                );
              })}
            </div>
            {fixable ? (
              <Button
                intent="brand"
                className="self-start"
                onClick={() => void run(() => backend.enableSaveProviders(instance, save.name), { success: "saves.providersEnabled" })}
              >
                {providers.size > 0 ? tp("saves.action.enableProviders", providers.size) : t("saves.action.enablePlugins")}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      <span className="flex-1" />
      <div className="flex h-13 shrink-0 items-center gap-2 border-t border-border-subtle bg-surface-sunken pl-4 pr-3">
        <Button size="sm" onClick={onTransfer}>
          {t("saves.action.transfer")}
        </Button>
        <span className="flex-1" />
        <Button size="sm" emphasis="low" intent="danger" onClick={onDelete}>
          {t("saves.action.delete")}
        </Button>
      </div>
    </aside>
  );
}
