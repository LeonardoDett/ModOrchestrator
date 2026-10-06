# Dettmann UI — Refactor Report

## Scope

This package is a full vNext refactor of the uploaded Dettmann UI library. The existing component surface was retained where practical, while the theme system, composition layer, internal styling runtime and desktop-oriented primitives were reworked.

## Main architectural changes

### Theme-first

- Removed the hue/chroma palette generator as the visual authority.
- Themes are explicitly authored in `src/styles/theme/themes.css`.
- Light and dark values are designed independently.
- 60/30/10 is represented as semantic hierarchy: canvas / structure / brand.
- Added complete semantic color families for runtime overrides.
- Added automated contrast checks for representative text/action pairs.
- Added reduced-motion handling at foundation-token level.

### Composition-first

- Replaced runtime `tailwind-variants` usage with `src/core/recipe`.
- Replaced the small `clsx` use case with `src/core/styles/cn`.
- Added `Stack`, `Inline` and `Surface` primitives.
- Preserved slot and variant patterns so current compound components remain familiar.

### Domain-ready neutral UI

Added reusable components for information-dense applications:

- `Tree`
- `FileList`
- `FileBrowser`
- `ReorderableList`
- `SplitPane`
- `MasterDetail`
- `Inspector`
- `FilterBar`
- `Toolbar`
- `Command`
- `ContextMenu`
- `MediaImage`
- `Lightbox`
- `MediaGallery`
- `Carousel`
- `LogViewer`
- `DiffViewer`
- `ResourcePage`
- `Workspace`

The library does not contain Mod Orchestrator business semantics. Those stay in the product layer.

## Accessibility-oriented improvements

- `SplitPane` exposes an accessible separator with keyboard resize.
- `Tree` supports arrow-key navigation and expansion/collapse behavior.
- `ReorderableList` exposes keyboard move controls in addition to drag-and-drop.
- `Lightbox` uses the shared overlay behavior for focus trapping, Escape handling and scroll locking.
- `FileList` supports keyboard opening and explicit row selection.
- Focus-visible styles use the semantic ring token.

## Theme validation

`npm run theme:check` now checks:

- required semantic tokens;
- the presence of light/dark theme blocks;
- representative contrast pairs against a 4.5:1 threshold when the values are statically checkable.

`npm run theme:lint` checks for:

- forbidden `tailwind-variants` / `clsx` runtime imports;
- raw black/white utility usage;
- raw hexadecimal colors in reusable runtime component code.

## Verification performed in this environment

Passed:

- `npm run theme:build`
- `npm run theme:check`
- `npm run theme:lint`
- standalone TypeScript validation of the internal recipe engine and theme-input module
- TypeScript transpile/syntax validation for all 216 `.ts` / `.tsx` source files

Not completed here:

- full dependency installation;
- full project typecheck;
- Vitest execution;
- production `tsup`/Tailwind build.

Dependency installation was attempted in the working environment but did not complete within the available execution window. The source package itself is prepared for the normal project install/build workflow.

## Public API changes worth checking

1. `ThemeInputs` now uses explicit semantic color families instead of hue/chroma-style inputs.
2. Generated palette files under `src/styles/theme/*.generated.css` were removed.
3. `tailwind-variants` and `clsx` are no longer runtime dependencies.
4. New generic file, media and workspace components are exported from the package root.

## Recommended adoption order

1. Install this version into the host application.
2. Load `theme.css`.
3. Adopt the theme-first and composition skills.
4. Migrate the shell and most visually dense screens first.
5. Remove local overrides that duplicate the previous theme system.
6. Run the final UI review prompt before starting product-specific screen work.
