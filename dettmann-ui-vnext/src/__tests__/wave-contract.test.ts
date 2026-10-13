// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SRC, fs, path } from "./source-files";

const { readFileSync, readdirSync } = fs;
const { join } = path;

const inputFiles = readdirSync(join(SRC, "components/input"))
  .filter((f) => /^input\..+\.tsx$/.test(f) && f !== "input.pin.tsx")
  .map((f) => `components/input/${f}`);

const folderFiles = (folder: string) =>
  readdirSync(join(SRC, folder))
    .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))
    .map((f) => `${folder}/${f}`);

/** Arquivos já redesenhados (spec 2026-10-09, seção 5). Cada onda acrescenta os seus. */
export const WAVE_FILES: string[] = [
  // Onda 1: controles e entradas
  "components/button/index.tsx",
  "components/button-group/index.tsx",
  "components/checkbox/index.tsx",
  "components/radio/index.tsx",
  "components/switch/index.tsx",
  "components/segmented-control/index.tsx",
  "components/status-toggle/index.tsx",
  "components/badge/index.tsx",
  "components/tag/index.tsx",
  "components/indicator/index.tsx",
  "primitives/kbd.tsx",
  ...inputFiles,
  "core/styles/row.ts",
  // Onda 2: feedback e overlays
  ...folderFiles("components/alert"),
  ...folderFiles("components/toast"),
  ...folderFiles("components/modal"),
  ...folderFiles("components/drawer"),
  ...folderFiles("components/menu"),
  ...folderFiles("components/context-menu"),
  ...folderFiles("components/popover"),
  ...folderFiles("components/command"),
  ...folderFiles("components/progress"),
  ...folderFiles("components/stepper"),
  ...folderFiles("components/loader"),
  "primitives/skeleton.tsx",
  "primitives/backdrop.tsx",
  // Onda 3: dados
  ...folderFiles("components/table"),
  ...folderFiles("components/data-table"),
  ...folderFiles("components/tree"),
  ...folderFiles("components/reorderable-list"),
  ...folderFiles("components/tabs"),
  ...folderFiles("components/accordion"),
  ...folderFiles("components/inspector"),
  ...folderFiles("components/filter-bar"),
  ...folderFiles("components/diff-viewer"),
  ...folderFiles("components/log-viewer"),
  ...folderFiles("components/media-image"),
  ...folderFiles("components/lightbox"),
  ...folderFiles("templates/file-dropzone"),
  // Onda 4: estrutura
  ...folderFiles("components/card"),
  ...folderFiles("components/toolbar"),
  ...folderFiles("components/action-bar"),
  ...folderFiles("components/empty-state"),
  ...folderFiles("components/featured-icon"),
  ...folderFiles("templates/sidebar"),
];

/** Glifos lucide sem equivalente no catálogo, por arquivo. Todo import fora daqui é achado. */
const ALLOWED_LUCIDE: Record<string, string[]> = {
  "components/data-table/column-picker.tsx": ["Columns3"],
  "components/data-table/data-table.tsx": ["GripVertical"],
  "components/reorderable-list/index.tsx": ["GripVertical"],
  "components/log-viewer/index.tsx": ["Terminal"],
  "components/media-image/index.tsx": ["ImageOff"],
};

const FORBIDDEN: [string, RegExp][] = [
  ["opacidade em desabilitado", /\bopacity-(40|50|60)\b/],
  ["sombra fora de overlay", /\bshadow-raised\b/],
  ["raio genérico", /\brounded(-[lrtb])?-(full|sm|md|lg|xl|2xl)\b/],
  ["movimento manual", /\bduration-\d+\b|\btransition-(all|colors|opacity)\b|\banimate-(in|out|spin|pulse|bounce)\b|@keyframes/],
  ["foco escrito à mão", /focus-visible:ring-|focus:ring-|focus-within:ring-|\boutline-(none|hidden|0)\b/],
];

describe("contrato da linguagem visual (D-033)", () => {
  it.each(WAVE_FILES)("%s", (file) => {
    const source = readFileSync(join(SRC, file), "utf8");
    const found = FORBIDDEN.flatMap(([name, re]) => {
      const hit = source.match(re);
      return hit ? [`${name}: ${hit[0]}`] : [];
    });
    const lucide = source.match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/);
    if (lucide) {
      const allowed = ALLOWED_LUCIDE[file] ?? [];
      const extra = (lucide[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^type\s+/, ""))
        .filter((s) => s && !allowed.includes(s));
      if (extra.length) found.push(`lucide solto: ${extra.join(", ")}`);
    }
    expect(found).toEqual([]);
  });
});
