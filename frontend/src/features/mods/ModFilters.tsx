import { useMemo, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge, Button, FilterChip, Icon, Popover, Tag, type CategoryColor } from "dettmann-ui";
import type { Category, ConflictIndicator, ModFlags, ModRow, TagInfo } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";

/** Category id of the mods without one (filters and tabs). */
export const NO_CATEGORY = "\u0000none";

export type Situation = "imported" | "error" | "requirement";
export type ConflictChip = "any" | "unreviewed" | "fully_overwritten";

/**
 * The Filtros menu (board JogoModsMenus): chips in sections, several per
 * section. Inside a section any chip matches; across sections all must.
 */
export interface ModFilterState {
  situation: Situation[];
  categories: string[];
  tags: string[];
  conflicts: ConflictChip[];
  contains: string[];
}

export const NO_FILTERS: ModFilterState = { situation: [], categories: [], tags: [], conflicts: [], contains: [] };

export function filterCount(f: ModFilterState): number {
  return f.situation.length + f.categories.length + f.tags.length + f.conflicts.length + f.contains.length;
}

interface Facts {
  conflicts: ReadonlyMap<string, ConflictIndicator>;
  flags: ReadonlyMap<string, ModFlags>;
}

function matchSituation(r: ModRow, s: Situation, facts: Facts): boolean {
  switch (s) {
    case "imported":
      return r.state === "imported";
    case "error":
      return Boolean(facts.flags.get(r.id)?.error);
    case "requirement":
      return Boolean(facts.flags.get(r.id)?.missingRequirement);
  }
}

function matchConflict(c: ConflictIndicator | undefined, f: ConflictChip): boolean {
  switch (f) {
    case "any":
      return Boolean(c && c.indicator !== "none");
    case "unreviewed":
      return Boolean(c && c.unreviewed > 0);
    case "fully_overwritten":
      return c?.indicator === "fully_overwritten";
  }
}

function matchCategory(r: ModRow, id: string): boolean {
  return id === NO_CATEGORY ? r.category === "" : r.category === id;
}

const lower = (s: string) => s.toLowerCase();

/** Whether a row passes the filters (presentation of backend rows). */
export function matchesFilters(r: ModRow, f: ModFilterState, facts: Facts): boolean {
  return (
    (f.situation.length === 0 || f.situation.some((s) => matchSituation(r, s, facts))) &&
    (f.categories.length === 0 || f.categories.some((c) => matchCategory(r, c))) &&
    (f.tags.length === 0 || f.tags.some((g) => (r.tags ?? []).some((x) => lower(x) === lower(g)))) &&
    (f.conflicts.length === 0 || f.conflicts.some((c) => matchConflict(facts.conflicts.get(r.id), c))) &&
    (f.contains.length === 0 || f.contains.some((c) => r.content.includes(c)))
  );
}

/** How many chips a section shows before "Mais N". */
const SHOWN = 4;

function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">{children}</span>;
}

interface Chip {
  value: string;
  label: string;
  count: number;
  color?: CategoryColor;
}

function ChipSection({
  title,
  chips,
  value,
  onChange,
  note,
  limit,
}: {
  title: string;
  chips: Chip[];
  value: string[];
  onChange: (v: string[]) => void;
  note?: string;
  limit?: boolean;
}) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  // Chosen chips stay visible even beyond the limit.
  const visible = !limit || all ? chips : chips.filter((c, i) => i < SHOWN || value.includes(c.value));
  const hidden = chips.length - visible.length;
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex flex-col gap-1.5">
        <FilterChip.Group type="multiple" aria-label={title} value={value} onValueChange={onChange} className="flex flex-wrap gap-1.5">
          {visible.map((c) => (
            <FilterChip key={c.value} value={c.value} count={c.count} tone="neutral" {...(c.color ? { color: c.color } : {})}>
              {c.label}
            </FilterChip>
          ))}
          {hidden > 0 ? (
            <FilterChip tone="neutral" pressed={false} onPressedChange={() => setAll(true)}>
              {t("mods.filters.more", { count: hidden })}
            </FilterChip>
          ) : null}
        </FilterChip.Group>
        {note ? <span className="text-xs text-fg-subtle">{note}</span> : null}
      </div>
    </div>
  );
}

/**
 * "Filtros" with its count and the menu of the board, plus the chips of
 * the filters in use, each removable, and "Limpar".
 */
export function ModFiltersControl({
  rows,
  categories,
  tags,
  facts,
  value,
  onChange,
  shown,
}: {
  rows: readonly ModRow[];
  categories: readonly Category[];
  tags: readonly TagInfo[];
  facts: Facts;
  value: ModFilterState;
  onChange: (f: ModFilterState) => void;
  /** Rows the filters (and search) leave. */
  shown: number;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [open, setOpen] = useState(false);
  const count = filterCount(value);

  const chips = useMemo(() => {
    const countOf = (fn: (r: ModRow) => boolean) => rows.filter(fn).length;
    const situation: Chip[] = (["imported", "error", "requirement"] as const).map((s) => ({
      value: s,
      label: t(`mods.filters.situation.${s}` as MessageKey),
      count: countOf((r) => matchSituation(r, s, facts)),
    }));
    const usedCats = categories
      .map((c) => ({ value: c.id, label: c.name, count: countOf((r) => r.category === c.id), color: c.color as CategoryColor | undefined }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
    const none = countOf((r) => r.category === "");
    const cats: Chip[] = none > 0 ? [...usedCats, { value: NO_CATEGORY, label: t("mods.noCategory"), count: none }] : usedCats;
    const tagChips: Chip[] = tags
      .map((g) => ({ value: g.name, label: g.name, count: countOf((r) => (r.tags ?? []).some((x) => lower(x) === lower(g.name))) }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
    const conflicts: Chip[] = (["any", "unreviewed", "fully_overwritten"] as const).map((c) => ({
      value: c,
      label: t(`mods.filters.conflicts.${c}` as MessageKey),
      count: countOf((r) => matchConflict(facts.conflicts.get(r.id), c)),
    }));
    const flags = new Map<string, number>();
    for (const r of rows) for (const c of r.content) flags.set(c, (flags.get(c) ?? 0) + 1);
    const contains: Chip[] = [...flags]
      .map(([c, n]) => ({ value: c, label: i18n.has(`mods.content.${c}`) ? t(`mods.content.${c}` as MessageKey) : c, count: n }))
      .sort((a, b) => b.count - a.count);
    return { situation, cats, tagChips, conflicts, contains };
  }, [rows, categories, tags, facts, t, i18n]);

  const labelOf = (section: keyof ModFilterState, v: string): string => {
    const list = { situation: chips.situation, categories: chips.cats, tags: chips.tagChips, conflicts: chips.conflicts, contains: chips.contains }[section];
    return list.find((c) => c.value === v)?.label ?? v;
  };
  const applied = (Object.keys(value) as (keyof ModFilterState)[]).flatMap((section) =>
    (value[section] as string[]).map((v) => ({ section, v, label: labelOf(section, v) })),
  );
  const set = <K extends keyof ModFilterState>(k: K, v: string[]) => onChange({ ...value, [k]: v });

  return (
    <>
      <Popover.Root placement="bottom-start" open={open} onOpenChange={setOpen}>
        <Popover.Trigger>
          <Button startIcon={<Icon icon={SlidersHorizontal} size="sm" />} aria-expanded={open}>
            {t("mods.filter.button")}
            {count > 0 ? (
              <Badge intent="brand" emphasis="high" size="sm">
                {count}
              </Badge>
            ) : null}
          </Button>
        </Popover.Trigger>
        <Popover.Content aria-label={t("mods.filter.button")} className="flex w-[25.625rem] max-w-[92vw] flex-col overflow-hidden p-0">
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-auto px-4.5 py-4">
            <ChipSection
              title={t("mods.filters.situation")}
              chips={chips.situation}
              value={value.situation}
              onChange={(v) => set("situation", v)}
              note={t("mods.filters.situationNote")}
            />
            {chips.cats.length > 0 ? (
              <ChipSection title={t("mods.filters.category")} chips={chips.cats} value={value.categories} onChange={(v) => set("categories", v)} limit />
            ) : null}
            {chips.tagChips.length > 0 ? (
              <ChipSection title={t("mods.filters.tags")} chips={chips.tagChips} value={value.tags} onChange={(v) => set("tags", v)} limit />
            ) : null}
            <ChipSection title={t("mods.filters.conflicts")} chips={chips.conflicts} value={value.conflicts} onChange={(v) => set("conflicts", v)} />
            {/* "Contém" exists only where the adapter classifies files (none in a generic game). */}
            {chips.contains.length > 0 ? (
              <ChipSection
                title={t("mods.filters.contains")}
                chips={chips.contains}
                value={value.contains}
                onChange={(v) => set("contains", v)}
                note={t("mods.filters.containsNote")}
              />
            ) : null}
          </div>
          <div data-layer="medium" className="flex h-13 shrink-0 items-center gap-2 border-t border-border bg-structure pl-4.5 pr-3.5">
            <span className="flex-1 text-sm text-fg-muted">
              <span className="font-semibold text-fg">{i18n.formatNumber(shown)}</span> {t("mods.filters.ofMods", { total: i18n.formatNumber(rows.length) })}
            </span>
            <Button emphasis="low" disabled={count === 0} onClick={() => onChange(NO_FILTERS)}>
              {t("mods.filters.clear")}
            </Button>
            <Button onClick={() => setOpen(false)}>{t("common.close")}</Button>
          </div>
        </Popover.Content>
      </Popover.Root>
      {applied.map((a) => (
        <Tag
          key={`${a.section}:${a.v}`}
          size="lg"
          shape="pill"
          value={a.v}
          removeLabel={t("mods.filters.remove", { section: t(`mods.filters.short.${a.section}` as MessageKey), value: a.label })}
          onRemove={() => set(a.section, (value[a.section] as string[]).filter((x) => x !== a.v))}
        >
          <span className="text-fg-muted">{t(`mods.filters.short.${a.section}` as MessageKey)}</span>
          {a.label}
        </Tag>
      ))}
      {count > 0 ? (
        <Button size="inline" emphasis="low" intent="brand" className="px-2 text-sm" onClick={() => onChange(NO_FILTERS)}>
          {t("mods.filters.clearShort")}
        </Button>
      ) : null}
    </>
  );
}
