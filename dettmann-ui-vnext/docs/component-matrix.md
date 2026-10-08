# Component matrix

## Foundations

`Box`, `Stack`, `Inline`, `Surface`, `Container`, `Grid`, `Typography`, `Icon`, `Portal`, `Backdrop`, `Skeleton`, `Divider`, `Kbd`, `VirtualList`, `VisuallyHidden`

## Animated icons and loaders

`Loader` (`arc`, `dots`, `pulse`, `bars`; replaces `Spinner`) is exported from the root. About 55 animated icons (`TrashIcon`, `CheckIcon`, `RefreshIcon`...) come from the subpath `dettmann-ui/icons`, together with the techniques (`squash`, `lift`, `nudge`, `rotate`, `spin`, `draw`, `undraw`, `flip`, `trail`, `pulse`, `stagger`); the root exports only `defineIcon` and the icon types. Props: `size`, `intent`, `label`, `strokeWidth`, `trigger` (`auto` | `none`), `playKey`, `loop`. `Icon` remains for Lucide glyphs outside the catalog.

## Inputs and controls

`Button`, `ButtonGroup`, `Checkbox`, `Radio`, `Switch`, `Slider`, `Input` (Field, Textarea, Select, Combobox, MultiSelect, Pin, Number), `DatePicker`, `SegmentedControl`, `Pagination`

`Input.Select` is a custom select with Material Design 3 behaviour (not a native `<select>`): anchored `listbox` that flips when there is no room, opens scrolled to the selection with a vertical-expand entrance (`Presence`, responsive motion), keyboard (Space/Enter/↑/↓ open; ↑/↓/Home/End move; typeahead open and closed; Enter/Space commit; Esc/Tab close without change), disabled options skipped, hidden input for form submission. Options accept `icon` and `description`; `{ label, options }` items render as groups.

## Navigation and transient UI

`Menu`, `ContextMenu`, `Popover`, `Tooltip`, `Modal`, `Drawer`, `Tabs`, `Accordion`, `Toast`, `Command`

## Data and status

`Table`, `DataTable`, `DataTableColumnPicker`, `List`, `Badge`, `Tag`, `Alert`, `Progress`, `Rating`, `Breadcrumbs`, `ActionBar`, `Toolbar`, `FilterBar`, `Inspector`, `LogViewer`, `DiffViewer`

## Files and media

`Tree`, `FileList`, `FileBrowser`, `ReorderableList`, `MediaImage`, `Lightbox`, `MediaGallery`, `Gallery`, `Carousel`, `FileDropzone`

## Templates

`Workspace`, `ResourcePage`, `MasterDetail`, `ConfirmDialog`, `AppShell`, `Sidebar`, `Navbar`, `Calendar`
