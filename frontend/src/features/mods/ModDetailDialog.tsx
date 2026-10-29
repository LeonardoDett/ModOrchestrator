import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, FolderIcon, GitCompareIcon, PackageIcon, RefreshIcon, TrashIcon, XIcon } from "dettmann-ui/icons";
import { Button, Icon, Input, Loader, Modal, SettingRow, StatTile, Switch, Tabs, Tag, TagAdd } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useModConflicts, useModDetails, useModIniTweaks, useModSummary, useTags } from "../../bridge/queries";
import type { FileLocation, ModDetails } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { categoryIcon, paletteColor, tagIndex } from "./category-look";
import { ConflictsTab, FilesTab, HistoryTab, InstallationTab } from "./ModDetailTabs";
import { formatSize } from "./mod-labels";

/** The key name, the same in every language. */
const ESC = "Esc";

export type ModDetailTab = "summary" | "conflicts" | "files" | "installation" | "history";

interface ModDetailDialogProps {
  instance: string;
  /** The mod shown; null closes the dialog. */
  id: string | null;
  /** Mods in the order of the list, for Previous and Next. */
  order: readonly string[];
  /** Priority of the mod in the active profile and how many have one. */
  priority?: { value: number; of: number };
  onNavigate: (id: string) => void;
  onClose: () => void;
  onRemove: (ids: string[]) => void;
  /** "Reordenar": the Move to dialog for this mod. */
  onReorder: (id: string) => void;
  onChooseWinner: (pair: { a: string; b: string; focus: FileLocation }) => void;
  /** "Abrir na página de Conflitos". */
  onOpenConflictsPage: () => void;
  /** The tab shown when the dialog opens (Resumo by default). */
  initialTab?: ModDetailTab;
}

/**
 * Detail of one mod (D121, D127; boards JogoModDetalhe, JogoModConflitos,
 * JogoModArquivos, JogoModInstalacao and JogoModHistorico): a 1040 × 780
 * modal. Summary has the full header (icon, name, category and tags); the
 * other tabs a compact one. Esc closes and the table gets the focus back on
 * the row (Modal restores the focus). Every number comes from the backend;
 * a part that could not be read is left out.
 */
export function ModDetailDialog(props: ModDetailDialogProps) {
  const { id, onClose } = props;
  if (!id) return null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="custom" className="h-[min(48.75rem,90vh)] w-full max-w-[min(65rem,95vw)]" aria-describedby={undefined}>
        <DetailBody key={id} {...props} id={id} />
      </Modal.Content>
    </Modal.Root>
  );
}

/** The category square: 52 px in the summary header, 40 px in the compact one. */
function ModTile({ mod, large }: { mod: ModDetails | null; large: boolean }) {
  const color = paletteColor(mod?.categoryColor);
  const glyph = categoryIcon(mod?.categoryIcon);
  const shape = large ? "size-13 rounded-card" : "size-10 rounded-control";
  return (
    <span data-category={color} className={`flex shrink-0 items-center justify-center ${shape} ${color ? "bg-intent-subtle text-intent-text" : "bg-sunken text-fg-muted"}`}>
      <Icon icon={glyph ?? PackageIcon} size={large ? "lg" : "md"} />
    </span>
  );
}

function DetailBody({ instance, id, order, priority, onNavigate, onClose, onRemove, onReorder, onChooseWinner, onOpenConflictsPage, initialTab }: ModDetailDialogProps & { id: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const details = useModDetails(id);
  const conflicts = useModConflicts(instance, id);
  const [tab, setTab] = useState<ModDetailTab>(initialTab ?? "summary");
  const mod = details.status === "ready" ? details.data : null;
  const index = order.indexOf(id);
  const opponents = conflicts.status === "ready" ? conflicts.data.opponents.length : 0;
  const unreviewed = conflicts.status === "ready" ? conflicts.data.opponents.filter((o) => o.needsReview).length : 0;
  const summary = tab === "summary";

  // The compact header: category · version · size · priority.
  const facts: string[] = [];
  if (mod) {
    facts.push(mod.categoryPath.length > 0 ? mod.categoryPath.join(" › ") : t("mods.noCategory"));
    if (mod.version) facts.push(t("mods.detail.versionLine", { version: mod.version }));
    facts.push(formatSize(i18n.language, mod.size));
    if (priority) facts.push(t("mods.detail.priorityLine", { value: priority.value, of: priority.of }));
  }

  let activeToggle: React.ReactNode = null;
  if (mod && mod.state === "installed") {
    activeToggle = (
      <>
        <span className="text-[0.8125rem] text-fg-muted">{t("mods.detail.active")}</span>
        <Switch
          size="sm"
          checked={mod.enabled}
          disabled={mod.queued}
          aria-label={t(mod.enabled ? "mods.toggle.disable" : "mods.toggle.enable", { name: mod.name })}
          onCheckedChange={(next) => void run(() => backend.setModsEnabled(instance, [mod.id], next))}
        />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      </>
    );
  }

  let conflictCount: React.ReactNode = null;
  if (opponents > 0) {
    conflictCount = (
      <Tag size="xs" outline={false} emphasis={unreviewed > 0 ? "medium" : "low"} {...(unreviewed > 0 ? { intent: "warning" as const } : {})}>
        {opponents}
      </Tag>
    );
  }

  return (
    <>
      <Modal.Header layout="stacked">
        <div className={summary ? "flex items-start gap-4" : "flex items-center gap-3.5"}>
          <ModTile mod={mod} large={summary} />
          <div className={`flex min-w-0 flex-1 flex-col ${summary ? "gap-2" : "gap-0.75"}`}>
            <Modal.Title size={summary ? "lg" : "md"} className="truncate">
              {mod?.name ?? t("common.loading")}
            </Modal.Title>
            {mod && summary ? <HeaderTags instance={instance} mod={mod} /> : null}
            {mod && !summary ? <span className="truncate text-xs text-fg-muted">{facts.join(" · ")}</span> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {activeToggle}
            <Button size="icon" emphasis="low" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
              <XIcon size="sm" />
            </Button>
          </div>
        </div>
        <Tabs.Root size="sm" value={tab} onValueChange={(v) => setTab(v as ModDetailTab)}>
          <Tabs.List aria-label={t("mods.detail.sections")}>
            <Tabs.Trigger value="summary">{t("mods.detail.summary")}</Tabs.Trigger>
            <Tabs.Trigger value="conflicts">
              {t("mods.tab.conflicts")}
              {conflictCount}
            </Tabs.Trigger>
            <Tabs.Trigger value="files">
              {t("mods.tab.files")}
              {mod?.installation ? <span className="text-xs font-normal">{i18n.formatNumber(mod.installation.files)}</span> : null}
            </Tabs.Trigger>
            <Tabs.Trigger value="installation">{t("mods.tab.installation")}</Tabs.Trigger>
            <Tabs.Trigger value="history">{t("mods.tab.history")}</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </Modal.Header>

      <Modal.Body className="flex min-h-0 flex-col p-0">
        {details.status === "loading" ? <Loader label={t("common.loading")} /> : null}
        {details.status === "error" ? (
          <div className="px-6 py-4">
            <ErrorAlert title="mods.loadError" error={details.error} onRetry={details.reload} />
          </div>
        ) : null}
        {mod && tab === "summary" ? (
          <Summary instance={instance} mod={mod} priority={priority} onRemove={onRemove} onReorder={() => onReorder(mod.id)} onOpenConflictsPage={onOpenConflictsPage} />
        ) : null}
        {mod && tab === "conflicts" ? <ConflictsTab instance={instance} mod={mod} onOpenConflictsPage={onOpenConflictsPage} /> : null}
        {mod && tab === "files" ? <FilesTab instance={instance} mod={mod} onChooseWinner={onChooseWinner} /> : null}
        {mod && tab === "installation" ? <InstallationTab instance={instance} mod={mod} /> : null}
        {mod && tab === "history" ? <HistoryTab id={id} /> : null}
      </Modal.Body>

      <Modal.Footer size="sm">
        <span className="flex items-center gap-1.5">
          {index >= 0 ? t("mods.detail.positionOf", { index: i18n.formatNumber(index + 1), total: i18n.formatNumber(order.length) }) : null}
          <kbd className="rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-[0.6875rem]">{ESC}</kbd>
          {t("mods.detail.escCloses")}
        </span>
        <span className="flex gap-1.5">
          <Button size="sm" disabled={index <= 0} startIcon={<ChevronLeftIcon size="sm" />} onClick={() => onNavigate(order[index - 1]!)}>
            {t("mods.detail.previous")}
          </Button>
          <Button size="sm" disabled={index < 0 || index >= order.length - 1} endIcon={<ChevronRightIcon size="sm" />} onClick={() => onNavigate(order[index + 1]!)}>
            {t("mods.detail.next")}
          </Button>
        </span>
      </Modal.Footer>
    </>
  );
}

/** Category chip and tags under the name; "+ tag" adds one in place, the x of a tag removes it. */
function HeaderTags({ instance, mod }: { instance: string; mod: ModDetails }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const tags = useTags(instance);
  const defs = tagIndex(tags.status === "ready" ? tags.data : []);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const glyph = categoryIcon(mod.categoryIcon);
  const color = paletteColor(mod.categoryColor);
  const setTags = (next: string[]) =>
    void run(() =>
      backend.setModAttributes(mod.id, { name: mod.name, version: mod.version, author: mod.author, notes: mod.notes, highlight: mod.highlight ?? "", tags: next }),
    );
  const add = () => {
    const name = draft.trim();
    setAdding(false);
    setDraft("");
    if (name && !mod.tags.some((g) => g.toLowerCase() === name.toLowerCase())) setTags([...mod.tags, name]);
  };
  let adder: React.ReactNode;
  if (adding) {
    adder = (
      <Input.Root value={draft} onChange={setDraft}>
        <Input.Box className="h-6 w-36">
          <Input.Field
            autoFocus
            aria-label={t("mods.detail.newTag")}
            list="mod-detail-tags"
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
                setDraft("");
              }
            }}
          />
        </Input.Box>
        <datalist id="mod-detail-tags">
          {[...defs.values()].map((d) => (
            <option key={d.name} value={d.name} />
          ))}
        </datalist>
      </Input.Root>
    );
  } else {
    adder = <TagAdd onClick={() => setAdding(true)}>+ {t("mods.detail.addTag").toLowerCase()}</TagAdd>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mod.categoryPath.length > 0 ? (
        <Tag shape="rounded" outline={false} {...(color ? { color } : {})} {...(glyph ? { icon: glyph } : {})}>
          {mod.categoryPath.join(" › ")}
        </Tag>
      ) : (
        <span className="text-xs text-fg-muted">{t("mods.noCategory")}</span>
      )}
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      {mod.tags.map((g) => {
        const c = paletteColor(defs.get(g.toLowerCase())?.color);
        return (
          <Tag
            key={g}
            size="sm"
            outline={false}
            dot
            value={g}
            {...(c ? { color: c } : {})}
            removeLabel={t("mods.detail.removeTag", { name: g })}
            onRemove={(v) => setTags(mod.tags.filter((x) => x !== v))}
          >
            {g}
          </Tag>
        );
      })}
      {adder}
    </div>
  );
}

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </h3>
  );
}

function Summary({
  instance,
  mod,
  priority,
  onRemove,
  onReorder,
  onOpenConflictsPage,
}: {
  instance: string;
  mod: ModDetails;
  priority?: { value: number; of: number };
  onRemove: (ids: string[]) => void;
  onReorder: () => void;
  onOpenConflictsPage: () => void;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const summary = useModSummary(instance, mod.id);
  const s = summary.status === "ready" ? summary.data : null;
  const loading = summary.status === "loading";
  const busy = mod.state === "installing" || mod.queued;
  const installed = mod.state === "installed";
  const lost = s?.conflicts?.filesLost ?? 0;
  const won = s?.conflicts?.filesWon ?? 0;
  const missing = s?.requirements ? s.requirements.present < s.requirements.total : false;
  const empty = t("common.empty");

  const cells: { label: MessageKey; value: string }[] = [
    { label: "mods.field.version", value: mod.version || empty },
    { label: "mods.field.size", value: formatSize(i18n.language, mod.size) },
    { label: "mods.installation.files", value: mod.installation ? i18n.formatNumber(mod.installation.files) : empty },
    { label: "mods.column.priority", value: priority ? t("mods.detail.priorityOf", { value: priority.value, of: priority.of }) : empty },
    { label: "mods.field.author", value: mod.author || empty },
    { label: "mods.detail.installed", value: i18n.formatAgo(mod.installedAt) },
    { label: "mods.detail.updated", value: i18n.formatAgo(mod.installation?.createdAt ?? mod.installedAt) },
    { label: "mods.field.source", value: mod.archive?.name || mod.source || empty },
  ];

  let primary: React.ReactNode;
  if (installed) {
    primary = (
      <Button
        disabled={busy || !mod.archive?.retained}
        title={!mod.archive?.retained ? t("error.reinstall_archive_missing") : undefined}
        startIcon={<RefreshIcon size="sm" />}
        onClick={() => void run(() => backend.reinstallMods(instance, [mod.id]))}
      >
        {t("mods.action.reinstall")}
      </Button>
    );
  } else {
    primary = (
      <Button emphasis="high" disabled={busy || !mod.archive?.retained} startIcon={<PackageIcon size="sm" />} onClick={() => void run(() => backend.installMods(instance, [mod.id]))}>
        {t("mods.action.install")}
      </Button>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-auto px-6 py-4.5">
      <div role="group" aria-label={t("mods.detail.quickActions")} className="flex items-center gap-2">
        <Button disabled={busy || priority === undefined} startIcon={<ArrowUpDownIcon size="sm" />} onClick={onReorder}>
          {t("mods.detail.reorder")}
        </Button>
        {primary}
        <Button disabled={busy} startIcon={<FolderIcon size="sm" />} onClick={() => void run(() => backend.openModFolder(mod.id))}>
          {t("mods.detail.openFolder")}
        </Button>
        <span className="flex-1" />
        <Button emphasis="low" intent="danger" disabled={busy} startIcon={<TrashIcon size="sm" />} onClick={() => onRemove([mod.id])}>
          {t("mods.detail.remove")}
        </Button>
      </div>

      <section aria-labelledby="mod-numbers" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <SectionTitle id="mod-numbers">{t("mods.detail.numbers")}</SectionTitle>
          <Button size="inline" emphasis="low" intent="brand" onClick={onOpenConflictsPage}>
            {t("mods.detail.openConflicts")}
          </Button>
        </div>
        <StatTile.Grid columns={4} className="gap-3">
          <StatTile
            size="lg"
            outlined
            label={t("mods.detail.loses")}
            icon={ArrowDownIcon}
            loading={loading}
            value={s?.conflicts ? i18n.formatNumber(lost) : empty}
            unit={tp("mods.detail.filesUnit", lost)}
            {...(lost > 0 ? { intent: "danger" as const } : {})}
          />
          <StatTile
            size="lg"
            label={t("mods.detail.wins")}
            icon={ArrowUpIcon}
            loading={loading}
            value={s?.conflicts ? i18n.formatNumber(won) : empty}
            unit={tp("mods.detail.filesUnit", won)}
            {...(won > 0 ? { intent: "success" as const } : {})}
          />
          <StatTile
            size="lg"
            label={t("mods.detail.opponents")}
            icon={GitCompareIcon}
            loading={loading}
            value={s?.conflicts ? i18n.formatNumber(s.conflicts.opponents) : empty}
            unit={t("mods.detail.modsUnit")}
          />
          <StatTile
            size="lg"
            outlined={missing}
            label={t("mods.detail.requirements")}
            icon={missing ? XIcon : CheckIcon}
            loading={loading}
            value={s?.requirements ? `${s.requirements.present}/${s.requirements.total}` : empty}
            unit={t("mods.detail.present")}
            {...(s?.requirements ? { intent: missing ? ("danger" as const) : ("success" as const) } : {})}
          />
        </StatTile.Grid>
      </section>

      <section aria-labelledby="mod-data" className="flex flex-col gap-2.5">
        <SectionTitle id="mod-data">{t("mods.detail.data")}</SectionTitle>
        <dl className="grid grid-cols-4 overflow-hidden rounded-card border border-border">
          {cells.map((c) => (
            <div key={c.label} className="flex min-w-0 flex-col gap-0.75 border-b border-r border-border-subtle px-4 py-3">
              <dt className="text-xs text-fg-muted">{t(c.label)}</dt>
              <dd className="truncate text-sm font-medium text-fg" title={c.value}>
                {c.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <IniTweaks mod={mod} />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <section aria-labelledby="mod-description" className="flex min-h-28 flex-col gap-1.5">
          <SectionTitle id="mod-description">{t("mods.detail.description")}</SectionTitle>
          <div className="min-h-0 flex-1 overflow-auto rounded-card border border-border px-3 py-2.5 text-[0.8125rem] leading-normal text-fg-muted">
            {mod.description || t("mods.detail.noDescription")}
          </div>
        </section>
        <Notes mod={mod} />
      </div>
    </div>
  );
}

/**
 * "Ajustes de INI" (D149): one line per INI tweak the mod brings, with the
 * settings file it applies to, its keys and a switch. Only when the mod has
 * tweaks and the game has game_settings.
 */
function IniTweaks({ mod }: { mod: ModDetails }) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const tweaks = useModIniTweaks(mod.id);
  const list = tweaks.status === "ready" && tweaks.data.supported ? tweaks.data.tweaks : [];
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="mod-ini-tweaks" className="flex flex-col gap-2.5">
      <SectionTitle id="mod-ini-tweaks">{t("mods.detail.iniTweaks")}</SectionTitle>
      <div className="flex flex-col divide-y divide-border-subtle rounded-card border border-border px-4">
        {list.map((tw) => (
          <SettingRow
            key={tw.path}
            label={tw.name}
            description={t("mods.detail.iniTweakTarget", { file: tw.file, keys: tp("mods.detail.iniTweakKeysN", tw.keys) })}
            control={
              <Switch
                size="xs"
                aria-label={t("mods.detail.iniTweakSwitch", { name: tw.name })}
                checked={tw.enabled}
                onCheckedChange={(on) => void run(() => backend.setIniTweak(mod.id, tw.path, on)).then(tweaks.reload)}
              />
            }
          />
        ))}
      </div>
    </section>
  );
}

/** "Suas notas": edited in place, saved when the field loses the focus. */
function Notes({ mod }: { mod: ModDetails }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [draft, setDraft] = useState(mod.notes);
  useEffect(() => setDraft(mod.notes), [mod.id, mod.notes]);
  const save = () => {
    if (draft === mod.notes) return;
    void run(() =>
      backend.setModAttributes(mod.id, { name: mod.name, version: mod.version, author: mod.author, notes: draft, highlight: mod.highlight ?? "", tags: mod.tags }),
    );
  };
  return (
    <section aria-labelledby="mod-notes" className="flex min-h-28 flex-col gap-1.5">
      <SectionTitle id="mod-notes">{t("mods.detail.notes")}</SectionTitle>
      <Input.Root fullWidth value={draft} onChange={setDraft} className="min-h-0 flex-1">
        <Input.Box className="h-full items-stretch rounded-card bg-sunken px-3 py-2.5">
          <Input.Textarea aria-labelledby="mod-notes" placeholder={t("mods.detail.notesPlaceholder")} className="resize-none text-[0.8125rem] leading-normal" onBlur={save} />
        </Input.Box>
      </Input.Root>
    </section>
  );
}

