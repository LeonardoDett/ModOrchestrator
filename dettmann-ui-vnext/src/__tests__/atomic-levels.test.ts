// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SRC, fs, path, walkSources as walk } from "./source-files";

const { readFileSync, readdirSync, statSync } = fs;
const { dirname, join, relative, resolve, sep } = path;

/** Design Atômico (D-032): um componente só importa componentes de nível igual ou inferior. */
type Level = "atom" | "molecule" | "organism" | "template";
const ORDER: Record<Level, number> = { atom: 0, molecule: 1, organism: 2, template: 3 };


/** Chave = pasta em `components/` ou `templates/`. Todo arquivo de `primitives/` é átomo. */
export const LEVELS: Record<string, Level> = {
  // átomos
  "components/avatar": "atom",
  "components/badge": "atom",
  "components/button": "atom",
  "components/checkbox": "atom",
  "components/featured-icon": "atom",
  "components/indicator": "atom",
  "components/loader": "atom",
  "components/media-image": "atom",
  "components/progress": "atom",
  "components/radio": "atom",
  "components/rating": "atom",
  "components/slider": "atom",
  "components/surface": "atom",
  "components/switch": "atom",
  "components/tag": "atom",
  "components/tooltip": "atom",
  // moléculas
  "components/accordion": "molecule",
  "components/action-bar": "molecule",
  "components/alert": "molecule",
  "components/breadcrumbs": "molecule",
  "components/button-group": "molecule",
  "components/card": "molecule",
  "components/context-menu": "molecule",
  "components/date-picker": "molecule",
  "components/drawer": "molecule",
  "components/empty-placeholder": "molecule",
  "components/empty-state": "molecule",
  "components/floating-button": "molecule",
  "components/input": "molecule",
  "components/list": "molecule",
  "components/menu": "molecule",
  "components/modal": "molecule",
  "components/page-container": "molecule",
  "components/pagination": "molecule",
  "components/popover": "molecule",
  "components/section": "molecule",
  "components/segmented-control": "molecule",
  "components/split-pane": "molecule",
  "components/status-toggle": "molecule",
  "components/stepper": "molecule",
  "components/tabs": "molecule",
  "components/toast": "molecule",
  "components/toolbar": "molecule",
  // organismos
  "components/carousel": "organism",
  "components/command": "organism",
  "components/data-table": "organism",
  "components/diff-viewer": "organism",
  "components/file-browser": "organism",
  "components/file-list": "organism",
  "components/filter-bar": "organism",
  "components/gallery": "organism",
  "components/inspector": "organism",
  "components/lightbox": "organism",
  "components/log-viewer": "organism",
  "components/master-detail": "organism",
  "components/media-gallery": "organism",
  "components/reorderable-list": "organism",
  "components/resource-page": "organism",
  "components/table": "organism",
  "components/tree": "organism",
  // templates
  "templates/app-shell": "template",
  "templates/calendar": "template",
  "templates/confirm-dialog": "template",
  "templates/file-browser": "template",
  "templates/file-dropzone": "template",
  "templates/master-detail": "template",
  "templates/navbar": "template",
  "templates/resource-page": "template",
  "templates/sidebar": "template",
  "templates/workspace": "template",
};

/** Imports que hoje sobem de nível, com a onda que resolve cada um. Lista explícita: não cresce sem decisão. */
const KNOWN_VIOLATIONS: string[] = [];

function unitOf(file: string): string | null {
  const parts = relative(SRC, file).split(sep);
  if (parts[0] === "primitives") return "primitives";
  if ((parts[0] === "components" || parts[0] === "templates") && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return null;
}

function levelOf(unit: string): Level | undefined {
  return unit === "primitives" ? "atom" : LEVELS[unit];
}

const folders = (root: string) =>
  readdirSync(join(SRC, root))
    .filter((name) => statSync(join(SRC, root, name)).isDirectory())
    .map((name) => `${root}/${name}`);

describe("níveis atômicos (D-032)", () => {
  it("classifica todas as pastas de componentes e templates", () => {
    const all = [...folders("components"), ...folders("templates")];
    expect(all.filter((unit) => !LEVELS[unit])).toEqual([]);
    expect(Object.keys(LEVELS).filter((unit) => !all.includes(unit))).toEqual([]);
  });

  it("nenhum componente importa de um nível acima", () => {
    const found: string[] = [];
    for (const root of ["components", "templates", "primitives"]) {
      for (const file of walk(join(SRC, root))) {
        const from = unitOf(file);
        if (!from) continue;
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
          const to = unitOf(resolve(dirname(file), match[1] ?? "", "x"));
          if (!to || to === from) continue;
          const a = levelOf(from);
          const b = levelOf(to);
          if (a && b && ORDER[b] > ORDER[a]) found.push(`${from} -> ${to}`);
        }
      }
    }
    const unique = [...new Set(found)].sort();
    expect(unique.filter((v) => !KNOWN_VIOLATIONS.includes(v))).toEqual([]);
    expect(KNOWN_VIOLATIONS.filter((v) => !unique.includes(v))).toEqual([]);
  });
});
