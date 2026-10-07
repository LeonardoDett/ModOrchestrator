# Theme System (v2)

A theme is a small `ThemeConfig` (a brand seed plus personality knobs). A pure TypeScript engine turns it into a complete, contrast-checked set of CSS variables for light and dark. The same engine runs at build time (presets) and at runtime (custom themes), so both produce identical output.

## ThemeConfig

```ts
interface ThemeConfig {
  id: string;                                   // ^[a-z0-9][a-z0-9_-]*$ (injected into selectors)
  label: string;
  brand: string;                                // the only required seed; any CSS color
  accent?: string;                              // "second 10%": highlights, novelty
  neutral?: "cool" | "neutral" | "warm";        // default "neutral": how much brand hue tints the grays
  vibrance?: number;                            // 0..1, default 0.5: color presence in subtle/selection/structure
  contrast?: "standard" | "high";               // default "standard"
  shape?: "precise" | "balanced" | "soft";      // default "balanced"
  density?: "compact" | "comfortable" | "spacious"; // default "comfortable"
  motion?: MotionLevel | { ceiling: MotionLevel; tune?: Partial<Record<MotionLevel, Partial<MotionSpec>>> };
  font?: { sans?: string; mono?: string };      // default Plus Jakarta Sans / JetBrains Mono
  overrides?: { light?: RoleOverrides; dark?: RoleOverrides }; // escape hatch, keys = role names
}
```

`createTheme(config)` is pure and deterministic. Seeds accept `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `hsl()` and `oklch()`; CSS color names are not supported and fail with a `ThemeConfigError` that names the field. Invalid config throws in development and is clamped (with one `console.error` per message) in production.

## Layers

| Layer | What | Where |
|---|---|---|
| L0 | `ThemeConfig` | `src/theme/engine/config.ts` |
| L1 | OKLCH ramps (brand, accent, neutral, statuses) | `engine/palette.ts` |
| L2 | primitives: shape, density, typography, elevation, motion | `engine/primitives.ts`, `engine/motion.ts` |
| L3 | semantic roles (`--ui-*`) consumed by components | `engine/roles.ts`, `engine/solve.ts` |

Components only consume L3 roles through Tailwind utilities (`bg-surface`, `text-fg-muted`, `bg-intent-fill`...). `src/theme/tokens.css` is the Tailwind v4 bridge (`@theme inline`) and also holds the intent contract, state layers and motion utilities.

## Contrast solver

Each text/fill role is solved to the first value that reaches its target. Secondary text roles are solved from the background side (closest to the surface that still passes), which keeps the hierarchy visible. Rules worth knowing:

- Text hierarchy is strict: `fg` > `fg-muted` > `fg-subtle`, with at least 0.06 of OKLab lightness between steps.
- Interaction states (`hover`, `pressed`) are layers derived from the fill and must differ by lightness (>= 0.03) and by WCAG ratio (>= 1.12). When a step hits the gamut or lightness limit it reverses direction, so a black or white brand still gives feedback.
- Every intent fill keeps deltaE-OK >= 0.08 against canvas and surface.
- Status colors (info, success, warning, danger) follow the brand lightness but are searched over hue +-40, L and C so they stay at deltaE >= 0.08 from the brand and from each other. Base lightness is clamped to .45-.85 (light) and .65-.82 (dark), so very dark or very light brands drift from their own lightness. Warning keeps a chroma floor of .15 (gamut-capped) so it never turns ochre.
- In light mode a failing fill keeps polarity (darkens toward the light on-color); a seed that already passes is kept as is.
- Achromatic brands (gray, black, white) produce a valid theme: undefined hue never reaches the CSS as `NaN`.
- `contrastReport(theme)` lists every pair with its measured ratio; a missing or unparseable role is reported as a failure, not skipped.

`npm run theme:check` runs these properties for every preset and for randomized brands.

## Presets

`PRESETS` holds `forest` (default), `graphite`, `orchestrator`, `ember` (warm, expressive) and `ink` (sober, high contrast). Each is 3-8 lines of config. `npm run theme:build` renders them to `src/styles/theme/themes.generated.css` (never edit by hand; a freshness test fails when it is stale). The default preset also applies to `:root`.

Generated CSS selectors:

- light: `:where(:root)` / `[data-theme="id"]`, zero specificity for the default so any `data-theme` overrides it;
- dark: `:where(.dark, [data-ui-mode="dark"])` / `[data-theme="id"].dark` and `[data-theme="id"] [data-ui-mode="dark"]` (dark island inside a themed scope);
- forced light: `[data-theme="id"][data-ui-mode="light"]`, so `<ThemeScope mode="light">` works inside `.dark`.

The dark stack is intentionally lifted (canvas ~.19, surface ~.225, raised ~.26) and structure sits slightly darker than canvas (sidebar-darker pattern) with a lightness margin of at least .03 against canvas and surface.

## Runtime

```tsx
<ThemeProvider defaultTheme="orchestrator" defaultMode="dark">...</ThemeProvider>
<ThemeProvider theme={{ id: "acme", label: "Acme", brand: "#7c3aed", shape: "soft" }}>...</ThemeProvider>
<ThemeScope theme="ember" mode="light" density="compact" motion="calm">...</ThemeScope>
```

- A `ThemeConfig` that is not a preset is resolved at runtime and injected into a managed `<style>`. Switching replaces it (no accumulation) and a scope never leaks into another. Pass `themes={{ id: config }}` to register your own ids for `useTheme().setTheme(id)`.
- A saved theme id that no longer exists falls back to the default; blocked `localStorage` and missing `window` are no-ops. Storage is read with `useSyncExternalStore`, so the first commit is already correct.
- `ThemeScope` always emits `data-theme` and `data-motion`; `data-ui-mode` appears when the scope or an ancestor forces a mode. Overlays rendered in portals keep the scope (and the motion tune).
- `getThemeScript()` applies mode and theme before first paint.

## Overrides

`overrides.light` / `overrides.dark` replace individual L3 roles (keys are role names). Use them for a specific brand mandate; the contrast report still flags a violation. Prefer a seed or a knob first.

## Budget and motion

See `architecture.md` for the emphasis contract, motion levels and budget tooling.

## Adding a preset

1. Add a config file under `src/theme/presets/` and register it in `presets/index.ts` (`PresetId` and `PRESETS`).
2. Run `npm run theme` (build, checks, lint) and update the snapshot if the change is intended.
3. Inspect it in the playground, in light and dark.

## Theme tooling scripts

- `npm run theme:build` — regenerates `themes.generated.css` from `PRESETS`.
- `npm run theme:check` — vitest properties for the engine and presets (contrast, states, hierarchy, freshness).
- `npm run theme:lint` — forbids raw colors, raw Tailwind palette and removed v1 utilities in components, templates and primitives.
- `npm run theme` — all three; `prebuild` runs it.
