import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Swords } from "lucide-react";
import { ChevronLeftIcon, ChevronRightIcon, FolderOpenIcon, PackageIcon, PlusIcon, TrashIcon, UndoIcon } from "dettmann-ui/icons";
import { Alert, Button, Icon, Inline, Input, Loader, Modal, Progress, Stack, StatTile, StatusToggle, Tabs, Tag, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useCategories, useModConflicts, useModDetails, useModExtensions, useModHistory, useModSummary, useTags } from "../../bridge/queries";
import type { FileLocation, FomodChoice, ModDetails, ModHistoryEntry } from "../../bridge/types";
import { InspectorConflicts, InspectorFiles } from "../conflicts/InspectorConflicts";
import { useSettings } from "../../app/settings-context";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { categoryIcon, paletteColor, tagIndex } from "./category-look";
import { categoryOptions, contentLabel, formatSize, highlightIntent, highlightOptions, installerLabel, toggleLabels, toggleState } from "./mod-labels";

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
  onEditConflicts: (mod: string) => void;
  onChooseWinner: (pair: { a: string; b: string; focus: FileLocation }) => void;
  /** "Abrir na página de Conflitos". */
  onOpenConflictsPage: () => void;
}

/**
 * Detail of one mod (D121, boards JogoModDetalhe and siblings): a modal with
 * Summary, Conflicts, Files, Installation and History. It replaces the side
 * Inspector of the Mods screen. Esc closes it and the table gets the focus
 * back on the row (Modal restores the focus). Every number comes from the
 * backend; a part that could not be read is left out.
 */
export function ModDetailDialog(props: ModDetailDialogProps) {
  const { id, onClose } = props;
  if (!id) return null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" className="flex h-[min(48.75rem,90vh)] flex-col overflow-hidden" aria-describedby={undefined}>
        <DetailBody key={id} {...props} id={id} />
      </Modal.Content>
    </Modal.Root>
  );
}

function DetailBody({ instance, id, order, priority, onNavigate, onRemove, onEditConflicts, onChooseWinner, onOpenConflictsPage }: ModDetailDialogProps & { id: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const details = useModDetails(id);
  const conflicts = useModConflicts(instance, id);
  const [tab, setTab] = useState<ModDetailTab>("summary");
  const mod = details.status === "ready" ? details.data : null;
  const index = order.indexOf(id);
  const opponents = conflicts.status === "ready" ? conflicts.data.opponents.length : 0;
  const unreviewed = conflicts.status === "ready" ? conflicts.data.opponents.filter((o) => o.needsReview).length : 0;
  const glyph = categoryIcon(mod?.categoryIcon);
  const color = paletteColor(mod?.categoryColor);

  return (
    <>
      <Modal.Header className="flex flex-col gap-4 border-b border-border pb-0">
        <div className="flex items-start gap-4">
          <span
            data-category={color}
            className={`flex size-12 shrink-0 items-center justify-center rounded-card ${color ? "bg-intent-subtle text-intent-text" : "bg-surface-raised text-fg-muted"}`}
          >
            <Icon icon={glyph ?? PackageIcon} size="md" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Modal.Title>{mod?.name ?? t("common.loading")}</Modal.Title>
            {mod ? <HeaderTags instance={instance} mod={mod} /> : null}
          </div>
          {mod ? (
            <span className="flex shrink-0 items-center gap-2 text-sm text-fg-muted">
              {t("mods.detail.active")}
              <StatusToggle
                state={toggleState(mod)}
                label={t("mods.toggleLabel", { name: mod.name })}
                stateLabels={toggleLabels(i18n)}
                onCheckedChange={(next) => void run(() => backend.setModsEnabled(instance, [mod.id], next))}
              />
            </span>
          ) : null}
        </div>
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as ModDetailTab)}>
          <Tabs.List aria-label={t("mods.detail.sections")}>
            <Tabs.Trigger value="summary">{t("mods.detail.summary")}</Tabs.Trigger>
            <Tabs.Trigger value="conflicts">
              {t("mods.tab.conflicts")}
              {opponents > 0 ? <Tag size="sm" {...(unreviewed > 0 ? { intent: "warning" as const } : {})}>{opponents}</Tag> : null}
            </Tabs.Trigger>
            <Tabs.Trigger value="files">
              {t("mods.tab.files")} {mod?.installation ? <span className="text-xs text-fg-muted">{i18n.formatNumber(mod.installation.files)}</span> : null}
            </Tabs.Trigger>
            <Tabs.Trigger value="installation">{t("mods.tab.installation")}</Tabs.Trigger>
            <Tabs.Trigger value="history">{t("mods.tab.history")}</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </Modal.Header>

      <Modal.Body className="min-h-0 flex-1 overflow-auto">
        {details.status === "loading" ? <Loader label={t("common.loading")} /> : null}
        {details.status === "error" ? <ErrorAlert title="mods.loadError" error={details.error} onRetry={details.reload} /> : null}
        {mod && tab === "summary" ? <Summary instance={instance} mod={mod} priority={priority} onRemove={onRemove} onOpenConflictsPage={onOpenConflictsPage} /> : null}
        {mod && tab === "conflicts" ? (
          <Stack gap="md">
            <div className="flex items-center gap-3">
              <Typography variant="body-sm" color="muted-fg" className="flex-1">
                {t("mods.detail.conflictsHelp")}
              </Typography>
              <Button size="sm" onClick={onOpenConflictsPage}>
                {t("mods.detail.openConflicts")}
              </Button>
            </div>
            <InspectorConflicts instance={instance} mod={id} onEdit={() => onEditConflicts(id)} />
          </Stack>
        ) : null}
        {mod && tab === "files" ? (
          mod.state === "installed" ? (
            <Stack gap="md">
              <Extensions id={id} />
              <InspectorFiles instance={instance} mod={id} onChooseWinner={onChooseWinner} />
            </Stack>
          ) : (
            <Typography variant="body-sm" color="muted-fg">
              {t("mods.installation.none")}
            </Typography>
          )
        ) : null}
        {mod && tab === "installation" ? <Installation instance={instance} mod={mod} /> : null}
        {mod && tab === "history" ? <History id={id} /> : null}
      </Modal.Body>

      <Modal.Footer>
        <Typography variant="caption" color="muted-fg" className="flex-1">
          {index >= 0 ? t("mods.detail.position", { index: index + 1, total: order.length }) : null}
        </Typography>
        <Button size="sm" disabled={index <= 0} startIcon={<ChevronLeftIcon size="sm" />} onClick={() => onNavigate(order[index - 1]!)}>
          {t("mods.detail.previous")}
        </Button>
        <Button size="sm" disabled={index < 0 || index >= order.length - 1} endIcon={<ChevronRightIcon size="sm" />} onClick={() => onNavigate(order[index + 1]!)}>
          {t("mods.detail.next")}
        </Button>
      </Modal.Footer>
    </>
  );
}

/** Category and tags under the name; tags are added and removed in place. */
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mod.categoryPath.length > 0 ? (
        <Tag size="sm" {...(color ? { color } : {})} {...(glyph ? { icon: glyph } : {})}>
          {mod.categoryPath.join(" › ")}
        </Tag>
      ) : (
        <span className="text-xs text-fg-muted">{t("mods.noCategory")}</span>
      )}
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      {mod.tags.map((g) => {
        const c = paletteColor(defs.get(g.toLowerCase())?.color);
        return (
          <Tag key={g} size="sm" value={g} {...(c ? { color: c } : {})} removeLabel={t("mods.detail.removeTag", { name: g })} onRemove={(v) => setTags(mod.tags.filter((x) => x !== v))}>
            {g}
          </Tag>
        );
      })}
      {adding ? (
        <Input.Root value={draft} onChange={setDraft}>
          <Input.Box className="h-7 w-40">
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
      ) : (
        <Button size="sm" emphasis="low" startIcon={<PlusIcon size="xs" />} onClick={() => setAdding(true)}>
          {t("mods.detail.addTag")}
        </Button>
      )}
    </div>
  );
}

/** Files by extension (B8), for any game: no adapter data. */
function Extensions({ id }: { id: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const ext = useModExtensions(id);
  if (ext.status !== "ready" || ext.data.length === 0) return null;
  const top = ext.data.slice(0, 5);
  const rest = ext.data.slice(5).reduce((n, e) => n + e.files, 0);
  const segments = [
    ...top.map((e) => ({ label: e.ext || t("mods.detail.noExtension"), value: e.files })),
    ...(rest > 0 ? [{ label: t("mods.detail.otherExtensions"), value: rest }] : []),
  ];
  return <Progress.Stacked label={t("mods.detail.byType")} legend segments={segments} formatValue={(v: number) => tp("mods.detail.fileCount", v)} />;
}

function Summary({
  instance,
  mod,
  priority,
  onRemove,
  onOpenConflictsPage,
}: {
  instance: string;
  mod: ModDetails;
  priority?: { value: number; of: number };
  onRemove: (ids: string[]) => void;
  onOpenConflictsPage: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const summary = useModSummary(instance, mod.id);
  const s = summary.status === "ready" ? summary.data : null;
  return (
    <Stack gap="lg">
      <section aria-labelledby="mod-numbers" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Typography id="mod-numbers" variant="caption" color="muted-fg" className="uppercase tracking-wide">
            {t("mods.detail.numbers")}
          </Typography>
          <Button size="sm" emphasis="low" onClick={onOpenConflictsPage}>
            {t("mods.detail.openConflicts")}
          </Button>
        </div>
        <StatTile.Grid columns={4}>
          <StatTile
            label={t("mods.detail.losesTo")}
            icon={ArrowDown}
            loading={summary.status === "loading"}
            value={s?.conflicts ? i18n.formatNumber(s.conflicts.losesTo) : t("common.empty")}
            unit={t("mods.detail.modsUnit")}
            {...(s?.conflicts && s.conflicts.losesTo > 0 ? { intent: "warning" as const } : {})}
          />
          <StatTile label={t("mods.detail.winsAgainst")} icon={ArrowUp} loading={summary.status === "loading"} value={s?.conflicts ? i18n.formatNumber(s.conflicts.winsAgainst) : t("common.empty")} unit={t("mods.detail.modsUnit")} />
          <StatTile label={t("mods.detail.opponents")} icon={Swords} loading={summary.status === "loading"} value={s?.conflicts ? i18n.formatNumber(s.conflicts.opponents) : t("common.empty")} unit={t("mods.detail.modsUnit")} />
          <StatTile
            label={t("mods.detail.requirements")}
            loading={summary.status === "loading"}
            value={s?.requirements ? `${s.requirements.present}/${s.requirements.total}` : t("common.empty")}
            unit={t("mods.detail.present")}
            {...(s?.requirements && s.requirements.present < s.requirements.total ? { intent: "danger" as const } : {})}
          />
        </StatTile.Grid>
      </section>
      <section aria-labelledby="mod-data" className="flex flex-col gap-2">
        <Typography id="mod-data" variant="caption" color="muted-fg" className="uppercase tracking-wide">
          {t("mods.detail.data")}
        </Typography>
        <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-border text-sm md:grid-cols-4">
          <Cell label="mods.field.version">{mod.version || t("common.empty")}</Cell>
          <Cell label="mods.field.size">{formatSize(i18n.language, mod.size)}</Cell>
          <Cell label="mods.installation.files">{mod.installation ? i18n.formatNumber(mod.installation.files) : t("common.empty")}</Cell>
          <Cell label="mods.column.priority">{priority ? t("mods.detail.priorityOf", { value: priority.value, of: priority.of }) : t("common.empty")}</Cell>
          <Cell label="mods.field.author">{mod.author || t("common.empty")}</Cell>
          <Cell label="mods.field.installedAt">{i18n.formatAgo(mod.installedAt)}</Cell>
          <Cell label="mods.field.type">{mod.typeName || mod.type}</Cell>
          <Cell label="mods.field.source">{mod.source || t("common.empty")}</Cell>
        </dl>
      </section>
      <Overview instance={instance} mod={mod} onRemove={onRemove} />
    </Stack>
  );
}

function Cell({ label, children }: { label: MessageKey; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-r border-border-subtle px-4 py-3">
      <dt className="text-xs text-fg-muted">{t(label)}</dt>
      <dd className="truncate font-medium text-fg">{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: MessageKey; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <dt className="text-fg-muted">{t(label)}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </>
  );
}

function Overview({ instance, mod, onRemove }: { instance: string; mod: ModDetails; onRemove: (ids: string[]) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { get } = useSettings();
  const advanced = get("ui.advancedMode")?.value === "true";
  const categories = useCategories(instance);
  const [form, setForm] = useState({ name: mod.name, version: mod.version, author: mod.author, notes: mod.notes, highlight: highlightIntent(mod.highlight) ?? "" });
  useEffect(() => {
    setForm({ name: mod.name, version: mod.version, author: mod.author, notes: mod.notes, highlight: highlightIntent(mod.highlight) ?? "" });
  }, [mod.id, mod.name, mod.version, mod.author, mod.notes, mod.highlight]);
  const dirty =
    form.name !== mod.name || form.version !== mod.version || form.author !== mod.author || form.notes !== mod.notes || form.highlight !== (highlightIntent(mod.highlight) ?? "");
  const busy = mod.state === "installing" || mod.queued;

  const save = () =>
    void run(
      () =>
        backend.setModAttributes(mod.id, {
          name: form.name,
          version: form.version,
          author: form.author,
          notes: form.notes,
          highlight: form.highlight,
          tags: mod.tags,
        }),
      { success: "mods.saved" },
    );

  const highlightChoices = highlightOptions(i18n);

  return (
    <Stack gap="md">
      <Inline gap="sm" className="flex-wrap">
        {mod.state === "installed" ? (
          <Button size="sm" disabled={busy} onClick={() => void run(() => backend.setModsEnabled(instance, [mod.id], !mod.enabled))}>
            {mod.enabled ? t("mods.action.disable") : t("mods.action.enable")}
          </Button>
        ) : (
          <Button emphasis="high" size="sm" disabled={busy || !mod.archive?.retained} startIcon={<PackageIcon size="sm" />} onClick={() => void run(() => backend.installMods(instance, [mod.id]))}>
            {t("mods.action.install")}
          </Button>
        )}
        {mod.state === "installed" ? (
          <Button size="sm" disabled={busy || !mod.archive?.retained} title={!mod.archive?.retained ? t("error.reinstall_archive_missing") : undefined} startIcon={<UndoIcon size="sm" />} onClick={() => void run(() => backend.reinstallMods(instance, [mod.id]))}>
            {t("mods.action.reinstall")}
          </Button>
        ) : null}
        <Button size="sm" disabled={busy} startIcon={<FolderOpenIcon size="sm" />} onClick={() => void run(() => backend.openModFolder(mod.id))}>
          {t("mods.action.openFolder")}
        </Button>
        <Button size="sm" emphasis="low" intent="danger" disabled={busy} startIcon={<TrashIcon size="sm" />} onClick={() => onRemove([mod.id])}>
          {t("mods.action.remove")}
        </Button>
      </Inline>

      <Input.Root fullWidth value={form.name} onChange={(v: string) => setForm({ ...form, name: v })}>
        <Input.Label>{t("mods.field.name")}</Input.Label>
        <Input.Box>
          <Input.Field />
        </Input.Box>
      </Input.Root>
      <Inline gap="sm">
        <Input.Root fullWidth value={form.version} onChange={(v: string) => setForm({ ...form, version: v })}>
          <Input.Label>{t("mods.field.version")}</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
        <Input.Root fullWidth value={form.author} onChange={(v: string) => setForm({ ...form, author: v })}>
          <Input.Label>{t("mods.field.author")}</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      </Inline>
      <Input.Root fullWidth value={mod.category} onChange={(v: string) => void run(() => backend.setModsCategory(instance, [mod.id], v))}>
        <Input.Label>{t("mods.field.category")}</Input.Label>
        <Input.Select options={[{ value: "", label: t("mods.noCategory") }, ...(categories.status === "ready" ? categoryOptions(categories.data) : [])]} />
      </Input.Root>
      <Input.Root fullWidth value={form.highlight} onChange={(v: string) => setForm({ ...form, highlight: v })}>
        <Input.Label>{t("mods.field.highlight")}</Input.Label>
        <Input.Select options={highlightChoices} />
      </Input.Root>
      <Input.Root fullWidth value={form.notes} onChange={(v: string) => setForm({ ...form, notes: v })}>
        <Input.Label>{t("mods.field.notes")}</Input.Label>
        <Input.Textarea rows={4} />
      </Input.Root>
      <Inline gap="sm" className="justify-end">
        <Button emphasis="high" size="sm" disabled={!dirty || busy} onClick={save}>
          {t("common.save")}
        </Button>
      </Inline>

      {advanced && mod.state === "installed" ? (
        <Input.Root fullWidth value={mod.type} onChange={(v: string) => v !== mod.type && void run(() => backend.setModType(mod.id, v), { success: "mods.typeChanged" })}>
          <Input.Label>{t("mods.field.type")}</Input.Label>
          <Input.Select options={mod.modTypes.map((mt) => ({ value: mt.id, label: `${mt.name} → ${mt.target}` }))} />
          <Input.HelperText>{t("mods.typeHelp")}</Input.HelperText>
        </Input.Root>
      ) : null}

      {mod.description ? (
        <section className="flex flex-col gap-1">
          <Typography variant="caption" color="muted-fg" className="uppercase tracking-wide">
            {t("mods.field.description")}
          </Typography>
          <Typography variant="body-sm" color="fg">
            {mod.description}
          </Typography>
        </section>
      ) : null}
      {mod.content.length ? (
        <span className="flex flex-wrap gap-1" aria-label={t("mods.field.content")}>
          {mod.content.map((c) => (
            <Tag key={c} size="sm">
              {contentLabel(i18n, c)}
            </Tag>
          ))}
        </span>
      ) : null}
    </Stack>
  );
}

function Installation({ instance, mod }: { instance: string; mod: ModDetails }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  return (
    <Stack gap="md">
      {mod.archive ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Field label="mods.archive.name">{mod.archive.name}</Field>
          <Field label="mods.archive.size">{formatSize(i18n.language, mod.archive.size)}</Field>
          <Field label="mods.archive.retained">{t(mod.archive.retained ? "common.yes" : "common.no")}</Field>
          <Field label="mods.archive.hash">
            <span className="font-mono text-xs">{mod.archive.hash.slice(0, 16)}…</span>
          </Field>
        </dl>
      ) : null}
      {mod.archive && !mod.archive.retained ? (
        <Alert.Root intent="info">
          <Alert.Description>{t("mods.archive.notRetained")}</Alert.Description>
        </Alert.Root>
      ) : null}
      {mod.installation ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Field label="mods.installation.installer">{installerLabel(i18n, mod.installation.installer)}</Field>
          <Field label="mods.installation.root">
            {mod.installation.options.root === undefined ? t("common.empty") : mod.installation.options.root || t("mods.installation.archiveRoot")}
          </Field>
          <Field label="mods.installation.files">{mod.installation.files}</Field>
          <Field label="mods.installation.date">{i18n.formatDateTime(mod.installation.createdAt)}</Field>
        </dl>
      ) : (
        <Typography variant="body-sm" color="muted-fg">
          {t("mods.installation.none")}
        </Typography>
      )}
      {mod.installation?.choices && mod.installation.choices.length > 0 ? <FomodChoices choices={mod.installation.choices} /> : null}
      {mod.archive?.retained ? (
        <Inline gap="sm">
          <Button size="sm" startIcon={<FolderOpenIcon size="sm" />} onClick={() => void run(() => backend.openModArchive(mod.id))}>
            {t("mods.action.openArchive")}
          </Button>
          {mod.state === "installed" ? (
            <Button size="sm" disabled={mod.queued} onClick={() => void run(() => backend.reinstallMods(instance, [mod.id]))}>
              {t("mods.action.reinstall")}
            </Button>
          ) : null}
        </Inline>
      ) : null}
    </Stack>
  );
}

/** Event types are stable codes; the catalog phrases them with their params. */
function historyText(i18n: ReturnType<typeof useI18n>, e: ModHistoryEntry): string {
  const key = `mods.history.${e.type}`;
  return i18n.has(key) ? i18n.t(key, e.params) : e.type;
}

function History({ id }: { id: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const history = useModHistory(id);
  if (history.status === "error") return <ErrorAlert title="mods.loadError" error={history.error} onRetry={history.reload} />;
  if (history.status !== "ready") return <Loader label={t("common.loading")} />;
  if (history.data.length === 0) return <Typography variant="body-sm" color="muted-fg">{t("mods.history.empty")}</Typography>;
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {history.data.map((e) => (
        <li key={e.id} className="flex flex-col">
          <span className="text-fg">{historyText(i18n, e)}</span>
          <time className="text-xs text-fg-muted" dateTime={e.occurredAt}>
            {i18n.formatDateTime(e.occurredAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

/** The recorded FOMOD choices (B9), by step and group; only mods installed by a wizard have them. */
function FomodChoices({ choices }: { choices: readonly FomodChoice[] }) {
  const { t, tp } = useI18n();
  const steps = new Map<number, { name: string; groups: FomodChoice[] }>();
  for (const c of choices) {
    const step = steps.get(c.step) ?? { name: c.stepName, groups: [] };
    step.groups.push(c);
    steps.set(c.step, step);
  }
  return (
    <section aria-labelledby="fomod-choices" className="flex flex-col gap-2">
      <Typography id="fomod-choices" variant="caption" color="muted-fg" className="uppercase tracking-wide">
        {t("mods.detail.fomodChoices")}
      </Typography>
      <ol className="flex flex-col gap-3 rounded-card border border-border p-4 text-sm">
        {[...steps.entries()].map(([n, step]) => (
          <li key={n} className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              {n + 1}. {step.name || t("mods.detail.fomodStep", { n: n + 1 })}{" "}
              <span className="text-xs font-normal text-fg-muted">{tp("mods.detail.optionCount", step.groups.reduce((k, g) => k + g.names.length, 0))}</span>
            </span>
            {step.groups.map((g) => (
              <span key={g.group} className="flex flex-wrap gap-x-2 pl-4 text-fg-muted">
                <span>{g.groupName}:</span>
                <span className="text-fg">{g.names.length > 0 ? g.names.join(", ") : t("mods.detail.fomodNone")}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
