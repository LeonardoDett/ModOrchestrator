import { useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { PackageIcon, PlusIcon, XIcon } from "dettmann-ui/icons";
import { Button, Icon, Input, Modal, SwatchPicker, Tag, Typography } from "dettmann-ui";
import { errorMessage, type UIError } from "../../bridge/errors";
import { useBackend } from "../../bridge/backend-context";
import { useCategories, useModList, useTags, useWorkspace } from "../../bridge/queries";
import type { Category, TagInfo } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { categoryIcon, colorOptions, iconOptions, paletteColor } from "./category-look";
import { CategoryTile } from "./ModsTable";
import { categoryOptions } from "./mod-labels";

export type OrganizationTab = "categories" | "tags";

const NEW = "\u0000new";

/** A label above a field, as the boards draw it (12 px, muted). */
function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-fg-muted">
      {children}
    </label>
  );
}

/**
 * Organization of the mods of one game (D123, boards JogoOrganizacao and
 * JogoOrganizacaoTags): a 1000×760 modal with the tabs Categorias and Tags,
 * a list on the left and the editor on the right. Nothing here changes the
 * deployment. The backend validates names, colors and icons.
 */
export function OrganizationDialog({
  instance,
  open,
  initialTab = "categories",
  onShowTag,
  onClose,
}: {
  instance: string;
  open: boolean;
  initialTab?: OrganizationTab;
  /** "Ver os mods com esta tag": filter the list by the tag. */
  onShowTag?: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const categories = useCategories(instance);
  const tags = useTags(instance);
  const [tab, setTab] = useState<OrganizationTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  if (!open) return null;
  const cats = categories.status === "ready" ? categories.data : [];
  const tagList = tags.status === "ready" ? tags.data : [];
  const game = ws.status === "ready" ? (ws.data.active?.gameName || ws.data.active?.name || "") : "";
  const tabButton = (id: OrganizationTab, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`focus-ring-inset flex h-9.5 items-center gap-2 px-3 text-sm font-medium motion-transition ${tab === id ? "text-fg shadow-[inset_0_-2px_0_var(--color-brand-fill)]" : "text-fg-muted hover:text-fg"}`}
    >
      {label}
      <span className="text-xs text-fg-muted">{count}</span>
    </button>
  );
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="custom" className="h-[min(47.5rem,92vh)] w-full max-w-[62.5rem]" aria-describedby="organization-help">
        <Modal.Header className="flex-col items-stretch gap-3 pb-0 pl-6 pr-5 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Modal.Title>{t("mods.organize.title")}</Modal.Title>
              <span id="organization-help" className="text-xs text-fg-muted">
                {game ? t("mods.organize.helpGame", { game }) : t("mods.organize.help")}
              </span>
            </div>
            <Button size="icon" emphasis="low" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
              <XIcon size="sm" />
            </Button>
          </div>
          <div role="tablist" aria-label={t("mods.organize.what")} className="flex gap-1">
            {tabButton("categories", t("mods.organize.categories"), cats.length)}
            {tabButton("tags", t("mods.organize.tags"), tagList.length)}
          </div>
        </Modal.Header>
        {tab === "categories" ? (
          <>
            {categories.status === "error" ? <ErrorAlert title="mods.loadError" error={categories.error} onRetry={categories.reload} /> : null}
            <CategoriesEditor key="categories" instance={instance} categories={cats} onClose={onClose} />
          </>
        ) : (
          <>
            {tags.status === "error" ? <ErrorAlert title="mods.loadError" error={tags.error} onRetry={tags.reload} /> : null}
            <TagsEditor key="tags" instance={instance} tags={tagList} onShowTag={onShowTag} onClose={onClose} />
          </>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}

/** Mods per category id, counted from the list the backend returned. */
function useCategoryCounts(instance: string): ReadonlyMap<string, number> {
  const mods = useModList(instance);
  return useMemo(() => {
    const out = new Map<string, number>();
    for (const m of mods.status === "ready" ? mods.data : []) if (m.category) out.set(m.category, (out.get(m.category) ?? 0) + 1);
    return out;
  }, [mods]);
}

/** The dashed "Nova …" button at the top of the list. */
function NewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="px-3 pb-2 pt-3">
      <button
        type="button"
        onClick={onClick}
        className="focus-ring flex h-8.5 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border-strong text-[13px] font-medium text-fg motion-transition hover:state-layer-hover"
      >
        <PlusIcon size="sm" />
        {label}
      </button>
    </div>
  );
}

/** The footer of both tabs: delete on the left, Cancelar and Salvar on the right. */
function Footer({ deleteLabel, saveLabel, canDelete, canSave, busy, onDelete, onCancel, onSave }: {
  deleteLabel: string;
  saveLabel: string;
  canDelete: boolean;
  canSave: boolean;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal.Footer className="pl-6 pr-5">
      <Button emphasis="low" intent="danger" disabled={!canDelete || busy} onClick={onDelete}>
        {deleteLabel}
      </Button>
      <span className="flex-1" />
      <span className="flex gap-2">
        <Button disabled={busy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button emphasis="high" disabled={busy || !canSave} loading={busy} onClick={onSave}>
          {saveLabel}
        </Button>
      </span>
    </Modal.Footer>
  );
}

function CategoriesEditor({ instance, categories, onClose }: { instance: string; categories: readonly Category[]; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const counts = useCategoryCounts(instance);
  const options = categoryOptions(categories);
  const ordered = useMemo(() => {
    // Tree order: each top-level category followed by its children.
    const out: { c: Category; depth: number }[] = [];
    const walk = (parent: string, depth: number) => {
      for (const c of categories.filter((x) => (x.parent ?? "") === parent).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
        out.push({ c, depth });
        walk(c.id, depth + 1);
      }
    };
    walk("", 0);
    for (const c of categories) if (!out.some((o) => o.c.id === c.id)) out.push({ c, depth: 0 });
    return out;
  }, [categories]);
  const [selected, setSelected] = useState<string>(ordered[0]?.c.id ?? NEW);
  const current = categories.find((c) => c.id === selected);
  const blank: Category = { id: "", name: "", parent: "", order: 0, color: "", icon: "" };
  const [draft, setDraft] = useState<Category>(current ?? blank);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(current ? { ...current } : blank);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, current?.id]);

  const save = async () => {
    setBusy(true);
    const result = await run(() => backend.saveCategory(instance, draft), { quiet: true });
    setBusy(false);
    if (result.ok) {
      setError(null);
      if (selected === NEW && typeof result.value === "string" && result.value) setSelected(result.value);
    } else setError(result.error);
  };
  const remove = async () => {
    if (!current) return;
    const result = await run(() => backend.deleteCategory(instance, current.id), { quiet: true });
    if (result.ok) setSelected(NEW);
    else setError(result.error);
  };
  const color = paletteColor(draft.color);
  const parentName = draft.parent ? (categories.find((c) => c.id === draft.parent)?.name ?? "") : "";
  const name = draft.name || t("mods.organize.unnamed");

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[21.25rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-r border-border">
          <NewButton label={t("mods.categories.add")} onClick={() => setSelected(NEW)} />
          <div role="tree" aria-label={t("mods.organize.categories")} className="flex min-h-0 flex-col gap-0.5 overflow-auto px-2 pb-2">
            {ordered.map(({ c, depth }) => {
              const on = c.id === selected;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="treeitem"
                  aria-selected={on}
                  onClick={() => setSelected(c.id)}
                  style={{ paddingInlineStart: depth > 0 ? "2.125rem" : "0.5rem" }}
                  className={`focus-ring-inset flex h-8.5 items-center gap-2 rounded-control pr-2 text-[13px] ${on ? "bg-selected shadow-[inset_2px_0_0_var(--color-brand-fill)]" : "hover:bg-state-hover"}`}
                >
                  <Icon icon={GripVertical} size="xs" className="text-fg-subtle" />
                  <CategoryTile color={c.color} icon={c.icon} />
                  <span className={`flex-1 truncate text-left text-fg ${depth > 0 ? "font-normal" : "font-medium"}`}>{c.name}</span>
                  <span className="text-xs text-fg-muted">{counts.get(c.id) ?? 0}</span>
                </button>
              );
            })}
            {ordered.length === 0 ? <Typography variant="body-sm" color="muted-fg" className="px-2">{t("mods.categories.empty")}</Typography> : null}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto px-6 py-4.5">
          <div className="grid grid-cols-[minmax(0,1fr)_13.75rem] gap-4">
            <div className="flex flex-col gap-1.5">
              <Input.Root fullWidth value={draft.name} onChange={(v: string) => setDraft({ ...draft, name: v })} error={error ? errorMessage(i18n, error) : false}>
                <Input.Label className="text-xs font-medium text-fg-muted">{t("mods.organize.categoryName")}</Input.Label>
                <Input.Box>
                  <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && draft.name.trim() && void save()} />
                </Input.Box>
                <Input.Error />
              </Input.Root>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>{t("mods.categories.parent")}</FieldLabel>
              <Input.Root fullWidth value={draft.parent ?? ""} onChange={(v: string) => setDraft({ ...draft, parent: v })}>
                <Input.Select aria-label={t("mods.categories.parent")} options={[{ value: "", label: t("mods.categories.topLevel") }, ...options.filter((o) => o.value !== draft.id)]} />
              </Input.Root>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>{t("mods.organize.color")}</FieldLabel>
            <SwatchPicker
              aria-label={t("mods.organize.color")}
              columns={8}
              size="md"
              tint="self"
              className="gap-2"
              value={draft.color ?? ""}
              onValueChange={(v) => setDraft({ ...draft, color: v })}
              options={colorOptions(i18n)}
              renderSwatch={(o, { checked }) => (
                <>
                  <span className="flex size-3.5 items-center justify-center rounded-pill bg-intent-fill text-on-intent">{checked ? <span className="size-1.5 rounded-pill bg-current" /> : null}</span>
                  {o.label}
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>{t("mods.organize.icon")}</FieldLabel>
            <SwatchPicker
              aria-label={t("mods.organize.icon")}
              columns={12}
              size="sm"
              {...(color ? { tint: color } : {})}
              value={draft.icon ?? ""}
              onValueChange={(v) => setDraft({ ...draft, icon: v })}
              options={iconOptions(i18n)}
              renderSwatch={(o) => {
                const g = categoryIcon(o.value);
                return g ? <Icon icon={g} size="sm" /> : null;
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>{t("mods.organize.preview")}</FieldLabel>
            <div className="grid grid-cols-3 items-center gap-4 rounded-control border border-border bg-sunken px-4 py-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[0.6875rem] text-fg-muted">{t("mods.organize.inList")}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-fg">
                  <CategoryTile color={draft.color} icon={draft.icon} />
                  {parentName ? `${parentName} › ${name}` : name}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[0.6875rem] text-fg-muted">{t("mods.organize.asSeparator")}</span>
                <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <CategoryTile color={draft.color} icon={draft.icon} />
                  {name}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[0.6875rem] text-fg-muted">{t("mods.organize.asTab")}</span>
                <span className="flex h-6.5 items-center gap-2 self-start text-[13px] font-medium text-fg shadow-[inset_0_-2px_0_var(--color-brand-fill)]">
                  <CategoryTile color={draft.color} icon={draft.icon} />
                  {name}
                  <span className="text-xs text-fg-muted">{current ? (counts.get(current.id) ?? 0) : 0}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer
        deleteLabel={t("mods.organize.deleteCategory")}
        saveLabel={t("mods.organize.saveCategory")}
        canDelete={Boolean(current)}
        canSave={Boolean(draft.name.trim())}
        busy={busy}
        onDelete={() => void remove()}
        onCancel={onClose}
        onSave={() => void save()}
      />
    </>
  );
}

function TagsEditor({ instance, tags, onShowTag, onClose }: { instance: string; tags: readonly TagInfo[]; onShowTag?: (name: string) => void; onClose: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const mods = useModList(instance);
  const [selected, setSelected] = useState<string>(tags[0]?.name ?? NEW);
  const current = tags.find((x) => x.name === selected);
  const [name, setName] = useState(current?.name ?? "");
  const [color, setColor] = useState(current?.color ?? "");
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(current?.name ?? "");
    setColor(current?.color ?? "");
    setError(null);
  }, [selected, current?.name, current?.color]);

  const save = async () => {
    setBusy(true);
    const input = current ? { name: current.name, newName: name.trim(), color } : { name: name.trim(), color };
    const result = await run(() => backend.saveTag(instance, input), { quiet: true });
    setBusy(false);
    if (result.ok) {
      setError(null);
      setSelected(typeof result.value === "string" && result.value ? result.value : name.trim());
    } else setError(result.error);
  };
  const remove = async () => {
    if (!current) return;
    const result = await run(() => backend.deleteTag(instance, current.name), { quiet: true });
    if (result.ok) setSelected(NEW);
    else setError(result.error);
  };
  const pc = paletteColor(color);
  // Preview: a mod that carries the tag, as the list shows it.
  const sample = mods.status === "ready" && current ? mods.data.find((m) => (m.tags ?? []).some((g) => g.toLowerCase() === current.name.toLowerCase())) : undefined;

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[21.25rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-r border-border">
          <NewButton label={t("mods.organize.newTag")} onClick={() => setSelected(NEW)} />
          <div role="listbox" aria-label={t("mods.organize.tags")} className="flex min-h-0 flex-col gap-0.5 overflow-auto px-2">
            {tags.map((x) => {
              const on = x.name === selected;
              const c = paletteColor(x.color);
              return (
                <button
                  key={x.name}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => setSelected(x.name)}
                  className={`focus-ring-inset flex h-9.5 items-center gap-2.5 rounded-control px-2.5 text-[13px] ${on ? "bg-selected shadow-[inset_2px_0_0_var(--color-brand-fill)]" : "hover:bg-state-hover"}`}
                >
                  <Tag size="sm" dot {...(c ? { color: c } : {})} className="border-transparent">
                    {x.name}
                  </Tag>
                  <span className="flex-1" />
                  <span className="text-xs text-fg-muted">{tp("mods.organize.tagMods", x.mods)}</span>
                </button>
              );
            })}
            {tags.length === 0 ? <Typography variant="body-sm" color="muted-fg" className="px-2">{t("mods.organize.noTags")}</Typography> : null}
          </div>
          <span className="mt-auto px-4 py-3.5 text-xs leading-relaxed text-fg-muted">{t("mods.organize.tagHelp")}</span>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-4.5 overflow-auto px-6 py-4.5">
          <div className="flex max-w-[26.25rem] flex-col gap-1.5">
            <Input.Root fullWidth value={name} onChange={setName} error={error ? errorMessage(i18n, error) : false}>
                <Input.Label className="text-xs font-medium text-fg-muted">{t("mods.organize.tagName")}</Input.Label>
              <Input.Box>
                <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim() && void save()} />
              </Input.Box>
              <Input.Error />
            </Input.Root>
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>{t("mods.organize.color")}</FieldLabel>
            <SwatchPicker
              aria-label={t("mods.organize.color")}
              columns={8}
              size="md"
              tint="self"
              className="gap-2"
              value={color}
              onValueChange={setColor}
              options={colorOptions(i18n)}
              renderSwatch={(o, { checked }) => (
                <>
                  <span className="flex size-3.5 items-center justify-center rounded-pill bg-intent-fill text-on-intent">{checked ? <span className="size-1.5 rounded-pill bg-current" /> : null}</span>
                  {o.label}
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel>{t("mods.organize.preview")}</FieldLabel>
            <div className="flex flex-col gap-1.5 rounded-control border border-border bg-sunken px-4 py-3.5">
              <span className="text-[13px] font-medium text-fg">{sample?.name ?? t("mods.organize.sampleMod")}</span>
              <span className="flex gap-1.5">
                <Tag size="xs" dot {...(pc ? { color: pc } : {})}>
                  {name.trim() || t("mods.organize.unnamed")}
                </Tag>
              </span>
            </div>
          </div>
          {current ? (
            <div className="flex items-center gap-3 rounded-control border border-border px-4 py-3">
              <span data-intent="brand" className="text-intent-text">
                <PackageIcon size="sm" />
              </span>
              <span className="flex-1 text-[13px] text-fg">{tp("mods.organize.usedIn", current.mods)}</span>
              {onShowTag && current.mods > 0 ? (
                <Button emphasis="low" intent="brand" size="sm" onClick={() => onShowTag(current.name)}>
                  {t("mods.organize.showTagged")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Footer
        deleteLabel={t("mods.organize.deleteTag")}
        saveLabel={t("mods.organize.saveTag")}
        canDelete={Boolean(current)}
        canSave={Boolean(name.trim())}
        busy={busy}
        onDelete={() => void remove()}
        onCancel={onClose}
        onSave={() => void save()}
      />
    </>
  );
}
