# Dettmann UI — Theme First

Use this skill whenever adding or changing UI styling.

## Source of truth

Read, in order:

1. `src/styles/theme/themes.css`
2. `src/styles/theme/foundations.css`
3. `src/theme/tokens.css`
4. the component contract for the target component

Do not introduce hard-coded product colors in component files.

## 60/30/10

Treat 60/30/10 as a visual hierarchy contract:

- 60% canvas/surface/sunken neutrals.
- 30% structure/navigation/panel surfaces.
- 10% brand/action emphasis.

The ratio is a design budget, not a literal pixel calculation.

## Color roles

Use semantic aliases (`bg-page`, `bg-surface`, `bg-structure`, `bg-primary`, `text-fg`, `text-fg-muted`, `border-border`, etc.). Never reach for raw palette numbers.

Semantic status colors are reserved for meaning. Do not use success/danger/warning/info to make a screen more colorful.

## Dark mode

Every theme must have an intentionally designed dark layer. Do not invert the light theme mechanically.

## Accessibility

Preserve visible keyboard focus. Do not use color as the only state signal. Verify contrast for text and control boundaries.
