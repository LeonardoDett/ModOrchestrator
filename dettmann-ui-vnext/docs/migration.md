# Migration: dettmann-ui v1 → v2

v2 is a breaking release with no alias layer (D-012). The Mod Orchestrator `frontend/` stays on `dettmann-ui-v1` until subproject 4 (migration); these tables are the input for that work. All substitutions are mechanical class/prop changes; the sections below follow the order in which they were applied inside the library.

## What stays

- `ThemeProvider`, `ThemeScope`, `useTheme` (with a new config-based API, see below).
- `data-theme` and `.dark`; `data-ui-mode` forces a mode in a subtree.
- Component composition APIs are recognizable.

## What was removed

- `culori`, `themes.css`, `theme-inputs`, `ThemeInputs` (hue/chroma), `tone.ts`, `data-tone`, `toneData()`, `TONES`/`Tone`.
- The whole `secondary-*` family and the `primary-*` / `brand-*` utilities (replaced by emphasis roles).
- Button `variant` and `tone`; Badge `variant` and `tone`; Tag `tone`.

## Theme API

| v1 | v2 |
|---|---|
| `ThemeInputs` / hue+chroma overrides | `ThemeConfig` (`brand`, `accent`, `neutral`, `vibrance`, `contrast`, `shape`, `density`, `motion`, `font`, `overrides`) |
| `themes.css` edited by hand | `PRESETS` + `npm run theme:build` (generated `themes.generated.css`) |
| `<ThemeProvider defaultTheme="forest">` | unchanged for presets; custom: `theme={config}` or `themes={{ id: config }}` |
| `theme-definitions.ts` metadata | `PRESETS[id].label` |

## Neutral tokens (v1 → v2)

| old | new |
|---|---|
| `bg-page` / `text-page` / `ring-offset-page` | `bg-canvas` / `text-canvas` / `ring-offset-canvas` |
| `bg-muted` | `bg-sunken` |
| `bg-hover` / `bg-pressed` | `bg-state-hover` / `bg-state-pressed` |
| `ring-ring` / `border-ring` / `bg-ring` | `ring-focus` / `border-focus` / `bg-focus` |
| `text-fg-inverse` | `text-canvas` |
| `text-fg-secondary` / `text-fg-tertiary` | `text-fg-muted` / `text-fg-subtle` |
| `bg-structure-raised` | `bg-structure` |
| `shadow-xs` `shadow-sm` / `shadow-md` `shadow-lg` / `shadow-xl` `shadow-2xl` | `shadow-raised` / `shadow-overlay` / `shadow-modal` |
| `rounded-xs` / `rounded-sm` `rounded-md` / `rounded-lg` `rounded` / `rounded-xl` / `rounded-2xl` `rounded-3xl` | `rounded-chip` / `rounded-control` / `rounded-card` / `rounded-panel` |
| `transition-colors duration-fast ease-default` (also with `duration-normal`) | `motion-transition` |

`rounded-full`, `rounded-none` and per-side corners (`rounded-t`...) stay. Review each `rounded-*` in context.

## Tone → intent / emphasis

| old | new |
|---|---|
| `bg-tone` / `-hover` / `-pressed` | `bg-intent-fill` / `-hover` / `-pressed` |
| `text-on-tone` | `text-on-intent` |
| `bg-tone-subtle` / `bg-tone-subtle-hover` | `bg-intent-subtle` / `bg-state-hover` |
| `border-tone-border` / `border-tone` | `border-intent-border` / `border-intent-fill` |
| `text-tone-text` / `text-tone` / `stroke-tone` | `text-intent-text` / `text-intent-fill` / `stroke-intent-fill` |
| `bg-primary` `bg-brand` | `bg-emphasis-fill` |
| `bg-primary-subtle` `bg-brand-subtle` | `bg-emphasis-subtle` |
| `bg-primary-subtle-hover` | `bg-emphasis-subtle hover:bg-state-hover` |
| `text-primary-text` / `border-primary` / `ring-primary` | `text-emphasis-text` / `border-emphasis-border` / `ring-focus` |
| `bg-secondary` / `bg-secondary-hover` `bg-secondary-pressed` / `text-on-secondary` | `bg-fill-neutral` / `bg-fill-neutral-hover` / `text-fg` |
| `bg-secondary-subtle` / `text-secondary-text` / `border-secondary(-border)` / `ring-secondary(-border)` | `bg-selected` / `text-fg` / `border-border-strong` / `ring-focus` |
| `bg-{danger,warning,success,info}` / `border-{...}` / `ring-{...}-border` | `bg-{...}-fill` / `border-{...}-border` / `ring-{...}-border` |
| `data-tone` / `toneData()` | `data-intent` / `intentData()` |

Component props:

| old | new |
|---|---|
| `tone?: Tone` (Alert, Avatar, Checkbox, FeaturedIcon, Indicator, Progress, Radio, Slider, StatusToggle, Switch, Spinner, Icon, Typography) | `intent?: Intent`; map `primary` → `brand`, `secondary` → `neutral`, others unchanged |
| `<Button variant tone>` | `<Button emphasis intent motion>`; default `emphasis="medium"`; `variant="link"` → `emphasis="low"` |
| `<Badge variant="solid\|soft\|outline" tone>` | `emphasis="high\|medium\|low"` and `intent` |
| `<Tag tone>` | `<Tag intent>` (Tag has no `emphasis` or `variant`) |

## Business rules of the new contract

- At most one `emphasis="high"` per region (`Toolbar`, `ActionBar`, modal footer, page actions); the rest is `medium` (default) or `low`. Dev builds warn.
- Do not pick colors in a screen: use roles (`bg-surface`, `text-fg-muted`) or `intent=`. `npm run theme:lint` (scans `components`, `templates`, `primitives`; tests ignored) blocks: hex literals, `rgb()`/`rgba()`/`hsl()`/`hsla()`/`oklch()`/`oklab()` literals, `bg/text/border-black|white`, the raw Tailwind palette (`bg-red-500`), `tone`/`primary`/`secondary` color utilities (`bg-tone`, `text-primary-text`...) and `data-tone`. It does not catch the removed neutral tokens (`bg-page`, `bg-muted`, `shadow-md`, `rounded-lg`...): use the grep in the checklist below.
- Motion comes from emphasis; use `MotionScope`/`motion=` only to deviate.

## Checking a migrated screen

1. `grep -rnE "\b(bg|text|ring|border)-(page|muted|hover|pressed|ring)\b|fg-inverse|structure-raised|shadow-(xs|sm|md|lg|xl|2xl)\b|duration-(fast|normal)|ease-default|data-tone|-(tone|primary|secondary)\b"` returns nothing.
2. Typecheck and tests pass.
3. Open the screen with `<BudgetInspector />` in both modes.
4. Run the `dettmann-ui-improve` skill for a read-only audit.
