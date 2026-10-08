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
