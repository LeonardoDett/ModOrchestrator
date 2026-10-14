# Architecture decisions

## D-001 — Semantic theme values replace hue/chroma generation

*Status: superseded by D-011 and D-012.*

The previous system derived a large palette from two inputs per role. That was useful for mathematical consistency but too indirect for intentional product design. A theme must be judged as a complete visual composition, so light/dark semantic values are now explicit.

## D-002 — 60/30/10 is a hierarchy contract

*Status: refined by D-014.*

The ratio is not a literal screen pixel quota. It constrains the default visual distribution of surfaces and emphasis. A feature can intentionally violate it for a focused action surface, but page chrome should remain neutral/structural.

## D-003 — Internal recipe runtime

The library no longer requires `tailwind-variants` or `clsx` at runtime. The compatibility subset used by current components lives under `src/core/recipe` and `src/core/styles/cn`.

## D-004 — Positioning remains external where appropriate

Menus/popovers continue to use Floating UI because anchored positioning is an interaction problem with many browser edge cases. It is isolated to components that need it.

## D-005 — Generic file/media patterns are allowed

File and media components are domain-neutral primitives. They exist because desktop tools, admin apps and content-heavy products repeatedly need the same behaviors.

## D-006 — Business semantics stay outside the UI package

The package does not know what a mod, conflict rule, deployment plan or plugin is. It provides tables, trees, lists, inspectors, reorderable lists, dialogs and navigation so products can express those concepts consistently.

## D-007 — DataTable owns interaction, not data

`DataTable` is the dense grid for large collections: declarative columns, resizable and hideable columns (`DataTableColumnPicker`), a filter row slot, explorer-style multi-selection (click, Ctrl/Cmd, Shift, keyboard), a focused-row cursor via `aria-activedescendant`, collapsible groups and virtualization above a threshold (TanStack Virtual, the approved dependency). It reports sort requests and never reorders or filters rows itself: products usually filter and sort in their backend, and a client-side engine would duplicate that logic. Selection and grouping rules are pure functions in `data-table.model.ts`, tested without rendering.

## D-008 — Tone contract lives in tokens.css

*Status: superseded by D-014 (tone replaced by intent/emphasis).*

Components paint toned surfaces with `bg-tone`, `text-on-tone`, `bg-tone-subtle`, `border-tone-border` and `text-tone-text`, and select the tone with `data-tone` (`theme/tone.ts`). The mapping from each tone to its semantic role is part of `src/theme/tokens.css`. It had been lost in the refactor, which left every toned component colorless. `npm run theme` now fails if a tone has no mapping.

## D-009 — Built-in texts are overridable

Components that ship text (Sidebar, LogViewer, Tag, Toast, DataTable, Command) accept it through props (`labels`, `searchLabel`, `removeLabel`, `closeLabel`, `placeholder`...). English defaults remain for convenience; localized products must pass their own.

## D-010 — Recipe variant typing

Recipe variant props are typed per key (`"true" | "false"` keys become `boolean`), with no index signature. The previous `Record<string, ...>` fallback leaked an index signature into every component's props and broke type checking (and `.d.ts` generation) across the library.

---

# v2 foundation (2026-10)

Source: `docs/specs/2026-10-06-v2-foundation-design.md`. The app stays on `dettmann-ui-v1` until subproject 4 (migration).

## D-011 — Engine from seeds, pure TypeScript

A theme is a `ThemeConfig` (brand seed plus personality knobs, `overrides` per role as escape hatch). A pure TS engine with its own OKLCH math and a contrast solver generates light and dark, shared by build (presets) and runtime (custom themes). Build-only generation and CSS relative colors were rejected: the first loses runtime themes, the second cannot guarantee contrast. `culori` left the dependencies.

## D-012 — Breaking v2, no alias layer

`--ui-brand`, `--ui-secondary`, `data-tone`, `tone`, `variant` on Button and the old utilities are gone. The `secondary` family was removed: structure (30%) comes from neutrals tinted by the brand. Migration is a mechanical substitution (see `migration.md`) done in subproject 4.

## D-013 — Personality defaults

Shape `balanced` (control 8, card 12, panel 16 px, concentric radius; between square Fluent 2 and round M3). Typography Plus Jakarta Sans + JetBrains Mono, embedded as woff2 (OFL), no `@fontsource`. Density `comfortable`, neutral `neutral`, vibrance 0.5, contrast `standard`.

## D-014 — Emphasis x intent contract

`emphasis` (low/medium/high = 60/30/10) says how loudly, `intent` says what it means. One table (`resolveEmphasis`) yields classes, motion level and `data-layer`; `emphasis="high"` without intent means `brand`. Structural components are born `medium`. Replaces D-008.

## D-015 — Budget guards are dev-only

`data-budget-region` warnings, `BudgetInspector` and the extended `theme:lint` enforce the 60/30/10 budget. The runtime parts are stripped in production. `isDev` must hold under Vite and Wails, not only under Node.

## D-016 — Motion follows emphasis, tuning is data

Default ceiling `expressive`; effective level = min(context, theme ceiling), exposed as `data-motion`. High is expressive, medium responsive, low calm (menu responsive, CTA expressive). All `MotionSpec` parameters are CSS variables tunable at theme, `MotionScope` and instance level. An explicit per-element emphasis beats region context: a CTA inside a calm `MotionScope` stays expressive. Springs are simulated and emitted as CSS `linear()`.

## D-017 — Reduced motion honors the app setting

Motion CSS and primitives respect both `prefers-reduced-motion` and `:root[data-reduce-motion="true"]` (Mod Orchestrator `ui.reduceMotion`). Displacement, bounce and scale degrade to fade with a short duration; state feedback stays.

## D-018 — Solver rulings

- Secondary text roles are solved from the background side (closest to the surface that meets the target); `fg` > `fg-muted` > `fg-subtle` with at least 0.06 OKLab lightness between steps. `structure-fg` equals `fg-muted`.
- Failing light-mode fills keep polarity (darken toward the light on-color); a passing seed is kept.
- Status collision search shifts hue +-40, L and C to keep deltaE-OK >= 0.08 from the brand and each other; base L clamped .45-.85 light, .65-.82 dark. Cost: very dark or light brands see statuses drift from the brand lightness.
- Every intent fill keeps deltaE-OK >= 0.08 versus canvas and surface. Hover/pressed reverse direction at the limit and differ by lightness >= 0.03 and WCAG ratio >= 1.12 (OKLab lightness alone is too generous near black), so monochrome brands keep feedback. Cost: a white brand renders as light gray.
- `contrastReport` reports a missing or unparseable role as a failure.

## D-019 — Calibration of the dark stack and warning

Dark stack lifted (canvas .19, sunken .165, structure .155, surface .225, raised .26; structure keeps deltaL >= .03 against canvas and surface); structure is intentionally darker than canvas. Warning has a chroma floor of .15, gamut-capped. Cost: near-black chrome and ochre warning would undercut the goal that themes "hit"; knobs remain for users.

## D-020 — Selector strategy

Root prefixes use zero-specificity `:where(:root)` and `:where(.dark, [data-ui-mode="dark"])`, so the default theme is overridable by any `data-theme`. `state-*` selectors re-resolve per scope; dark islands inside themed scopes and forced light (`ThemeScope mode="light"` inside `.dark`) have their own rules. Cost: about 20% more generated CSS.

## D-021 — ThemeScope and runtime semantics

`ThemeScope` always emits `data-theme` and `data-motion` (effective level = its `motion` clamped by the theme ceiling, else inherited from `MotionScope`, else `calm`) and re-emits a forced mode from ancestors. Portal overlays keep the scope and re-emit the `MotionScope` tune variables. `ThemeProvider` reads storage through `useSyncExternalStore` (correct first commit, SSR-safe). Every runtime path degrades to a no-op without `window`, layout, WAAPI or `localStorage`.

## D-022 — Config validation hardening

`id` must match `^[a-z0-9][a-z0-9_-]*$` and font names `^[\w .-]+$` (both are injected into CSS); uppercase ids and exotic font names are rejected with `ThemeConfigError`. Color parsing rejects non-finite numbers and CSS names with a descriptive error, never `NaN`. Motion specs map non-finite values to the lower bound; `motion.tune` is validated (throws in dev, clamps in prod). Production errors log once per message.

## D-023 — Tailwind scanning

`tokens.css` scans `src` and uses `@source not` for the lib's own `docs`, `skills` and `playground`; `source(none)` is not used because consumers rely on `tokens.css` auto-detecting their own sources. A safelist (`@source inline`) emits every role, intent, state and primitive utilities even without a consumer in `src`. Tailwind range `^4.1.0`.

## D-024 — Component adaptation

`Button` drops `variant`/`tone` for `emphasis`, `intent` and `motion`; `Badge` uses `emphasis` and `intent`; `Tag` only swaps `tone` for `intent` (no `emphasis`, no `variant`). Non-color transitions keep their property utility with `duration-(--motion-duration) ease-(--motion-ease)` instead of `motion-transition`. `theme:lint` scans only `components`, `templates` and `primitives` and ignores tests. The jsdom pointer-capture polyfill lives in the test setup.

## D-025 — Playground and skills

`npm run playground` (Vite, not published) edits every knob, shows light/dark side by side, ramps, measured contrast pairs, a representative screen, the `BudgetInspector`, the three motion levels and exports the config as code. Three skills replace the v1 `.cursor` ones: `dettmann-ui-use` (consumers), `dettmann-ui-author` (library work), `dettmann-ui-improve` (read-only audit). `npm run skills:install -- <target>` copies them to `.claude/skills` and `.cursor/skills`; the Mod Orchestrator versions the installed copies.

## D-026 — Input.Select becomes a custom select (MD3 behaviour)

Replaces the native `<select>` with a `button[role=combobox]` + anchored `listbox` (floating-ui, no new dependency), keeping the `Input.Select` API so migration is a drop-in. Behaviour follows Material Design 3 (anchored menu, scroll to selection, vertical-expand entrance, typeahead, keyboard model above); shape and colors follow the library tokens (balanced shape, `bg-selected` + check for the selection, state layers). Focus stays on the trigger (`aria-activedescendant`). The menu is positioned with `left/top` (`transform: false`) so the entrance `scaleY` cannot displace it. Search stays in `Input.Combobox`, multiple selection in `Input.MultiSelect`. Cost: tests using `selectOptions` must click the trigger and the option instead.

## D-027 — Own animated icons from Lucide, curated catalog

Glyph geometry is adapted from Lucide 0.468 (ISC; `src/icons/NOTICE` ships in the package) into a curated catalog of 63 icons, each split into named parts with a choreography (`defineIcon`). The catalog lives at the subpath `dettmann-ui/icons`; the root `dettmann-ui` exports only `defineIcon`, the icon types and `Loader`, so techniques and glyphs never bloat the barrel. `Icon` stays as the wrapper for Lucide glyphs outside the catalog. `defineIcon` validates in dev (the part name `root` is reserved, referenced parts must exist, a technique used in a mode it does not support throws); an invalid definition renders static in production.

## D-028 — Trigger inherited by a delegated controller

One `document`-level controller (reference counted, capture phase) plays the `action` of icons with `trigger="auto"` when the nearest interactive control receives hover (mouse/pen entering from outside), press or keyboard focus. Icons need no wiring and a `Button` at any level drives its own icon. While an `action` plays, automatic triggers are ignored; `playKey` always restarts it. While `loop` is active, `playKey` changes and automatic triggers do not play the action, and starting a loop cancels a running action. Focus plays only for keyboard focus: a `keydown` after the last `pointerdown` and `:focus-visible` on the focused element itself (the target, not the control, so `label > input` works). `data-icon-trigger` is the exit for custom controls.

## D-029 — Technique vocabulary, intensity from `amp`

Gestures are composed from a closed set of techniques (`squash`, `lift`, `nudge`, `rotate`, `spin`, `draw`, `undraw`, `flip`, `trail`, `pulse`, `stagger`) in `techniques.ts`, never keyframes per glyph. Magnitude = base value x `m.amp` (calm .45, responsive 1, expressive 1.6), so emphasis scales the gesture with no new token. Each technique reports its `extent`; the catalog test enforces, at `amp` 1.6, translate <= 3, rotate <= 30 deg (up to 180 for natural-rotation icons: refresh, undo, settings, sun, moon) and |scale - 1| <= .25; `spin` and `flip` are exempt. `nudge` defaults to x = 1.8 to fit the limit; glyph values were reduced to fit (trash lift -1.8, refresh 110 deg, undo -100 deg). The `Loader` `dots` amplitude (-3 x `amp`) is not a glyph and is not bound by the geometric limit.

## D-030 — `animateLoop`, two-phase gestures, reduced loops

`animateLoop(el, keyframes, { period, delay?, easing? })` runs infinite WAAPI loops; `period` is technique data, not scaled by the level (emphasis changes amplitude, not cadence). Under reduced motion the keyframes are replaced by an opacity pulse 1 -> .5 -> 1 over 2 s, so a continuous state stays perceptible. Calibration measured in Chromium: applying the level's spring as timing easing to a rest -> peak -> rest animation kept the peak for about 100 ms and extrapolated about 43% of the gesture to the opposite side. So out-and-back gestures run in two phases: out with `ease-out` over `0.45 x --motion-duration`, return with the level's spring through per-keyframe easing (`animate(..., { keyframeEasing: true })`, timing linear); total = out + spring duration. Stroke techniques (`draw`, `undraw`, `trail`) and all loops never use the spring (a dash offset cannot overshoot): loops use linear timing with per-keyframe `ease-in-out`. `LoopOptions.easing` is now only `"linear"`; the `"spring"` option was removed (breaking for callers of `animateLoop`).

## D-031 — `Loader` replaces `Spinner`

`Loader` (`arc`, `dots`, `pulse`, `bars`) is built on `animateLoop`, same viewBox and stroke as the icons, `role="status"` with a `label` prop (default `"Loading"`, D-009). `Spinner` is removed with no alias; narrative states (deploying, syncing) are the `loop` of an icon, not `Loader` variants, and need status text when they are the only indicator.

## D-032 — Atomic Design sets the dependency direction

Source: `docs/specs/2026-10-09-v2-components-design.md` (subproject 3). The library is organised by Atomic Design: atoms (primitives, `Button`, `Checkbox`, `Badge`, `Tag`...), molecules (`Input`, `SegmentedControl`, `Card`, `Menu`, `Modal`...), organisms (`DataTable`, `Tree`, `Command`...) and templates (`src/templates`). A component may import only components of its own level or below. `src/__tests__/atomic-levels.test.ts` holds the level of every folder (the test fails for an unclassified folder) and checks the imports; an upward import needs an explicit entry in `KNOWN_VIOLATIONS` with the wave that removes it. The redesign runs in waves that follow the same order.

## D-033 — Visual language: dense professional tool

Personality chosen by the author (references: Linear, Raycast): calm surfaces, color only on the primary action, short and precise micro-interactions. Rules, enforced per redesigned file by `src/__tests__/wave-contract.test.ts` (`WAVE_FILES` grows each wave):

- **Layers.** The canvas is `low`; structural parts declare `data-layer="medium"` on `bg-structure` (`SegmentedControl` joins the list).
- **Color.** Brand fill only at `emphasis="high"`. Selection is `bg-selected` plus a 2 px brand indicator, never a filled block. Components with their own color go through `resolveEmphasis`/`restingClassName`; `Tag` now does too and gains `emphasis?: "low" | "medium"` (amends D-024, which kept `Tag` out of the table). Known exception, to be folded into `emphasis.ts` in a later wave: the checked fill of `Checkbox`, `Switch`, `Radio` and of the `Select multiple` check box still writes `bg-intent-fill`/`text-on-intent` under `data-intent="brand"`.
- **Density.** Rows are `h-control-sm` (32 px at `comfortable`). `rowRecipe` (`src/core/styles/row.ts`) is the single source for a selectable row: height, state layer, selection indicator (`start`, `bottom` or `none`), inset focus ring, `multiline` for label plus description.
- **Elevation.** Separation by 1 px borders. Shadows only on overlays (`shadow-overlay`, `shadow-modal`): `Button`, `Input.Box`, `Kbd`, switch thumbs and `Radio` cards lost `shadow-raised`; a `medium` button is outlined by `border-border`.
- **Focus.** One ring, as utilities in `tokens.css`: `focus-ring` (2 px outline, 2 px offset), `focus-ring-inset` (inside, for rows, tabs and items that touch their container) and `focus-bare` (the field whose container shows the focus, e.g. `<input>` inside `Input.Box`). The ring is an `outline`, so it never competes with a shadow. `Input.Box` is the exception: it shows focus on the container with `border-focus` plus `ring-2 ring-focus`, because the focused element is the bare field inside it. Hand-written `outline-none`/`focus-visible:ring-*` is rejected.
- **Motion.** `motion-transition`, `motion-press`, `Presence`, `useFlip`, `animate()`. The only manual form accepted is `duration-(--motion-duration)` with `ease-(--motion-ease)` on a non-color property (D-024). `SegmentedControl` slides one indicator between segments with `useFlip`.
- **States.** Disabled is `bg-sunken` + `text-fg-subtle`, never opacity; a disabled checked control drops the brand fill (`enabled:data-[state=checked]:…`). `cn` does not resolve conflicting utilities, so a state that changes a color swaps the class instead of adding a second one (`Input.Box` border, `Input.Label` text, `StatusToggle` thumb). Radii come from the shape primitives (`rounded-full`/`rounded-lg` are rejected; round things use `rounded-pill`).

Found while applying the rules: `Checkbox` ignored `defaultChecked` and `Switch` never updated in uncontrolled mode; both now use `useControllableState`.

## D-034 — `Input.Select multiple` and `Input.Password`

`Input.Select` gains `multiple`: the `Input.Root` value becomes `string[]` in option order, choosing an option toggles it and keeps the menu open (`aria-multiselectable`, a check box per option), Esc/Tab close keeping the value, and typeahead never changes the value while closed. The trigger shows the selection as `Tag`s on one line that never wraps; what does not fit collapses into `+N` (`moreLabel` names it), or `selectedText(count)` replaces the tags with a summary. `maxSelected` disables the unchecked options at the limit. A string value from the Root counts as empty; values with no matching option stay hidden and are preserved at the end on change. Native forms get one hidden input per value. `Input.MultiSelect` (search with tags) stays for long lists. A second component was rejected: the menu, keyboard model and positioning are the same.

`Input.Password` is a masked field for any sensitive value (password, token, key) with an eye button (`EyeIcon`/`EyeOffIcon`, `aria-pressed`). `revealed`/`defaultRevealed`/`onRevealedChange`; `hideOnBlur` (default `true`) masks again when focus leaves both the field and the button; `revealable={false}` drops the button; `revealLabel`/`hideLabel` are overridable (D-009). The pointer click does not take focus from the field, the keyboard path returns it, and the caret is kept. Defaults: `autoComplete="current-password"`, `spellCheck={false}`, `autoCapitalize="off"`.

## D-035 — Wave 2: feedback and overlays

Applies D-033 to `Alert`, `Toast`, `Modal`, `Drawer`, `Menu`, `ContextMenu`, `Popover`, `Command`, `Progress`, `Stepper`, `Skeleton`, `Backdrop` and `Loader` (all in `WAVE_FILES`).

- **Status is never color alone.** `intentIcon(intent)` (`src/icons/intent-icon.ts`) is the single map from intent to glyph. `Alert.Root` and each toast show it by default; `Alert.Root icon={null}` removes it and `icon={node}` replaces it. Roles did not change (`role="alert"`).
- **Overlay motion is shared data.** `src/motion/overlay-keyframes.ts` holds `overlayEnter/Exit` (opacity plus a scale of `1 - 0.04 x amp`), `slideEnter/Exit(side)` (16 px x `amp`) and `fadeEnter/Exit`. `Presence` gains `onExited`.
- **Modal and Drawer animate both ways.** `Root` no longer returns `null` the moment `open` turns false: `useExitPresence` keeps the children mounted until the panel's exit ends (at once without WAAPI, or when there is no `Content`). Focus trap, scroll lock and Escape follow `open`, so they are released immediately; while leaving, the panel is `inert` with `data-state="closed"`, set on the node by an effect because `Presence` keeps rendering the last open child. `Backdrop` forwards its ref and lost the dead `animate-in/out` classes. Drawer edges use `rounded-{l,r,t,b}-panel`.
- **Menus enter, they do not exit.** `Menu`, `ContextMenu` and `Popover` animate the entrance only: `FloatingFocusManager` unmounts with the content and a closing menu should get out of the way. `Menu` and `Popover` position with `transform: false` so the entrance scale cannot displace them. Their panels use `shadow-overlay`; items are `rowRecipe` rows in a `flex flex-col gap-0.5` list.
- **`rowRecipe` tone.** `tone: "danger"` swaps the text color and the hover layer (destructive menu item). A disabled row no longer carries `pointer-events-none`: the consumer decides what the click does.
- **Command.** Options are `div[role=option]` rows addressed by `aria-activedescendant` (focus stays on the field); arrows, Home and End skip disabled items; with every item disabled nothing is active. `loading` plus `loadingLabel` replace the list with a `Loader`; the empty message is `role="status"`.
- **Skeleton** pulses through `animateLoop` (opacity, 1600 ms; the reduced loop under reduced motion) instead of `animate-pulse`. **Progress** animates its width with the motion tokens.

## D-036 — Wave 3: data components

Applies D-033 to `Table`, `DataTable` (and `DataTableColumnPicker`), `Tree`, `ReorderableList`, `Tabs`, `Accordion`, `Inspector`, `FilterBar`, `DiffViewer`, `LogViewer`, `MediaImage`, `Lightbox` and `FileDropzone` (all in `WAVE_FILES`). Behaviour (virtualization, selection, drag, keyboard, ARIA roles) is untouched; only height, state colors, focus and motion changed.

- **Density.** `DataTable` rows are 32 px (`comfortable`) and 28 px (`compact`), in px because the virtualizer needs the number; an explicit `rowHeight` still wins. Header cells are `h-8`/`h-7`. `Table` cells and heads are `h-control-sm px-3`; its header is `bg-structure` (it was `bg-selected`).
- **Row state is one variant.** `DataTable` rows resolve `state` to `idle`, `selected` (`bg-selected` plus the 2 px `bg-brand-fill` bar, replacing `emphasis-subtle`/`emphasis-fill`), `dragged` (`bg-sunken text-fg-subtle`, replacing `opacity-60`) or `group`, so no two backgrounds ever compete. `Tree` rows do the same and a disabled node is `text-fg-subtle`. A `<tr>` of `Table` gets only `bg-selected`: a pseudo-element bar on a table row is not reliable.
- **Reorder is animated.** `DataTable` data rows register with `useFlip([rowOrder])`: reordering, sorting and filtering slide the rows that stay visible; scrolling does not change the order, so it never animates. It works with virtualization because FLIP animates `translate` while the virtualizer positions with `transform`. `ReorderableList` does the same per item.
- **Disclosure.** The active `underline` tab carries a `border-brand-fill` indicator; the `segmented` one is `bg-selected` without shadow. `Tabs.Panel` and `Accordion.Content` animate their entrance with `Presence` and leave at once, so there are never two panels.
- **Structure.** `Inspector` header and `FilterBar` declare `data-layer="medium"` on `bg-structure`; `FilterBar` is a `data-budget-region`.
- **Texts (D-009).** `FilterBar` gains `filtersLabel`; `ReorderableList` gains `labels` (`dragHandle`, `moveUp`, `moveDown`). Both had hard-coded English.
- **Lucide exceptions.** `Columns3`, `GripVertical`, `Terminal` and `ImageOff` have no catalog glyph and are listed per file in `ALLOWED_LUCIDE`.

## D-037 — Wave 4: structure

Closes the redesign of what the Mod Orchestrator uses (`Card`, `Toolbar`, `ActionBar`, `Sidebar`, `EmptyState`, `FeaturedIcon` join `WAVE_FILES`).

- **`Card` takes `emphasis`, not `variant`** (breaking). `low` (default) is a flat bordered surface outside the structural layer; `medium` is `bg-structure` with `data-layer="medium"`. There is no `high`: the highlight comes from the action inside. `interactive` adds the pointer, the hover layer and the focus ring; `selected` swaps the rest classes for `bg-selected border-border-strong`. No shadow in any state. Slot paddings are dense (`px-4`).
- **Structure uses `bg-structure`.** `Toolbar` (it declared the layer on `bg-surface`), `ActionBar` (now declares `data-layer="medium"`) and `Sidebar` `strong`. `Sidebar` `subtle` is `bg-surface`. The current sidebar item is `bg-selected` with the brand bar (it used the `emphasis` roles), also when collapsed; items use `focus-ring-inset`.
- **The budget is chosen by the screen.** The library only declares layers; a screen moves area between `low` and `medium` with `Card emphasis` and by using the structural components. Measurements of the Mod Orchestrator are in its decision D111.

## D-038 — Screen redesign, batch 1: theme and shell

First batch of the Mod Orchestrator screen redesign (design v1; inventory in `docs/plans/2026-10-14-redesign-components.md`). `Avatar`, `Tooltip`, `AppShell`, `Navbar` and `Workspace` join `WAVE_FILES`.

- **Category palette.** 16 stable colors (`CATEGORY_COLORS`: blue, green, amber, coral, pink, violet, teal, gray, cyan, lime, orange, red, indigo, graphite, magenta, olive) generated by the engine (`engine/categories.ts`) as roles `category-<color>-{dot,subtle,text,border}` in light and dark. They carry no status meaning. `text` meets the `intent-text` target on its `subtle`, `surface` and `canvas` (part of `CONTRAST_PAIRS`); `dot` keeps deltaE-OK >= 0.1 from canvas and surface; neighbours alternate dot lightness (>= 0.05 apart), so the list never relies on hue alone. A node opts in with `data-category="<color>"`, which re-points the intent contract (`bg-intent-fill` = dot, `bg-intent-subtle`, `text-intent-text`, `border-intent-border`) and its state layer. Exclusive with a colored intent on the same node.
- **Seeded scope.** `withSeed(config, seed, id)` returns the same config with another brand seed (accent re-derived, overrides dropped); an invalid or missing seed returns the config untouched. Used with `ThemeScope` to give an area (a game's workspace) its own accent without a new engine path. Property test: arbitrary seeds pass every contrast target without warnings.
- **Button.** `badge` (decorative corner badge, `badgeIntent`, default neutral), `progress` (decorative ring, 0..100) and `tooltip`. The accessible name must carry what the badge or ring shows; an icon-only button without `aria-label`/`aria-labelledby` warns once in development.
- **Tooltip.** Enters with `fadeEnter` through `Presence`, `shadow-overlay`, `text-caption`; positions with `transform: false`; the trigger keeps the child's own ref (merged), so forwarded-ref components can be wrapped.
- **Indicator.** `variant="chip"`: icon, emphasized value and label as visible text in a bordered chip (page headers). The `icon` variant keeps `role="img"`.
- **Avatar.** `shape` (`circle` | `square`), sizes `2xs` and `3xl`, color by `intent` or `color` (category palette) with `emphasis` `low` (subtle) or `high` (solid), and `label` (named image, initials hidden). `rounded-full` and the group's `shadow-raised` are gone (pill and a canvas ring).
- **Alert.** `action`, `onDismiss` with `dismissLabel` (icon button, last in focus order) and `compact` (one line, centered).
- **Sidebar.** Item `count` (pill; overlay badge when collapsed), `countLabel` (read with the name and shown in the collapsed tooltip) and `attention` (warning intent row, filled pill); collapsed items get a tooltip and an `aria-label` with the count; `footer` may be a function of `{ collapsed }` and sits in its own slot; `heading` shows next to the collapse button. Widths come from `--sidebar-width` (default 14.5rem) and `--sidebar-width-collapsed` (default 3.75rem), the design values; they were 16rem and 4rem.
- **AppShell.** `layout="topbar"`: the bar spans the window, the sidebar sits below it and only the content scrolls (desktop app). The wrapper no longer declares `data-layer` (the Sidebar and the Navbar do, D-037).
- **Navbar.** `bg-structure` with `border-border` (was `bg-selected`), `size` `compact` (48 px) or `regular` (64 px, default) and a `windowControls` slot flush right. `UserMenu` takes `label`.
- **Workspace.** Formatted; declares the structure layer on its column, default width 232 px, content scrolls inside.

## D-039 — Screen redesign, batch 2: content

Second batch of the Mod Orchestrator screen redesign (inventory in `docs/plans/2026-10-14-redesign-components.md`). `FilterChip`, `StatTile`, `SwatchPicker`, `SettingRow`, `Section` and `List` join `WAVE_FILES`.

- **New atom `FilterChip`** (and `FilterChip.Group`, `single` | `multiple`): toggle chip with `aria-pressed`, optional `count` (zero is dimmed but focusable) and `color` dot from the category palette; pressed changes border and fill, not color alone; arrows move focus in a group. Different from `SegmentedControl`: several choices, wraps.
- **New molecule `StatTile`** (and `StatTile.Grid`): label, pre-formatted value, unit, description, icon and intent; with `href` or `onClick` the whole tile is the link or button; `loading` swaps the value for a skeleton.
- **New molecule `SwatchPicker`**: grid radio group of small swatches; the consumer draws each one (`renderSwatch`), so it serves colors and icons. One tab stop, arrows in two dimensions skipping disabled options, Home/End, Space/Enter. Checked = 2 px `border-fg` plus `bg-selected` (shape, not color).
- **New molecule `SettingRow`**: label and description left, `status` and `control` right; `controlId` turns the label into `<label for>`; the row is a named group described by its description. It never saves.
- **`Tag`** takes `color` (category palette; exclusive with `intent`) and `icon`.
- **`Progress.Stacked`**: labelled proportion bar, one `img` whose name lists every part; parts take a category color or follow the palette order; optional legend.
- **`Checkbox variant="card"`** with `description` and `action` (outside the control), like `Radio`'s card.
- **`Section`** left the 1.3 backlog: `density` (`spacious` | `compact`), `Section.Header actions`, the title is an `h2` sized by density (no `Typography` heading).
- **`List`** left the 1.3 backlog: `selectionMode="none"` renders a static `list`/`listitem` without a tab stop; selectable rows use `rowRecipe` (the hand-written ring and the emphasis-filled selection are gone); `List.Item` takes slots (`start`, `title`, `description`, `meta`, `actions`, `unread`; actions only in static lists, an option never holds controls); `List.Group` titles and optionally collapses a run of rows.

## D-040 — Screen redesign: fidelity to the boards

Status: accepted (2026-10-14).

The approved boards are the specification of each screen. What a board needs and the library did not have goes into the library:

- `DataTable density="relaxed"`: rows of 54 px for two lines (a name and its tags underneath) and group headers of 42 px.
- `ResourcePage layout="workspace"`: a desktop screen that fills the area, with one 76 px header line (title, `meta` chips, actions with a divider before the primary one) and 28 px side margins. `meta` also works in the default layout.
- `Switch size="xs"` (30×18) for dense rows.
- `Tag size="xs"` (18 px, no outline) and `dot` (the palette color before the text) for user tags under a name.
- `Tag shape="rounded"` (category chip) and `outline={false}`; `TagAdd`, the dashed "+ tag" pill.
- `Modal`: header and footer are structure bands; `Modal.Content size="custom"` takes the board's width and height (up to 95 % of the window); `Modal.Header layout="stacked"` (rows 16 px apart, tabs on the bottom line); `Modal.Footer size="sm"` (48 px status line); `Modal.Title size="lg"` (20 px).
- `Tabs size="sm"`: 38 px tabs of 13 px that sit on the line of a header band.
- `StatTile size="lg"` (icon in a tinted 24 px square, 28 px number) and `outlined` (border in the intent color).
- `Table density="relaxed"`: 48 px rows, 36 px header, 16 px cell padding.
- `Tree variant="rows"`: edge-to-edge 34 px rows with a line between them, for a tree with columns under a header.
- `SwatchPicker size` (`square`, `sm`, `md`) and `tint` (`"self"` or a palette color).
- Wizard boards: `Modal.Header layout="bar"` (76 px), `Modal.Footer size="lg"` (64 px), `Modal.Body padding="none"`, `Alert band` (edge-to-edge strip under a header), `Radio.Item`/`Checkbox variant="row"` (44 px bordered option rows with an `action` end), `Stepper variant="list"` (step rows without connectors, done steps with a green check), `StatTile layout="inline"`.

Tests: `src/__tests__/fidelity-props.test.tsx`.
