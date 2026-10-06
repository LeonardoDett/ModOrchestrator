# Dettmann UI — Component Authoring

Before creating a component:

1. Search for an existing primitive or composition pattern.
2. Read the theme-first skill.
3. Define the component contract before styling.
4. Reuse internal recipes and semantic tokens.
5. Implement keyboard/focus behavior as part of the component, not as a later patch.
6. Add tests for state transitions, controlled/uncontrolled behavior and accessible names where applicable.

A component is ready only when its behavior, composition API, states, and theme contract are explicit.

## Dependency rule

Prefer browser/React APIs and Dettmann UI internals. Add a new runtime dependency only when the behavior is substantially difficult or fragile to implement correctly. External dependencies must be isolated behind an internal adapter when practical.

Current approved infrastructure dependencies:

- Floating UI for complex anchored positioning.
- TanStack Virtual for large-list virtualization.
- date-fns for date math.
- lucide-react for the default icon vocabulary.
