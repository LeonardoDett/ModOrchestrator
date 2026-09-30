# Architecture decisions

## D-001 — Semantic theme values replace hue/chroma generation

The previous system derived a large palette from two inputs per role. That was useful for mathematical consistency but too indirect for intentional product design. A theme must be judged as a complete visual composition, so light/dark semantic values are now explicit.

## D-002 — 60/30/10 is a hierarchy contract

The ratio is not a literal screen pixel quota. It constrains the default visual distribution of surfaces and emphasis. A feature can intentionally violate it for a focused action surface, but page chrome should remain neutral/structural.

## D-003 — Internal recipe runtime

The library no longer requires `tailwind-variants` or `clsx` at runtime. The compatibility subset used by current components lives under `src/core/recipe` and `src/core/styles/cn`.

## D-004 — Positioning remains external where appropriate

Menus/popovers continue to use Floating UI because anchored positioning is an interaction problem with many browser edge cases. It is isolated to components that need it.

## D-005 — Generic file/media patterns are allowed

File and media components are domain-neutral primitives. They exist because desktop tools, admin apps and content-heavy products repeatedly need the same behaviors.

## D-006 — Business semantics stay outside the UI package

The package does not know what a mod, conflict rule, deployment plan or plugin is. It provides tables, trees, lists, inspectors, reorderable lists, dialogs and navigation so products can express those concepts consistently.

## D-007 — DataTable owns interaction, not data

`DataTable` is the dense grid for large collections: declarative columns, resizable and hideable columns (`DataTableColumnPicker`), a filter row slot, explorer-style multi-selection (click, Ctrl/Cmd, Shift, keyboard), a focused-row cursor via `aria-activedescendant`, collapsible groups and virtualization above a threshold (TanStack Virtual, the approved dependency). It reports sort requests and never reorders or filters rows itself: products usually filter and sort in their backend, and a client-side engine would duplicate that logic. Selection and grouping rules are pure functions in `data-table.model.ts`, tested without rendering.

## D-008 — Tone contract lives in tokens.css

Components paint toned surfaces with `bg-tone`, `text-on-tone`, `bg-tone-subtle`, `border-tone-border` and `text-tone-text`, and select the tone with `data-tone` (`theme/tone.ts`). The mapping from each tone to its semantic role is part of `src/theme/tokens.css`. It had been lost in the refactor, which left every toned component colorless. `npm run theme` now fails if a tone has no mapping.

## D-009 — Built-in texts are overridable

Components that ship text (Sidebar, LogViewer, Tag, Toast, DataTable, Command) accept it through props (`labels`, `searchLabel`, `removeLabel`, `closeLabel`, `placeholder`...). English defaults remain for convenience; localized products must pass their own.

## D-010 — Recipe variant typing

Recipe variant props are typed per key (`"true" | "false"` keys become `boolean`), with no index signature. The previous `Record<string, ...>` fallback leaked an index signature into every component's props and broke type checking (and `.d.ts` generation) across the library.
