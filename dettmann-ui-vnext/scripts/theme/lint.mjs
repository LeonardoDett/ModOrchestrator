import fs from "node:fs";
import path from "node:path";

const sourceDir = path.resolve(process.argv[2] ?? "src");
/** Camadas de produto: o motor de tema e os presets podem conter cores literais. */
const scopes = ["components", "templates", "primitives"].map((d) => path.join(sourceDir, d)).filter((d) => fs.existsSync(d));
const forbiddenDependencies = ["tailwind-variants", "clsx"];
/** Cor fora do contrato v2: só papéis L3, intent e state layers são permitidos (spec 5.4). */
const rawProductColorPatterns = [
  /\bbg-(?:black|white)\b/,
  /\btext-(?:black|white)\b/,
  /\bborder-(?:black|white)\b/,
  /#[0-9a-fA-F]{3,8}\b/,
  // Paleta crua do Tailwind (bg-red-500, text-slate-700...).
  /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|divide|shadow|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  // Literais de cor CSS.
  /\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/,
  // Tokens removidos na v2 (tone/primary/secondary).
  /\b(?:bg|text|border|ring|stroke|fill|outline)-(?:tone|primary|secondary)(?:-[a-z-]+)?\b/,
  /\bdata-tone\b/,
];

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(file));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) result.push(file);
  }
  return result;
}

const offenders = [];
for (const file of scopes.flatMap(walk)) {
  if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const dependency of forbiddenDependencies) {
    if (source.includes(`from "${dependency}"`) || source.includes(`from '${dependency}'`)) {
      offenders.push(`${file}: forbidden runtime dependency ${dependency}`);
    }
  }
  const runtimeSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  for (const pattern of rawProductColorPatterns) {
    if (pattern.test(runtimeSource)) {
      offenders.push(`${file}: off-contract color ${pattern}`);
      break;
    }
  }
}

if (offenders.length) {
  console.error(offenders.join("\n"));
  process.exit(1);
}

console.log("Architecture and theme-source lint OK.");
