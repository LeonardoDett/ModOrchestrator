# Theme workflow

`themes.css` is the visual source of truth. Themes define semantic colors for both light and dark modes.

## Rules

- `canvas` owns the 60% base surface.
- `structure` owns the 30% navigation/panel grouping layer.
- `brand` owns the 10% action and identity emphasis.
- Components consume semantic aliases; they do not invent palette steps.
- Semantic states (`success`, `warning`, `danger`, `info`) communicate meaning and are not decorative substitutes.
- Contrast must be checked after every theme change.

The previous hue/chroma palette generator was removed because a mathematical palette can generate technically valid colors that still feel visually wrong as a product theme. The new system makes the designer's intent explicit.
