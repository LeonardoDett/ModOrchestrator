# Cursor Prompt — Theme migration

Read the full Dettmann UI context and the theme-first skill.

Migrate the application to the semantic theme contract:

- 60% canvas/surface hierarchy;
- 30% structure/navigation/panel hierarchy;
- 10% brand/action hierarchy;
- semantic status colors only for meaning;
- explicit light/dark values.

Do not solve theme problems by scattering CSS overrides through screens.
If an application-specific theme is needed, add it as one semantic theme definition and document it.

After implementation, inspect the five most visually dense screens and remove overrides that duplicate component styling.
