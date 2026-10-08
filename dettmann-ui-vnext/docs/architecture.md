# Dettmann UI v2 — Architecture

## Goal

A long-lived React UI foundation for calm SaaS interfaces and information-dense desktop workspaces, with no product business semantics. Design intent is decided once, by the theme and the emphasis contract, and components only consume it.

## Four layers

```text
L0  ThemeConfig        brand seed + personality knobs (the only input)
 ↓  engine (pure TS: OKLCH math, contrast solver)
L1  Ramps              brand, accent, tinted neutrals, statuses
L2  Primitives         shape, density, typography, elevation, motion
L3  Semantic roles     --ui-* variables → Tailwind utilities (bg-surface, text-fg-muted, bg-intent-fill)
 ↓
Recipes / primitives → Components → Templates → Product screens
```

The engine (`src/theme/engine`) is shared by the build (`npm run theme:build` renders presets) and the runtime (`ThemeProvider`/`ThemeScope` resolve custom configs). `src/theme/tokens.css` is the Tailwind v4 bridge; its `@source` entries scan only `src`, with `@source not` for the lib's own `docs`, `skills` and `playground` so fixture classes do not leak into `dist/index.css`. Consumers keep auto-detection of their own sources.

## Emphasis contract (60/30/10)

Two axes, resolved by one table (`src/theme/emphasis.ts`, `resolveEmphasis`):

- `emphasis`: `low` (60%) / `medium` (30%) / `high` (10%): how loudly the element asks for attention.
- `intent`: `neutral` (default), `brand`, `accent`, `info`, `success`, `warning`, `danger`: what it means.

`emphasis="high"` without an explicit intent means `brand`. The resolution yields color classes, the default motion level and `data-layer`. Components never pick colors locally.

| emphasis | default motion | data-layer |
|---|---|---|
| high | expressive | high |
| medium | responsive | medium |
| low | calm | low |

Structural components (Sidebar, Navbar, AppShell, Toolbar, Tabs, table headers) are born `medium`. Only what is marked `high` uses the brand fill.

## Budget tooling (dev only, removed in production)

- `data-budget-region` on Toolbar, ActionBar, Modal footer and ResourcePage actions: more than one visible `high` element in a region logs a `console.warn` (`useBudgetGuard`).
- `<BudgetInspector />` samples the visible DOM by `data-layer` and reports low/medium/high area share against the 60/30/10 target (default tolerance +-8 pp for low and medium, <= 12% for high), with an optional heatmap. `sampleLayers`, `summarizeLayers` and `budgetVerdict` are exported for tests.
- `npm run theme:lint` forbids hex, `rgb()`/`hsl()` literals, raw Tailwind palette colors and removed v1 utilities in `components`, `templates` and `primitives` (tests ignored).

## Motion

Three levels: `calm`, `responsive`, `expressive`. Each is a `MotionSpec` (spring stiffness/damping/mass, duration, amplitude, pressScale, stagger) emitted as CSS variables; the spring is simulated and sampled into a CSS `linear()` easing plus its settle duration.

- Effective level = `min(context level, theme ceiling)`, exposed as `data-motion` so plain CSS inherits it.
- Fine tuning is data, at three levels: theme (`motion.tune`), region (`<MotionScope level tune>`) and instance (`motion` prop).
- Primitives: `animate()` (WAAPI), `<Presence>`, `useFlip()`, `useMotion()`, `readMotion()`.
- `animateLoop()` runs infinite loops (fixed `period`, linear timing, reduced motion = slow opacity pulse); `animate(..., { keyframeEasing: true })` lets keyframes carry their own easing (used by the two-phase icon gestures).
- Reduced motion is honored both by the media query and by `:root[data-reduce-motion="true"]` (the app setting): displacement, bounce and scale become fade/color with a short duration; state feedback is never removed.

## Animated icons

`src/icons` holds `defineIcon` (a glyph = named parts + `action`/`loop` choreographies), the technique vocabulary (`techniques.ts`), the playback engine, a registry and one delegated `document` controller that plays an icon's `action` when its nearest interactive control is hovered, pressed or keyboard-focused. Glyphs and techniques are reachable only through the subpath `dettmann-ui/icons`; the root exports `defineIcon`, the icon types and `Loader`. Intensity is base x `m.amp`; icons write no color, duration or curve of their own (D-027 to D-031).

## Layering inside the package

`theme` (engine, runtime, emphasis) ← `motion` ← `primitives` ← `components` ← `templates`. `dev` (budget) hooks into the provider. Recipes live in `src/core/recipe`; `cn` replaces `clsx`; Floating UI handles anchored positioning; TanStack Virtual handles large lists.

## Composition and logic

Composition is structural: complex surfaces are built from parts usable on their own. State and interaction live at the component boundary or in hooks; templates orchestrate components but own no product data.

## Domain neutrality

The library knows nothing about mods, conflicts, deployment plans, plugins or load order. It supplies tables, trees, lists, inspectors, reorderable lists, dialogs and navigation so products express those concepts in their own domain layer.

## Playground and skills

`npm run playground` is the local Vite app for tuning themes (see README). The three skills in `skills/` (`dettmann-ui-use`, `dettmann-ui-author`, `dettmann-ui-improve`) are the AI-facing contract; `npm run skills:install -- <target>` copies them to `.claude/skills` and `.cursor/skills` of a project.
