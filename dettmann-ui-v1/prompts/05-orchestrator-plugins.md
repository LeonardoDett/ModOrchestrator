# Cursor Prompt — Plugins/load order UI

Use the UI package without inventing domain components unless there is no generic fit.

Use `ReorderableList`, `Table`, `FilterBar`, `Command`, `Inspector`, `Badge` and `ContextMenu` to represent plugin order and plugin state.

The UI must expose:

- enabled/disabled state;
- current position;
- dependency/problems state;
- source/plugin metadata;
- safe bulk actions;
- explicit unsaved/pending state when appropriate.

The domain layer decides whether an ordering change is legal. The UI only renders the state and emits commands.
