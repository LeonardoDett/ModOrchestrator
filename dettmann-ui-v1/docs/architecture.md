# Dettmann UI vNext — Architecture

## Goal

Dettmann UI is a long-lived foundation for applications that need both calm SaaS interfaces and information-dense desktop workspaces. It should remain useful across products without importing product business semantics into the library.

## Layers

```text
Theme source
    ↓
Foundation tokens
    ↓
Semantic aliases
    ↓
Recipe engine
    ↓
Primitives
    ↓
Components
    ↓
Templates / compositions
    ↓
Product screens
```

### Theme source

`src/styles/theme/themes.css` is the visual source of truth. Themes explicitly define light and dark semantic values. The old hue/chroma generation model was removed because the relationship between roles is a design decision, not something a generic luminance curve can reliably infer.

### Foundation tokens

Spacing follows a 4 px base rhythm, with additional values for interaction targets and alignment. Motion durations and easing live in the same foundation layer, and reduced-motion preferences collapse animation durations globally.

### Semantic aliases

Components consume concepts such as `surface`, `structure`, `brand`, `fg`, `border` and `ring`. They do not choose raw palette values.

### Recipe engine

`src/core/recipe` provides variants, defaults, compound variants and slots without shipping `tailwind-variants` at runtime. `src/core/styles/cn` replaces the tiny `clsx` use case with a local class-value flattener.

### Composition

Composition is structural. Complex interactions should be built from parts that can also be used independently: a toolbar, tree, list, inspector, split pane, command surface or overlay should not require the rest of a product to exist.

### Logic and UI

State and interaction belong at the component boundary or in hooks. Rendering remains declarative. Templates orchestrate components but do not own product data or persistence.

### Domain neutrality

The library deliberately does not know what a "mod", "conflict", "deployment plan", "plugin" or "load order" is. It supplies generic information-management primitives so the Mod Orchestrator can define those concepts in its own domain layer.
