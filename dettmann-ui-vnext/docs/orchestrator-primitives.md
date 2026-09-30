# Orchestrator-Oriented UI Coverage

This release intentionally includes building blocks that fit the Mod Orchestrator without making the UI library itself domain-specific.

| Need | Library building block |
| --- | --- |
| File/folder navigation | `Tree`, `FileBrowser` |
| Dense file inventory | `FileList`, `Table`, `VirtualList` |
| Selected item details | `MasterDetail`, `Inspector` |
| Reordering | `ReorderableList`, `SplitPane` |
| Search/filter workflows | `Command`, `FilterBar`, `SegmentedControl` |
| Context actions | `ContextMenu`, `Menu` |
| Image preview | `MediaImage`, `Lightbox` |
| Image collections | `MediaGallery`, `Gallery`, `Carousel` |
| Import workflows | `FileDropzone` |
| Resource screens | `ResourcePage`, `Workspace` |

These are intentionally generic. Mod-specific concepts such as conflict rules, plugin load order semantics and deployment state stay in the Mod Orchestrator domain layer.
