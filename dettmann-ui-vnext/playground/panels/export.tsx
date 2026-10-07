import { useState } from "react";
import { Button, Card, Typography, type ThemeConfig } from "../../src";

const DEFAULTS = {
  neutral: "neutral",
  vibrance: 0.5,
  contrast: "standard",
  shape: "balanced",
  density: "comfortable",
} as const;
const DEFAULT_FONT = { sans: "Plus Jakarta Sans", mono: "JetBrains Mono" } as const;

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** Literal TS com chaves sem aspas quando possível, indentado em dois espaços. */
function literal(value: unknown, depth: number): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object" || value === null) return String(value);
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "{}";
  const pad = "  ".repeat(depth + 1);
  const body = entries
    .map(([k, v]) => `${pad}${IDENT.test(k) ? k : JSON.stringify(k)}: ${literal(v, depth + 1)},`)
    .join("\n");
  return `{\n${body}\n${"  ".repeat(depth)}}`;
}

const isEmpty = (o: object | undefined): boolean => !o || Object.values(o).every((v) => v === undefined || (typeof v === "object" && isEmpty(v)));

/** `createTheme({ ... })` só com as chaves que diferem do padrão do motor (`id`, `label` e `brand` sempre). */
export function configToCode(config: ThemeConfig): string {
  const out: Record<string, unknown> = { id: config.id, label: config.label, brand: config.brand };
  if (config.accent !== undefined) out.accent = config.accent;
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    if (config[key] !== undefined && config[key] !== DEFAULTS[key]) out[key] = config[key];
  }
  if (config.motion !== undefined) {
    const ceiling = typeof config.motion === "string" ? config.motion : (config.motion.ceiling ?? "expressive");
    const tune = typeof config.motion === "string" ? undefined : config.motion.tune;
    if (!isEmpty(tune)) out.motion = { ceiling, tune };
    else if (ceiling !== "expressive") out.motion = ceiling;
  }
  if (config.font) {
    const font: Record<string, string> = {};
    for (const key of ["sans", "mono"] as const) {
      const v = config.font[key];
      if (v !== undefined && v !== DEFAULT_FONT[key]) font[key] = v;
    }
    if (Object.keys(font).length > 0) out.font = font;
  }
  if (config.overrides) {
    const overrides: Record<string, unknown> = {};
    for (const mode of ["light", "dark"] as const) {
      if (!isEmpty(config.overrides[mode])) overrides[mode] = config.overrides[mode];
    }
    if (Object.keys(overrides).length > 0) out.overrides = overrides;
  }
  return `createTheme(${literal(out, 0)})`;
}

export function ExportPanel({ config }: { config: ThemeConfig }) {
  const code = configToCode(config);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Card.Root variant="subtle">
      <Card.Header className="flex-row items-center justify-between">
        <Typography variant="heading-6" color="fg">
          Exportar
        </Typography>
        <Button size="sm" emphasis="low" onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </Card.Header>
      <Card.Body>
        <pre data-testid="export-code" className="overflow-x-auto whitespace-pre font-mono text-caption text-fg">
          {code}
        </pre>
      </Card.Body>
    </Card.Root>
  );
}
