# Cursor Prompt — Mods/files UI

Read the Mod Orchestrator specs and the Dettmann UI file-oriented components.

Build the mods management screen around:

- `Toolbar`
- `FilterBar`
- `Table` or `FileList`
- `MasterDetail`
- `Inspector`
- `ContextMenu`
- `Command`
- `FileDropzone`
- `MediaGallery` / `Lightbox` for mod previews.

Keep batch actions explicit and safe. Selection state, filtering and sorting belong at the screen/controller layer. Reusable components should only own their interaction mechanics.
