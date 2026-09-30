# Migration from the previous Dettmann UI

## Compatible concepts

- `ThemeProvider`, `ThemeScope` and `useTheme` remain.
- `data-theme` and `.dark` remain.
- Component composition APIs remain broadly recognizable.
- Existing semantic utilities such as `bg-surface`, `text-fg`, `bg-primary`, `bg-secondary-subtle` still exist.

## Intentional changes

- `ThemeInputs` now accepts semantic CSS colors instead of hue/chroma values.
- The generated palette/semantic CSS files are removed.
- `tailwind-variants` and `clsx` are no longer runtime dependencies of the library.
- New domain-neutral file/media/workspace patterns are available.

## Before migrating screens

Install the new package, load the new `theme.css`, then verify the screen against the theme-first and composition skills. Do not preserve legacy overrides that fight the new semantic hierarchy.
