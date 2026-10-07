# Dettmann UI vNext

A long-lived React UI foundation built around **theme-first**, **composition-first** and **logic/UI separation**.

## What is new in v2

v2 is a breaking release (no aliases). The app keeps using `dettmann-ui-v1` until the migration subproject; see `docs/migration.md`.

- **Themes from seeds.** One brand color plus personality knobs; a pure TypeScript engine (own OKLCH math, contrast solver) generates light and dark, at build time for presets and at runtime for custom themes.
- **Emphasis x intent.** `emphasis` (low/medium/high = 60/30/10) says how loud, `intent` says what it means. The `secondary` family is gone.
- **Motion that follows emphasis.** Three spring levels, tunable as data, honoring reduced motion.
- **Budget tooling.** Dev-only guards and an inspector measure the 60/30/10 split.
- **Playground and skills.** A local app for tuning themes and three AI skills.
- **Defaults.** `balanced` shape, Plus Jakarta Sans + JetBrains Mono, expressive motion ceiling.

## Composition first

- internal recipe/slot engine;
- reusable `Stack`, `Inline`, `Surface` primitives;
- components built from predictable slots;
- templates separated from business logic;
- controlled and uncontrolled state where the behavior is meaningful.

## Domain-ready foundations

New generic building blocks cover workflows that need dense, inspectable interfaces:

- `Tree`
- `FileList`
- `FileBrowser`
- `ReorderableList`
- `SplitPane`
- `MasterDetail`
- `Inspector`
- `FilterBar`
- `Command`
- `ContextMenu`
- `MediaImage`
- `Lightbox`
- `MediaGallery`
- `Carousel`
- `ResourcePage`
- `Workspace`

These remain domain-neutral. The Mod Orchestrator owns mod/conflict/plugin/deployment semantics. `LogViewer` and `DiffViewer` are intentionally fed by already-structured data so parsing, diffing and diagnostics can live outside the visual layer.

## Reference philosophy

The interaction and visual direction borrows from Microsoft's Fluent 2: semantic design tokens, restrained color usage, a 4 px spacing rhythm, whitespace as hierarchy, predictable focus management and accessible interaction states. See `docs/fluent-reference.md`.

## Install

```tsx
import { ThemeProvider, Button } from "dettmann-ui";
```

Load the library CSS once (Tailwind v4 bridge, includes the generated presets and fonts):

```css
@import "dettmann-ui/theme.css";
```

`dettmann-ui/styles.css` is the prebuilt `dist/index.css` for consumers without Tailwind.

## Theme

```tsx
// preset
<ThemeProvider defaultTheme="orchestrator" defaultMode="dark">{children}</ThemeProvider>

// your own, from a seed
import { createTheme, type ThemeConfig } from "dettmann-ui";
const acme: ThemeConfig = { id: "acme", label: "Acme", brand: "#7c3aed", neutral: "cool", shape: "soft" };
<ThemeProvider theme={acme}>{children}</ThemeProvider>

// a subtree with another theme, mode, density or motion
<ThemeScope theme="ember" mode="light" density="compact">...</ThemeScope>
```

Presets: `forest` (default), `graphite`, `orchestrator`, `ember`, `ink` (`PRESETS`). Only `brand` is required; `accent`, `neutral`, `vibrance`, `contrast`, `shape`, `density`, `motion`, `font` and per-role `overrides` are optional. `createTheme(config)` is pure and `contrastReport()` lists the measured pairs. Details: `docs/theme-system.md`.

## Emphasis x intent

```tsx
<Button emphasis="high">Deploy</Button>                 {/* brand fill, expressive */}
<Button>Cancel</Button>                                  {/* medium neutral, responsive */}
<Button emphasis="low" intent="danger">Remove</Button>   {/* danger text, calm */}
```

One `high` per region. Structural components are `medium`. Use roles (`bg-surface`, `text-fg-muted`, `bg-intent-fill`), never raw colors. See `docs/architecture.md`.

## Motion

Levels `calm`, `responsive`, `expressive` come from emphasis and are capped by the theme (`motion: { ceiling, tune }`). Adjust a region with `<MotionScope level tune>` or an element with `motion=`. Primitives: `animate()`, `<Presence>`, `useFlip()`, `useMotion()`. Reduced motion (OS setting or `:root[data-reduce-motion="true"]`) turns movement into short fades.

## Budget

In development, regions marked `data-budget-region` warn when they hold more than one visible `high` element, and `<BudgetInspector />` shows the painted share of low/medium/high against 60/30/10. `npm run theme:lint` blocks raw colors in components.

## Playground

```bash
npm run playground
```

Edit every knob, compare light and dark, inspect ramps and contrast, try the motion levels, and export the config as code.

## Skills

`skills/` holds `dettmann-ui-use` (building screens), `dettmann-ui-author` (changing the library) and `dettmann-ui-improve` (read-only audit). Install them into a project with:

```bash
npm run skills:install -- <target-folder>
```

which copies them to `<target>/.claude/skills` and `<target>/.cursor/skills`.

## Scripts

`npm run typecheck`, `npm test -- --run`, `npm run theme` (build + check + lint presets), `npm run build`.

## Reference philosophy

Interaction and visual direction borrow from Microsoft's Fluent 2: semantic tokens, restrained color, a 4 px rhythm, whitespace as hierarchy, predictable focus and accessible states. See `docs/fluent-reference.md`.
