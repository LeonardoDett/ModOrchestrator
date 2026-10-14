import { useEffect, useMemo, useState } from "react";
import { PlusIcon } from "dettmann-ui/icons";
import { Alert, Button, Icon, Input, List, Modal, Stack, SwatchPicker, Tabs, Typography } from "dettmann-ui";
import { errorMessage, type UIError } from "../../bridge/errors";
import { useBackend } from "../../bridge/backend-context";
import { useCategories, useModList, useTags } from "../../bridge/queries";
import type { Category, TagInfo } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { CategoryTag, categoryIcon, colorOptions, iconOptions, paletteColor } from "./category-look";
import { categoryOptions } from "./mod-labels";

export type OrganizationTab = "categories" | "tags";

/**
 * Organization of the mods of one game (D123, board JogoOrganizacao): the
 * category tree and the tag definitions, each with a palette color (and an
 * icon for categories). Nothing here changes the deployment. The backend
 * validates names, colors and icons.
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
  const categories = useCategories(instance);
  const tags = useTags(instance);
  const [tab, setTab] = useState<OrganizationTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  if (!open) return null;
  const cats = categories.status === "ready" ? categories.data : [];
  const tagList = tags.status === "ready" ? tags.data : [];
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby="organization-help">
        <Modal.Header>
          <Modal.Title>{t("mods.organize.title")}</Modal.Title>
          <Typography id="organization-help" variant="body-sm" color="muted-fg">
            {t("mods.organize.help")}
          </Typography>
        </Modal.Header>
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as OrganizationTab)}>
          <Tabs.List aria-label={t("mods.organize.what")} className="px-4">
            <Tabs.Trigger value="categories">
              {t("mods.organize.categories")} <span className="text-xs text-fg-muted">{cats.length}</span>
            </Tabs.Trigger>
            <Tabs.Trigger value="tags">
              {t("mods.organize.tags")} <span className="text-xs text-fg-muted">{tagList.length}</span>
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="categories">
            {categories.status === "error" ? <ErrorAlert title="mods.loadError" error={categories.error} onRetry={categories.reload} /> : null}
            <CategoriesEditor instance={instance} categories={cats} onClose={onClose} />
          </Tabs.Panel>
          <Tabs.Panel value="tags">
            {tags.status === "error" ? <ErrorAlert title="mods.loadError" error={tags.error} onRetry={tags.reload} /> : null}
            <TagsEditor instance={instance} tags={tagList} onShowTag={onShowTag} onClose={onClose} />
          </Tabs.Panel>
        </Tabs.Root>
      </Modal.Content>
    </Modal.Root>
  );
}

const NEW = "\u0000new";

/** Mods per category id, counted from the list the backend returned. */
function useCategoryCounts(instance: string): ReadonlyMap<string, number> {
  const mods = useModList(instance);
  return useMemo(() => {
    const out = new Map<string, number>();
    for (const m of mods.status === "ready" ? mods.data : []) if (m.category) out.set(m.category, (out.get(m.category) ?? 0) + 1);
    return out;
  }, [mods]);
}

function CategoriesEditor({ instance, categories, onClose }: { instance: string; categories: readonly Category[]; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const counts = useCategoryCounts(instance);
  const options = categoryOptions(categories);
  const depth = (c: Category) => {
    let d = 0;
    for (let p = c.parent; p; p = categories.find((x) => x.id === p)?.parent) d++;
    return d;
  };
  const [selected, setSelected] = useState<string>(options[0]?.value ?? NEW);
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
      if (selected === NEW) setSelected(typeof result.value === "string" && result.value ? result.value : NEW);
    } else setError(result.error);
  };
  const remove = async () => {
    if (!current) return;
    const result = await run(() => backend.deleteCategory(instance, current.id), { quiet: true });
    if (result.ok) setSelected(NEW);
    else setError(result.error);
  };
  const glyph = categoryIcon(draft.icon);
  const color = paletteColor(draft.color);
  const path = [...(draft.parent ? [options.find((o) => o.value === draft.parent)?.label ?? ""] : []), draft.name || t("mods.organize.unnamed")].join(" › ");

  return (
    <>
      <div className="grid min-h-0 grid-cols-[18rem_minmax(0,1fr)] border-t border-border" style={{ height: "min(34rem, 62vh)" }}>
        <div className="flex min-h-0 flex-col gap-2 overflow-auto border-r border-border p-3">
          <Button size="sm" startIcon={<PlusIcon size="sm" />} onClick={() => setSelected(NEW)}>
            {t("mods.categories.add")}
          </Button>
          {options.length === 0 ? (
            <Typography variant="body-sm" color="muted-fg" className="px-2">
              {t("mods.categories.empty")}
            </Typography>
          ) : (
            <List.Root
              aria-label={t("mods.organize.categories")}
              selectionMode="single"
              items={options.map((o) => categories.find((x) => x.id === o.value)!)}
              getItemKey={(c) => c.id}
              selectedKeys={[selected]}
              onSelectedChange={(k) => k[0] && setSelected(k[0])}
              renderItem={(c) => {
                const g = categoryIcon(c.icon);
                const pc = paletteColor(c.color);
                return (
                  <List.Item
                    title={<span style={{ paddingInlineStart: `${depth(c) * 1.25}rem` }}>{c.name}</span>}
                    start={
                      <span data-category={pc} className={`flex size-5 items-center justify-center rounded-chip ${pc ? "bg-intent-subtle text-intent-text" : "bg-surface-raised text-fg-muted"}`}>
                        {g ? <Icon icon={g} size="xs" /> : null}
                      </span>
                    }
                    meta={String(counts.get(c.id) ?? 0)}
                  />
                );
              }}
            />
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-auto p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_14rem] gap-4">
            <Input.Root fullWidth value={draft.name} onChange={(v: string) => setDraft({ ...draft, name: v })} error={error ? errorMessage(i18n, error) : false}>
              <Input.Label>{t("mods.organize.categoryName")}</Input.Label>
              <Input.Box>
                <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && draft.name.trim() && void save()} />
              </Input.Box>
              <Input.Error />
            </Input.Root>
            <Input.Root fullWidth value={draft.parent ?? ""} onChange={(v: string) => setDraft({ ...draft, parent: v })}>
              <Input.Label>{t("mods.categories.parent")}</Input.Label>
              <Input.Select options={[{ value: "", label: t("mods.categories.topLevel") }, ...options.filter((o) => o.value !== draft.id)]} />
            </Input.Root>
          </div>
          <Stack gap="xs">
            <Typography variant="label" color="muted-fg">
              {t("mods.organize.color")}
            </Typography>
            <SwatchPicker
              aria-label={t("mods.organize.color")}
              columns={8}
              value={draft.color ?? ""}
              onValueChange={(v) => setDraft({ ...draft, color: v })}
              options={colorOptions(i18n)}
              renderSwatch={(o) => <span data-category={o.value} className="size-4 rounded-pill bg-intent-fill" />}
            />
          </Stack>
          <Stack gap="xs">
            <Typography variant="label" color="muted-fg">
              {t("mods.organize.icon")}
            </Typography>
            <SwatchPicker
              aria-label={t("mods.organize.icon")}
              columns={12}
              value={draft.icon ?? ""}
              onValueChange={(v) => setDraft({ ...draft, icon: v })}
              options={iconOptions(i18n)}
              renderSwatch={(o) => {
                const g = categoryIcon(o.value);
                return g ? <Icon icon={g} size="sm" /> : null;
              }}
            />
          </Stack>
          <Stack gap="xs">
            <Typography variant="label" color="muted-fg">
              {t("mods.organize.preview")}
            </Typography>
            <div className="flex flex-wrap items-center gap-6 rounded-control border border-border bg-surface px-4 py-3">
              <span className="flex flex-col gap-1">
                <Typography variant="caption" color="muted-fg">
                  {t("mods.organize.inList")}
                </Typography>
                <CategoryTag name={path} color={color} icon={draft.icon} />
              </span>
              <span className="flex flex-col gap-1">
                <Typography variant="caption" color="muted-fg">
                  {t("mods.organize.asGroup")}
                </Typography>
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <span data-category={color} className={`flex size-5 items-center justify-center rounded-chip ${color ? "bg-intent-subtle text-intent-text" : "bg-surface-raised text-fg-muted"}`}>
                    {glyph ? <Icon icon={glyph} size="xs" /> : null}
                  </span>
                  {draft.name || t("mods.organize.unnamed")}
                </span>
              </span>
            </div>
          </Stack>
          {error && !draft.name.trim() ? (
            <Alert.Root intent="danger">
              <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
            </Alert.Root>
          ) : null}
        </div>
      </div>
      <Modal.Footer>
        <Button emphasis="low" intent="danger" disabled={!current || busy} onClick={() => void remove()}>
          {t("mods.organize.deleteCategory")}
        </Button>
        <span className="flex-1" />
        <span className="flex gap-2">
          <Button disabled={busy} onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button emphasis="high" disabled={busy || !draft.name.trim()} loading={busy} onClick={() => void save()}>
            {t("mods.organize.saveCategory")}
          </Button>
        </span>
      </Modal.Footer>
    </>
  );
}

function TagsEditor({
  instance,
  tags,
  onShowTag,
  onClose,
}: {
  instance: string;
  tags: readonly TagInfo[];
  onShowTag?: (name: string) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
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

  return (
    <>
      <div className="grid min-h-0 grid-cols-[18rem_minmax(0,1fr)] border-t border-border" style={{ height: "min(34rem, 62vh)" }}>
        <div className="flex min-h-0 flex-col gap-2 overflow-auto border-r border-border p-3">
          <Button size="sm" startIcon={<PlusIcon size="sm" />} onClick={() => setSelected(NEW)}>
            {t("mods.organize.newTag")}
          </Button>
          {tags.length === 0 ? (
            <Typography variant="body-sm" color="muted-fg" className="px-2">
              {t("mods.organize.noTags")}
            </Typography>
          ) : (
            <List.Root
              aria-label={t("mods.organize.tags")}
              selectionMode="single"
              items={[...tags]}
              getItemKey={(x) => x.name}
              selectedKeys={[selected]}
              onSelectedChange={(k) => k[0] && setSelected(k[0])}
              renderItem={(x) => <List.Item title={<CategoryTag name={x.name} color={x.color} />} meta={tp("mods.organize.tagMods", x.mods)} />}
            />
          )}
          <Typography variant="caption" color="muted-fg" className="mt-auto px-2">
            {t("mods.organize.tagHelp")}
          </Typography>
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-auto p-5">
          <Input.Root fullWidth value={name} onChange={setName} error={error ? errorMessage(i18n, error) : false} className="max-w-md">
            <Input.Label>{t("mods.organize.tagName")}</Input.Label>
            <Input.Box>
              <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim() && void save()} />
            </Input.Box>
            <Input.Error />
          </Input.Root>
          <Stack gap="xs">
            <Typography variant="label" color="muted-fg">
              {t("mods.organize.color")}
            </Typography>
            <SwatchPicker
              aria-label={t("mods.organize.color")}
              columns={8}
              value={color}
              onValueChange={setColor}
              options={colorOptions(i18n)}
              renderSwatch={(o) => <span data-category={o.value} className="size-4 rounded-pill bg-intent-fill" />}
            />
          </Stack>
          <Stack gap="xs">
            <Typography variant="label" color="muted-fg">
              {t("mods.organize.preview")}
            </Typography>
            <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-4 py-3">
              <CategoryTag name={name.trim() || t("mods.organize.unnamed")} color={pc} />
            </div>
          </Stack>
          {current ? (
            <div className="flex items-center gap-3 rounded-control border border-border px-4 py-3 text-sm">
              <span className="flex-1 text-fg">{tp("mods.organize.usedIn", current.mods)}</span>
              {onShowTag && current.mods > 0 ? (
                <Button size="sm" emphasis="low" onClick={() => onShowTag(current.name)}>
                  {t("mods.organize.showTagged")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Modal.Footer>
        <Button emphasis="low" intent="danger" disabled={!current || busy} onClick={() => void remove()}>
          {t("mods.organize.deleteTag")}
        </Button>
        <span className="flex-1" />
        <span className="flex gap-2">
          <Button disabled={busy} onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button emphasis="high" disabled={busy || !name.trim()} loading={busy} onClick={() => void save()}>
            {t("mods.organize.saveTag")}
          </Button>
        </span>
      </Modal.Footer>
    </>
  );
}
