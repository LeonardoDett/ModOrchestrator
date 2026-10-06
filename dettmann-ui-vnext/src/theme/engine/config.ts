import { clampChroma, parseColor } from "./color/convert";
import { MOTION_LEVELS, validateMotionSpec } from "./motion";
import { ROLE_NAMES } from "./roles";
import type { MotionLevel, MotionSpec, MotionTune, NormalizedConfig, Oklch, RoleOverrides, ThemeConfig } from "./types";

/** Config de tema inválida; a mensagem cita o campo e o valor recebido. */
export class ThemeConfigError extends Error {
  readonly field: string;
  readonly value: unknown;
  constructor(field: string, value: unknown, expected: string) {
    super(`Invalid theme config: ${field} = ${show(value)} (expected ${expected})`);
    this.name = "ThemeConfigError";
    this.field = field;
    this.value = value;
  }
}

function show(value: unknown): string {
  if (typeof value === "number") return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

const THEME_ID = /^[a-z0-9][a-z0-9_-]*$/;

const COLOR_HINT = "a CSS color: hex, rgb(), hsl() or oklch()";

function color(field: string, value: unknown): Oklch {
  const parsed = typeof value === "string" ? parseColor(value) : null;
  if (!parsed) throw new ThemeConfigError(field, value, COLOR_HINT);
  return clampChroma(parsed);
}

function oneOf<T extends string>(field: string, value: unknown, options: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && (options as readonly string[]).includes(value)) return value as T;
  throw new ThemeConfigError(field, value, `one of ${options.map((o) => `"${o}"`).join(", ")}`);
}

function motion(value: ThemeConfig["motion"], mode: "dev" | "prod"): NormalizedConfig["motion"] {
  if (value === undefined) return { ceiling: "expressive", tune: {} };
  if (typeof value === "string") return { ceiling: oneOf("motion", value, MOTION_LEVELS, "expressive"), tune: {} };
  if (typeof value !== "object" || value === null)
    throw new ThemeConfigError("motion", value, "a motion level or { ceiling, tune }");
  const ceiling = oneOf<MotionLevel>("motion.ceiling", value.ceiling ?? "", MOTION_LEVELS, "expressive");
  const tune: MotionTune = {};
  for (const [level, part] of Object.entries(value.tune ?? {})) {
    const field = `motion.tune.${level}`;
    if (!(MOTION_LEVELS as readonly string[]).includes(level))
      throw new ThemeConfigError(field, part, `a level among ${MOTION_LEVELS.join(", ")}`);
    if (part === undefined) continue;
    if (typeof part !== "object" || part === null) throw new ThemeConfigError(field, part, "a partial motion spec");
    try {
      tune[level as MotionLevel] = validateMotionSpec(part as Partial<MotionSpec>, mode);
    } catch (err) {
      throw new ThemeConfigError(field, part, (err as Error).message);
    }
  }
  return { ceiling, tune };
}

function overrides(value: ThemeConfig["overrides"]): NormalizedConfig["overrides"] {
  const out: NormalizedConfig["overrides"] = { light: {}, dark: {} };
  if (value === undefined) return out;
  const names = new Set<string>(ROLE_NAMES);
  for (const mode of ["light", "dark"] as const) {
    for (const [role, v] of Object.entries(value[mode] ?? {})) {
      const field = `overrides.${mode}.${role}`;
      if (!names.has(role)) throw new ThemeConfigError(field, v, "a generated role name");
      if (typeof v !== "string" || !parseColor(v)) throw new ThemeConfigError(field, v, COLOR_HINT);
      out[mode][role as keyof RoleOverrides] = v;
    }
  }
  return out;
}

/**
 * Valida a config e preenche os defaults. Erros de semente/enum/vibrance sempre lançam
 * `ThemeConfigError`; `motion.tune` segue `validateMotionSpec` (dev lança, prod faz clamp).
 */
export function normalizeConfig(config: ThemeConfig, opts: { mode?: "dev" | "prod" } = {}): NormalizedConfig {
  const mode = opts.mode ?? "dev";
  // O id vira seletor CSS (`[data-theme="id"]`) e atributo; só caracteres seguros.
  if (typeof config.id !== "string" || !THEME_ID.test(config.id))
    throw new ThemeConfigError("id", config.id, "lowercase letters, digits, '-' or '_', starting with a letter or digit");
  const brand = color("brand", config.brand);
  const accent =
    config.accent === undefined
      ? { l: brand.l, c: brand.c, h: brand.c === 0 ? 0 : (brand.h + 150) % 360 } : color("accent", config.accent);
  const vibrance = config.vibrance ?? 0.5;
  if (typeof vibrance !== "number" || !Number.isFinite(vibrance) || vibrance < 0 || vibrance > 1)
    throw new ThemeConfigError("vibrance", vibrance, "a number in [0, 1]");
  return {
    id: config.id,
    label: config.label,
    brand,
    accent: clampChroma(accent),
    neutral: oneOf("neutral", config.neutral, ["cool", "neutral", "warm"], "neutral"),
    vibrance,
    contrast: oneOf("contrast", config.contrast, ["standard", "high"], "standard"),
    shape: oneOf("shape", config.shape, ["precise", "balanced", "soft"], "balanced"),
    density: oneOf("density", config.density, ["compact", "comfortable", "spacious"], "comfortable"),
    motion: motion(config.motion, mode),
    font: { sans: config.font?.sans ?? "Plus Jakarta Sans", mono: config.font?.mono ?? "JetBrains Mono" },
    overrides: overrides(config.overrides),
  };
}
