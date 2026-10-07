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

`Button` drops `variant`/`tone` for `emphasis`, `intent` and `motion`; `Badge`/`Tag` use `emphasis` and `intent`. Non-color transitions keep their property utility with `duration-(--motion-duration) ease-(--motion-ease)` instead of `motion-transition`. `theme:lint` scans only `components`, `templates` and `primitives` and ignores tests. The jsdom pointer-capture polyfill lives in the test setup.

## D-025 — Playground and skills

`npm run playground` (Vite, not published) edits every knob, shows light/dark side by side, ramps, measured contrast pairs, a representative screen, the `BudgetInspector`, the three motion levels and exports the config as code. Three skills replace the v1 `.cursor` ones: `dettmann-ui-use` (consumers), `dettmann-ui-author` (library work), `dettmann-ui-improve` (read-only audit). `npm run skills:install -- <target>` copies them to `.claude/skills` and `.cursor/skills`; the Mod Orchestrator versions the installed copies.
