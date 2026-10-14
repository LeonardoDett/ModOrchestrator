# Component matrix

Levels follow Atomic Design (D-032): a component imports only its own level or below. The level of every folder lives in `src/__tests__/atomic-levels.test.ts`.

| Level | Components |
|---|---|
| Atoms | every primitive, `Button`, `Checkbox`, `Radio`, `Switch`, `Badge`, `Tag`, `FilterChip`, `Indicator`, `Loader`, `Avatar`, `FeaturedIcon`, `MediaImage`, `Progress`, `Rating`, `Slider`, `Surface`, `Tooltip` |
| Molecules | `Input`, `ButtonGroup`, `SegmentedControl`, `StatusToggle`, `StatTile`, `SwatchPicker`, `SettingRow`, `Accordion`, `ActionBar`, `Alert`, `Breadcrumbs`, `Card`, `ContextMenu`, `DatePicker`, `Drawer`, `EmptyPlaceholder`, `EmptyState`, `FloatingButton`, `List`, `Menu`, `Modal`, `PageContainer`, `Pagination`, `Popover`, `Section`, `SplitPane`, `Stepper`, `Tabs`, `Toast`, `Toolbar` |
| Organisms | `DataTable`, `Table`, `Tree`, `ReorderableList`, `Command`, `Inspector`, `FilterBar`, `DiffViewer`, `LogViewer`, `FileList`, `FileBrowser`, `Gallery`, `MediaGallery`, `Lightbox`, `Carousel`, `MasterDetail`, `ResourcePage` |
| Templates | everything in `src/templates` |

## Foundations

`Box`, `Stack`, `Inline`, `Surface`, `Container`, `Grid`, `Typography`, `Icon`, `Portal`, `Backdrop`, `Skeleton`, `Divider`, `Kbd`, `VirtualList`, `VisuallyHidden`

## Animated icons and loaders

`Loader` (`arc`, `dots`, `pulse`, `bars`; replaces `Spinner`) is exported from the root. 63 animated icons (`TrashIcon`, `CheckIcon`, `RefreshIcon`...) come from the subpath `dettmann-ui/icons`, together with the techniques (`squash`, `lift`, `nudge`, `rotate`, `spin`, `draw`, `undraw`, `flip`, `trail`, `pulse`, `stagger`); the root exports only `defineIcon` and the icon types. Props: `size`, `intent`, `label`, `strokeWidth`, `trigger` (`auto` | `none`), `playKey`, `loop`. `Icon` remains for Lucide glyphs outside the catalog.

## Inputs and controls

`Button`, `ButtonGroup`, `Checkbox`, `Radio`, `Switch`, `Slider`, `Input` (Field, Password, Textarea, Select, Combobox, MultiSelect, Pin, Number), `DatePicker`, `SegmentedControl`, `Pagination`

`Input.Select` is a custom select with Material Design 3 behaviour (not a native `<select>`): anchored `listbox` that flips when there is no room, opens scrolled to the selection with a vertical-expand entrance (`Presence`, responsive motion), keyboard (Space/Enter/↑/↓ open; ↑/↓/Home/End move; typeahead open and closed; Enter/Space commit; Esc/Tab close without change), disabled options skipped, hidden input for form submission. Options accept `icon` and `description`; `{ label, options }` items render as groups.

`Input.Select multiple` (D-034) holds a `string[]`: options toggle with a check box and the menu stays open; the trigger shows tags on one line and collapses the overflow into `+N` (`moreLabel`), or a summary through `selectedText`; `maxSelected` caps the selection. Use `Input.MultiSelect` when the list needs search.

`Input.Password` (D-034) masks a sensitive value and reveals it with an eye button: `revealed`/`defaultRevealed`/`onRevealedChange`, `hideOnBlur` (default on), `revealable`, `revealLabel`/`hideLabel`.

## Navigation and transient UI

`Menu`, `ContextMenu`, `Popover`, `Tooltip`, `Modal`, `Drawer`, `Tabs`, `Accordion`, `Toast`, `Command`

Wave 2 (D-035): `Modal` and `Drawer` animate entrance and exit (the panel is `inert` while leaving); `Menu`, `ContextMenu` and `Popover` animate the entrance. Menu items and `Command` options are compact `rowRecipe` rows. `Command` accepts `loading`/`loadingLabel`. `Alert.Root` and toasts show the status glyph of their intent (`icon` on `Alert.Root` overrides or removes it).

## Data and status

`Table`, `DataTable`, `DataTableColumnPicker`, `List`, `Badge`, `Tag`, `Alert`, `Progress`, `Rating`, `Breadcrumbs`, `ActionBar`, `Toolbar`, `FilterBar`, `Inspector`, `LogViewer`, `DiffViewer`

Wave 3 (D-036): `DataTable` rows are 32/28 px with one state variant (idle, selected, dragged, group) and slide on reorder, sort and filter; `Table` is compact with a structural header; `Tabs` show the brand indicator on the active tab and animate the panel entrance; `FilterBar` (`filtersLabel`) and the `Inspector` header are structural `medium` layers.

Redesign batch 2 (D-039): `FilterChip` (+ `Group`), `StatTile` (+ `Grid`), `SwatchPicker`, `SettingRow` are new; `Tag` gains `color` and `icon`; `Progress.Stacked`; `Checkbox variant="card"`; `Section` gains `density` and header `actions`; `List` gains a static mode, slot rows (`title`, `description`, `meta`, `actions`, `unread`) and `List.Group`.

Board fidelity (D-040): `DataTable density="relaxed"`, `ResourcePage layout="workspace"` + `meta`, `Switch size="xs"`, `Tag size="xs"`/`dot`/`shape`/`outline` and `TagAdd`, `Modal.Content size="custom"`, `Modal.Header layout`, `Modal.Footer size`, `Modal.Title size`, `Tabs size="sm"`, `StatTile size="lg"`/`outlined`, `Table density`, `Tree variant="rows"`, `SwatchPicker size`/`tint`.

Redesign batch 1 (D-038): `Indicator variant="chip"` (value and label visible, for page headers); `Alert` gains `action`, `onDismiss`/`dismissLabel` and `compact`; `Avatar` gains `shape="square"` (monograms), `color` from the category palette, `emphasis` and `label`; `Button` gains `badge`, `progress` and `tooltip`.

Wave 4 (D-037): `Card.Root` takes `emphasis` (`low` | `medium`), `interactive` and `selected` (no `variant`, no shadow); `Toolbar`, `ActionBar` and `Sidebar` are `bg-structure` medium layers.

## Files and media

`Tree`, `FileList`, `FileBrowser`, `ReorderableList`, `MediaImage`, `Lightbox`, `MediaGallery`, `Gallery`, `Carousel`, `FileDropzone`

## Templates

`Workspace`, `ResourcePage`, `MasterDetail`, `ConfirmDialog`, `AppShell`, `Sidebar`, `Navbar`, `Calendar`

Redesign batch 1 (D-038): `AppShell layout="topbar"` (bar across the window, only the content scrolls); `Navbar size="compact"` with `windowControls`; `Sidebar` items take `count`, `countLabel` and `attention`, collapsed items get a tooltip, `footer` can be a function of `{ collapsed }`, `heading` labels the collapse row, widths come from `--sidebar-width`/`--sidebar-width-collapsed`.
