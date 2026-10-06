# Cursor Prompt — Conflicts UI

Build the conflict workflow using generic UI primitives.

Use:

- `MasterDetail` for conflict set -> conflict details;
- `FileList` or `Table` for files;
- `Tree` for folder/file hierarchy;
- `ReorderableList` where order manipulation is needed;
- `ContextMenu` for contextual resolution actions;
- `Badge`, `Alert`, `Inspector` for state and explanation.

The screen must explain why a file wins. The UI must distinguish rule-based resolution from install-order fallback and unresolved ambiguity.

Do not encode conflict semantics inside the Dettmann UI package.
