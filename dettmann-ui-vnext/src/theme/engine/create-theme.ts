import { contrastReport, buildRoles } from "./roles";
import { normalizeConfig } from "./config";
import { parseColor, toHex } from "./color/convert";
import { buildPrimitives } from "./primitives";
import type { Mode, NormalizedConfig, RoleName, RoleOverrides, ThemeConfig } from "./types";

export interface ResolvedTheme {
  id: string;
  label: string;
  config: NormalizedConfig;
  shared: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
  warnings: string[];
}

const SHARED_PREFIXES = ["radius-", "density-", "control-", "font-", "text-", "motion-"];
const isShared = (key: string) => SHARED_PREFIXES.some((p) => key.startsWith(p));

/** Papel de ênfase espelhado por um papel de marca (`brand-*` → `emphasis-*`, `on-brand` → `on-emphasis`). */
const emphasisTwin = (role: string): string | undefined =>
  role === "on-brand" ? "on-emphasis" : role.startsWith("brand-") ? role.replace("brand-", "emphasis-") : undefined;

/**
 * Aplica overrides; `brand-*` e `on-brand` propagam para `emphasis-*`/`on-emphasis` salvo
 * override explícito destes. `focus` não é recalculado a partir de overrides.
 */
function applyOverrides(roles: Record<string, string>, overrides: RoleOverrides): Set<string> {
  const touched = new Set<string>();
  const set = (role: string, value: string) => {
    roles[role] = role === "overlay" ? value : toHex(parseColor(value)!);
    touched.add(role);
  };
  for (const [role, value] of Object.entries(overrides)) {
    set(role, value as string);
    const twin = emphasisTwin(role);
    if (twin && !(twin in overrides)) set(twin, value as string);
  }
  return touched;
}

export function createTheme(config: ThemeConfig, opts: { mode?: "dev" | "prod" } = {}): ResolvedTheme {
  const normalized = normalizeConfig(config, opts);
  const warnings: string[] = [];
  const modes = {} as Record<Mode, Record<string, string>>;
  let shared: Record<string, string> = {};
  for (const mode of ["light", "dark"] as const) {
    const built = buildRoles(normalized, mode);
    warnings.push(...built.warnings.map((w) => `${mode}: ${w}`));
    const roles: Record<string, string> = { ...built.roles };
    const touched = applyOverrides(roles, normalized.overrides[mode]);
    if (touched.size > 0) {
      for (const r of contrastReport(roles, normalized.contrast)) {
        if (!r.pass && (touched.has(r.fg) || touched.has(r.bg)))
          warnings.push(`${mode}: override contrast ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1 (target ${r.target}:1)`);
      }
    }
    const prims = buildPrimitives(normalized, mode);
    const modeOnly: Record<string, string> = {};
    const sharedOnly: Record<string, string> = {};
    for (const [k, v] of Object.entries(prims)) (isShared(k) ? sharedOnly : modeOnly)[k] = v;
    shared = sharedOnly;
    modes[mode] = { ...roles, ...modeOnly } as Record<RoleName | string, string>;
  }
  return { id: normalized.id, label: normalized.label, config: normalized, shared, light: modes.light, dark: modes.dark, warnings };
}
