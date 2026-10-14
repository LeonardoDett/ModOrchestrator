import {
  Book, Box, Brush, Camera, Clock, Cloud, Code, Compass, Crown, Database, Download, Droplet, Eye, Film, Flag, Flame, Folder, Gamepad2, Ghost, Globe,
  Heart, House, Image, Key, Layers, Leaf, Lock, Map as MapGlyph, Mic, Monitor, Moon, Mountain, Music, Package, Plug, Puzzle, Rocket, Shield, SlidersHorizontal,
  Star, Sun, Sword, Tag as TagGlyph, Target, TreePine, User, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { CATEGORY_COLORS, Tag, type CategoryColor } from "dettmann-ui";
import type { Category, TagInfo } from "../../bridge/types";
import type { MessageKey, Translator } from "../../i18n/i18n";

/**
 * Look of categories and tags (D123): the backend stores palette ids and
 * icon ids, the UI maps them to the theme's categorical palette and to
 * glyphs. Unknown ids (a newer backend) show without color or icon.
 */

/** Icon ids the Organization dialog offers, in the order of the approved board. */
export const CATEGORY_ICONS: readonly (readonly [string, LucideIcon])[] = [
  ["image", Image], ["box", Box], ["sun", Sun], ["wrench", Wrench], ["monitor", Monitor], ["zap", Zap], ["user", User], ["map", MapGlyph],
  ["music", Music], ["star", Star], ["shield", Shield], ["book", Book], ["folder", Folder], ["sliders", SlidersHorizontal], ["heart", Heart], ["house", House],
  ["plug", Plug], ["layers", Layers], ["eye", Eye], ["globe", Globe], ["compass", Compass], ["tag", TagGlyph], ["gamepad", Gamepad2], ["puzzle", Puzzle],
  ["moon", Moon], ["cloud", Cloud], ["droplet", Droplet], ["flame", Flame], ["leaf", Leaf], ["mountain", Mountain], ["sword", Sword], ["crown", Crown],
  ["key", Key], ["lock", Lock], ["clock", Clock], ["camera", Camera], ["film", Film], ["mic", Mic], ["code", Code], ["database", Database],
  ["download", Download], ["flag", Flag], ["target", Target], ["brush", Brush], ["package", Package], ["rocket", Rocket], ["tree", TreePine], ["ghost", Ghost],
];

const ICONS: ReadonlyMap<string, LucideIcon> = new Map(CATEGORY_ICONS.map(([id, icon]) => [id, icon]));

export function categoryIcon(id: string | undefined): LucideIcon | undefined {
  return id ? ICONS.get(id) : undefined;
}

export function paletteColor(id: string | undefined): CategoryColor | undefined {
  return id && (CATEGORY_COLORS as readonly string[]).includes(id) ? (id as CategoryColor) : undefined;
}

export function colorOptions(i18n: Translator) {
  return CATEGORY_COLORS.map((c) => ({ value: c, label: i18n.t(`color.${c}` as MessageKey) }));
}

export function iconOptions(i18n: Translator) {
  return CATEGORY_ICONS.map(([id]) => ({ value: id, label: i18n.t(`icon.${id}` as MessageKey) }));
}

/** The category badge of a mod: its color and icon, and the path or the last level. */
export function CategoryTag({ name, color, icon }: { name: string; color?: string; icon?: string }) {
  const c = paletteColor(color);
  const glyph = categoryIcon(icon);
  return (
    <Tag size="sm" {...(c ? { color: c } : {})} {...(glyph ? { icon: glyph } : {})}>
      {name}
    </Tag>
  );
}

/** The tags of a mod, colored by their definitions (a name without definition has no color). */
export function ModTags({ names, defs }: { names: readonly string[]; defs: ReadonlyMap<string, TagInfo> }) {
  return (
    <>
      {names.map((n) => {
        const c = paletteColor(defs.get(n.toLowerCase())?.color);
        return (
          <Tag key={n} size="sm" {...(c ? { color: c } : {})}>
            {n}
          </Tag>
        );
      })}
    </>
  );
}

/** Tag definitions by lower-case name. */
export function tagIndex(tags: readonly TagInfo[]): ReadonlyMap<string, TagInfo> {
  return new Map(tags.map((t) => [t.name.toLowerCase(), t]));
}

/** The top-level category of a category id (tabs of the Abas view). */
export function topLevel(categories: readonly Category[], id: string): Category | undefined {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let c = byId.get(id);
  while (c?.parent && byId.has(c.parent)) c = byId.get(c.parent);
  return c;
}
