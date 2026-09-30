# Theme System

## Core model

The visual system is driven from semantic roles, not from a generated color ladder.

```text
Theme definition
    ↓
semantic roles
    ↓
component recipes
    ↓
composition
    ↓
product screens
```

`src/styles/theme/themes.css` is the visual source of truth. `src/theme/theme-definitions.ts` contains metadata and registry information; it should not duplicate palette decisions.

## 60 / 30 / 10

60/30/10 is a hierarchy contract:

- **60% — canvas:** `canvas`, `surface`, `sunken` and their near-neutral descendants.
- **30% — structure:** `structure`, `structure-raised`, navigation, tool regions and supporting chrome.
- **10% — emphasis:** `brand`, focus, selected states and primary actions.

This is not a pixel counter. It is a guardrail against turning every component into a colored surface. A component may use an emphasis token more strongly when its role requires it, but the surrounding workspace should preserve the hierarchy.

## Semantic roles

Canonical roles are:

- `canvas`, `surface`, `raised`, `sunken`
- `structure`, `structure-raised`
- `fg`, `fg-secondary`, `fg-tertiary`, `fg-disabled`, `fg-inverse`
- `border-subtle`, `border`, `border-strong`, `ring`
- `brand` and its hover/pressed/subtle/border/text variants
- `secondary` for secondary structural emphasis
- `accent` for intentionally distinct product accents
- `info`, `success`, `warning`, `danger` for meaning, not decoration

`primary-*` remains available as the compatibility alias for `brand-*`.

## Dark mode

Dark themes must be designed independently. Do not invert the light theme or simply reduce luminance. Dark mode changes the surface hierarchy, contrast relationships and chromatic intensity as a group.

## Adding a theme

1. Add a complete light block to `src/styles/theme/themes.css`.
2. Add a complete dark block for the same theme.
3. Define all semantic families, including status colors.
4. Add metadata to `src/theme/theme-definitions.ts`.
5. Run `npm run theme`.
6. Inspect representative screens in both modes.

Do not create a theme by globally replacing one color. Theme quality comes from the relationships between surfaces, structure, content, borders, focus and emphasis.

## Runtime overrides

`ThemeInputs` is intentionally semantic. It can override high-level visual roles for embedded products without reintroducing a hue/chroma generator.

```tsx
<ThemeProvider
  defaultTheme="forest"
  defaultMode="dark"
>
  {children}
</ThemeProvider>
```

Use runtime overrides sparingly. A product theme should normally be a registered, complete theme.
