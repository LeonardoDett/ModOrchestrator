# Dettmann UI — UI Review

Use this skill before declaring a new component, template or screen complete.

## Visual review

Check the screen in both light and dark modes.

Verify the hierarchy follows:

- 60% visual field: canvas/surface/sunken;
- 30% structure: navigation, supporting panels and tool regions;
- 10% emphasis: brand, selected actions and focus.

Do not count every component as part of the 10%. A selected row can use emphasis without making its whole container chromatic.

## Interaction review

Verify:

- keyboard focus is visible;
- primary interactions have an accessible name;
- selection is not communicated only by color;
- dialogs and overlays manage focus and Escape correctly;
- menus, trees and reorderable lists have keyboard alternatives;
- loading, empty, disabled, error and destructive states are explicit.

## Composition review

Before adding markup, ask whether an existing primitive can express the layout:

`Stack`, `Inline`, `Surface`, `Toolbar`, `SplitPane`, `MasterDetail`, `Inspector`, `FilterBar`, `Tree`, `FileList`, `Command`.

Prefer composition over a new all-in-one component.

## Theme review

Search the changed files for:

- raw hex/rgb colors;
- `bg-black`, `bg-white`, `text-black`, `text-white` used as product styling;
- dynamic Tailwind class interpolation;
- local theme variables that duplicate `themes.css`.

The component should consume semantic aliases.

## Final evidence

The implementation is complete only after the relevant test(s) are updated and the change does not introduce a dependency that can be replaced by an existing Dettmann UI primitive or a small browser API.
