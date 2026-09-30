# Dettmann UI vNext

A long-lived React UI foundation built around **theme-first**, **composition-first** and **logic/UI separation**.

## What changed

The previous package optimized strongly for having many components, but its color system and component styling were still making local decisions. This release changes the architecture so the system's visual intent is decided before components consume it.

### Theme first

- direct semantic light/dark theme definitions;
- explicit canvas / structure / brand hierarchy;
- 60/30/10 used as a visual budget;
- semantic aliases instead of raw color steps;
- runtime semantic overrides;
- no generated hue/chroma palette guessing.

### Composition first

- internal recipe/slot engine;
- reusable `Stack`, `Inline`, `Surface` primitives;
- components built from predictable slots;
- templates separated from business logic;
- controlled and uncontrolled state where the behavior is meaningful.

### Domain-ready foundations

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

## Installation

The package remains importable from the root entry point:

```tsx
import { ThemeProvider, Button, FileBrowser } from "dettmann-ui";
```

Load the library CSS once:

```css
@import "dettmann-ui/theme.css";
```

## Theme

```tsx
<ThemeProvider defaultTheme="forest" defaultMode="dark">
  {children}
</ThemeProvider>
```

Theme source of truth:

`src/styles/theme/themes.css`

Runtime theme overrides are explicit semantic values; color families are complete rather than guessed from a single base color.

Theme metadata:

`src/theme/theme-definitions.ts`

## Cursor workflow

Start with `.cursor/skills/dettmann-ui/theme-first/SKILL.md`, then `composition/SKILL.md`, then `component-authoring/SKILL.md`.

Use the prompts in `prompts/` when asking Cursor to migrate an application or build the Mod Orchestrator.

## Refactor evidence

See `REFACTOR_REPORT.md` for architectural changes and verification performed during this rebuild.
