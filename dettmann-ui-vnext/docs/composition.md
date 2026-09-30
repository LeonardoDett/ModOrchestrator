# Composition Contract

A component should have a small, predictable public surface.

Examples:

```tsx
<SurfaceGroup.Root>
  <SurfaceGroup.Header>
    <SurfaceGroup.Title>...</SurfaceGroup.Title>
  </SurfaceGroup.Header>
  <SurfaceGroup.Body>...</SurfaceGroup.Body>
</SurfaceGroup.Root>
```

```tsx
<FileBrowser tree={...} files={...} toolbar={...} />
```

The first pattern is lower-level and maximally reusable. The second is a domain-neutral template for a recurring information architecture.

## Composition rules

Do not couple a leaf component to application state. Pass state and events down.

Do not make a component own routing, persistence, fetching or business rules.

Do not solve every layout with a card. Use plain surfaces, grids, lists and whitespace where the relationship is structural rather than boxed.
