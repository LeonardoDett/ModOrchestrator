import fs from "node:fs";
import path from "node:path";

const files = [
  "src/styles/theme/themes.css",
  "src/styles/theme/foundations.css",
  "src/theme/tokens.css",
  "src/theme/theme-definitions.ts",
].map(file => path.resolve(file));
for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Missing theme file: ${file}`);
}
const themes = fs.readFileSync(files[0], "utf8");
const required = ["--ui-canvas", "--ui-structure", "--ui-brand", "--ui-fg", "--ui-border", "--ui-focus", "--ui-on-brand", "--ui-brand-text"];
for (const token of required) if (!themes.includes(token)) throw new Error(`Theme is missing required token ${token}`);
const darkCount = (themes.match(/\.dark/g) ?? []).length;
if (darkCount < 1) throw new Error("No dark theme layer found");

function parseBlock(selectorPattern) {
  const match = themes.match(selectorPattern);
  if (!match) return null;
  return Object.fromEntries([...match[1].matchAll(/--ui-([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

function colorToRgb(value) {
  const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map(char => char + char).join("");
  return [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function luminance(value) {
  const rgb = colorToRgb(value);
  if (!rgb) return null;
  const channel = (x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(foreground, background) {
  const fg = luminance(foreground);
  const bg = luminance(background);
  if (fg == null || bg == null) return null;
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return (hi + 0.05) / (lo + 0.05);
}

const themeBlocks = [
  ["forest light", /:root,\n\[data-theme="default"\],\n\[data-theme="forest"\] \{(.*?)\n\}/s],
  ["forest dark", /\.dark,\n\.dark \[data-theme="default"\],\n\.dark \[data-theme="forest"\] \{(.*?)\n\}/s],
  ["graphite light", /\[data-theme="graphite"\] \{(.*?)\n\}/s],
  ["graphite dark", /\[data-theme="graphite"\]\.dark,\n\.dark \[data-theme="graphite"\] \{(.*?)\n\}/s],
  ["orchestrator light", /\n\[data-theme="orchestrator"\] \{(.*?)\n\}/s],
  ["orchestrator dark", /\[data-theme="orchestrator"\]\.dark,\n\.dark \[data-theme="orchestrator"\] \{(.*?)\n\}/s],
];

for (const [name, selector] of themeBlocks) {
  const block = parseBlock(selector);
  if (!block) throw new Error(`Missing complete theme block: ${name}`);
  const checks = [
    ["fg on surface", "fg", "surface"],
    ["fg-secondary on surface", "fg-secondary", "surface"],
    ["fg-tertiary on surface", "fg-tertiary", "surface"],
    ["on-brand on brand", "on-brand", "brand"],
    ["brand-text on brand-subtle", "brand-text", "brand-subtle"],
    ["on-danger on danger", "on-danger", "danger"],
    ["success-text on success-subtle", "success-text", "success-subtle"],
  ];
  for (const [label, foreground, background] of checks) {
    const ratio = contrastRatio(block[foreground], block[background]);
    if (ratio != null && ratio < 4.5) {
      throw new Error(`${name}: ${label} contrast is ${ratio.toFixed(2)} (< 4.5)`);
    }
  }
}

// Every tone of theme/tone.ts must map to semantic roles in tokens.css, or
// every toned Badge/Alert/Button renders without color.
const toneSource = fs.readFileSync(path.resolve("src/theme/tone.ts"), "utf8");
const tokens = fs.readFileSync(files[2], "utf8");
const tones = [...(toneSource.match(/TONES = \[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);
if (tones.length === 0) throw new Error("Could not read TONES from src/theme/tone.ts");
if (!tokens.includes("--color-tone-subtle: var(--tone-subtle)")) throw new Error("tokens.css is missing the tone utilities");
for (const tone of tones) {
  if (!tokens.includes(`[data-tone="${tone}"]`)) throw new Error(`tokens.css has no [data-tone="${tone}"] mapping`);
}

console.log("Theme contract and contrast checks OK.");
