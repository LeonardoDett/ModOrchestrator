# dettmann-ui v2 — Fundação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o sistema de temas hand-authored da dettmann-ui por um motor `createTheme()` gerado em OKLCH com contraste garantido, um contrato `emphasis × intent` que impõe o 60/30/10, primitivas de forma/densidade/tipo/elevação/movimento e três skills de agente.

**Architecture:** Um motor TypeScript puro (`src/theme/engine/`) transforma `ThemeConfig` em mapas de tokens light/dark; o mesmo código roda no build (presets → CSS estático) e em runtime (configs customizadas injetadas em `<style>`). Componentes consomem apenas papéis L3 via utilitários Tailwind v4 e a tabela central `resolveEmphasis`. Movimento é CSS-first (springs convertidas em `linear()`, níveis via `data-motion`), com primitivas JS finas sobre WAAPI.

**Tech Stack:** TypeScript 5.7 strict, React ≥18, Tailwind CSS v4, Vitest 4 + jsdom + Testing Library, tsup, tsx, Vite (playground).

**Spec:** `dettmann-ui-vnext/docs/specs/2026-10-06-v2-foundation-design.md`

## Global Constraints

- Diretório de trabalho: `dettmann-ui-vnext/` (comandos `npm` rodam nele, salvo indicação).
- Nenhuma nova dependência de runtime. `dependencies` permanece `@floating-ui/react`, `@tanstack/react-virtual`, `date-fns`, `lucide-react`. `culori` sai das devDependencies.
- Matemática de cor própria; saída de cor sempre em hex `#rrggbb` minúsculo, dentro do gamut sRGB.
- Prefixo de variáveis CSS do sistema: `--ui-*`. Mapas de tokens usam chaves sem o prefixo.
- Ruptura livre (v2): sem aliases para nomes antigos.
- Defaults: `neutral: "neutral"`, `vibrance: 0.5`, `contrast: "standard"`, `shape: "balanced"`, `density: "comfortable"`, `motion: { ceiling: "expressive" }`, `font: { sans: "Plus Jakarta Sans", mono: "JetBrains Mono" }`.
- `emphasis="high"` sem `intent` explícito → `intent="brand"`.
- Alvo de runtime: Chromium (WebView2 do Wails) — `oklch()`, `color-mix()` e `linear()` disponíveis.
- Commits direto no `master`, mensagem em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Validação ao fim de cada task: `npm run typecheck` e `npm test -- --run` verdes.

## Review Focus

1. **Redução de movimento do app** — o Mod Orchestrator usa `:root[data-reduce-motion="true"]` (setting `ui.reduceMotion`) além da media query; primitivas e CSS de movimento devem respeitar os dois. Teste na Task 9 e no CSS da Task 5.
2. **Formatos de cor variados na semente** — `rgb()`, `hsl()`, `oklch()`, `#abc`, `#aabbccdd`, espaços extras, maiúsculas; nomes CSS (`"teal"`) não são suportados e devem gerar erro descritivo, não `NaN`. Testes nas Tasks 1 e 7.
3. **Marca acromática** (cinza, preto, branco) — matiz indefinido não pode virar `NaN` no CSS; o tema deve sair válido e com contraste. Teste na Task 3.
4. **Troca repetida de tema em runtime e múltiplos `ThemeScope` com configs diferentes** — `<style>` injetado deve ser substituído (não acumulado) e um escopo não pode vazar para outro. Teste na Task 7.
5. **Ambientes sem layout/WAAPI/`window`** (SSR, jsdom, `localStorage` bloqueado, id de tema salvo que não existe mais) — no-op ou fallback, nunca exceção. Testes nas Tasks 7 e 9.

---

## Mapa de arquivos

```
dettmann-ui-v1/                         cópia congelada da lib atual (Task 0)
dettmann-ui-vnext/
  src/theme/engine/
    types.ts                            tipos públicos do motor
    config.ts                           normalizeConfig, ThemeConfigError
    color/convert.ts                    parse + OKLCH <-> sRGB + gamut + hex
    color/contrast.ts                   WCAG, APCA, deltaE OK
    solve.ts                            solveLightness
    palette.ts                          sementes -> cores-base por modo
    roles.ts                            papéis L3 + contrastReport
    motion.ts                           springToLinear, MOTION_DEFAULTS, resolveMotionSpecs, motionVars
    primitives.ts                       forma, densidade, tipo, elevação
    create-theme.ts                     createTheme
    css.ts                              toCSS
    index.ts
  src/theme/presets/{forest,graphite,orchestrator,ember,ink,index}.ts
  src/theme/{theme-provider.tsx,theme-scope.tsx,theme-context.ts,use-theme.ts,get-theme-script.ts,inject.ts,index.ts}
  src/theme/emphasis.ts                 resolveEmphasis, intentData
  src/theme/tokens.css                  ponte Tailwind (@theme inline, intents, data-motion, utilities)
  src/styles/theme/foundations.css      tokens estáticos (densidade, reduced motion)
  src/styles/theme/themes.generated.css gerado pela Task 5 (commitado)
  src/styles/fonts/                     woff2 + fonts.css + licenças
  src/motion/{motion-scope.tsx,use-motion.ts,animate.ts,presence.tsx,use-flip.ts,read-motion.ts,index.ts}
  src/dev/{env.ts,budget.ts,budget-inspector.tsx,index.ts}
  scripts/theme/{generate.ts,lint.mjs}
  scripts/skills/install.mjs
  skills/{dettmann-ui-use,dettmann-ui-author,dettmann-ui-improve}/SKILL.md
  playground/{index.html,vite.config.ts,main.tsx,app.tsx,app.test.tsx,panels/*.tsx}
removidos: src/styles/theme/themes.css, src/theme/{theme-inputs.ts,tone.ts,theme-definitions.ts,presets.ts},
           scripts/theme/{seed.mjs,build.mjs,check.mjs,generate.mjs}, .cursor/skills/dettmann-ui/
```

---

### Task 0: Congelar a lib atual para o app

**Files:**
- Create: `../dettmann-ui-v1/` (cópia dos arquivos versionados de `dettmann-ui-vnext/`)
- Modify: `../frontend/package.json` (dependência `dettmann-ui`)

**Interfaces:**
- Produces: `frontend/` compila contra `dettmann-ui-v1`, liberando `dettmann-ui-vnext` para ruptura.

- [ ] **Step 1:** Na raiz do repo, exportar os arquivos versionados: `git archive HEAD dettmann-ui-vnext | tar -x -C <scratch>` e mover `<scratch>/dettmann-ui-vnext` para `dettmann-ui-v1/`. Remover `dettmann-ui-v1/docs/specs` e `dettmann-ui-v1/docs/plans`.
- [ ] **Step 2:** Em `frontend/package.json`, trocar `"dettmann-ui": "file:../dettmann-ui-vnext"` por `"file:../dettmann-ui-v1"`.
- [ ] **Step 3:** Rodar `npm --prefix dettmann-ui-v1 install && npm --prefix dettmann-ui-v1 run build && npm --prefix frontend install`.
  Expected: build sem erro; `frontend/node_modules/dettmann-ui` aponta para `dettmann-ui-v1`.
- [ ] **Step 4:** Rodar `npm --prefix frontend run typecheck && npm --prefix frontend test`.
  Expected: PASS (mesmo resultado de antes da troca).
- [ ] **Step 5:** Confirmar que `dettmann-ui-v1/.gitignore` (ou o da raiz) ignora `node_modules` e `dist`; commit:
```bash
git add dettmann-ui-v1 frontend/package.json frontend/package-lock.json
git commit -m "chore: congela dettmann-ui v1 para o app durante a reformulação v2"
```

---

### Task 1: Matemática de cor (conversão, gamut, contraste)

**Files:**
- Create: `src/theme/engine/types.ts`, `src/theme/engine/color/convert.ts`, `src/theme/engine/color/contrast.ts`
- Test: `src/theme/engine/color/convert.test.ts`, `src/theme/engine/color/contrast.test.ts`
- Modify: `package.json` (remover `culori` de devDependencies)

**Interfaces:**
- Produces:
  - `interface Oklch { l: number; c: number; h: number }` (l 0..1; c ≥ 0; h 0..360, `0` quando acromático) — em `types.ts`
  - `parseColor(input: string): Oklch | null`
  - `oklchToRgb(c: Oklch): [number, number, number]` (0..1, não clampado)
  - `inGamut(c: Oklch): boolean` (tolerância 1e-4)
  - `clampChroma(c: Oklch): Oklch` (bissecção na croma, mantém l e h)
  - `toHex(c: Oklch): string` (aplica `clampChroma`, `#rrggbb` minúsculo)
  - `wcagContrast(a: Oklch, b: Oklch): number`
  - `apcaContrast(text: Oklch, bg: Oklch): number` (|Lc|, APCA 0.0.98G-4g)
  - `deltaEOK(a: Oklch, b: Oklch): number` (distância euclidiana em OKLab)

- [ ] **Step 1: Testes que falham**

```ts
// convert.test.ts
test("round-trips sRGB primaries through OKLCH", () => {
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#16824f"])
    expect(toHex(parseColor(hex)!)).toBe(hex);
});
test("matches reference OKLCH for #ff0000", () => {
  const c = parseColor("#ff0000")!;
  expect(c.l).toBeCloseTo(0.628, 3); expect(c.c).toBeCloseTo(0.2577, 3); expect(c.h).toBeCloseTo(29.23, 1);
});
test.each(["#abc", "#AABBCC", "#aabbccdd", " rgb(22 130 79) ", "rgba(22,130,79,0.5)", "hsl(152 71% 30%)", "oklch(0.52 0.12 155)"])(
  "parses %s", (input) => expect(parseColor(input)).not.toBeNull());
test.each(["teal", "", "#ggg", "rgb(1,2)"])("rejects %s", (input) => expect(parseColor(input)).toBeNull());
test("achromatic colors have c=0 and h=0", () => {
  const g = parseColor("#808080")!; expect(g.c).toBeLessThan(1e-4); expect(g.h).toBe(0);
});
test("clampChroma brings out-of-gamut colors into sRGB keeping hue", () => {
  const out = clampChroma({ l: 0.7, c: 0.4, h: 150 });
  expect(inGamut(out)).toBe(true); expect(out.h).toBe(150); expect(out.l).toBe(0.7);
});
// contrast.test.ts
test("WCAG black/white is 21", () => expect(wcagContrast(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21, 1));
test("WCAG is symmetric", () => { const a = parseColor("#16824f")!, b = parseColor("#ffffff")!; expect(wcagContrast(a, b)).toBeCloseTo(wcagContrast(b, a), 6); });
test("APCA black on white ≈ 106", () => expect(apcaContrast(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(106.04, 0));
test("APCA #888 on #fff ≈ 63", () => expect(apcaContrast(parseColor("#888")!, parseColor("#fff")!)).toBeCloseTo(63.06, 0));
test("deltaEOK is 0 for identical and >0 for different", () => { /* ... */ });
```

- [ ] **Step 2:** `npx vitest run src/theme/engine/color` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar em `convert.ts` (matrizes de Björn Ottosson para sRGB linear ↔ LMS ↔ OKLab; `hsl()` via conversão HSL→sRGB padrão; alpha é ignorado) e `contrast.ts` (luminância relativa WCAG 2.x; APCA com constantes 0.0.98G-4g: `normBG 0.56, normTXT 0.57, revTXT 0.62, revBG 0.65, blkThrs 0.022, blkClmp 1.414, scale 1.14, loClip 0.1, deltaYmin 0.0005`).
- [ ] **Step 4:** `npx vitest run src/theme/engine/color` → PASS. Remover `culori` do `package.json` e rodar `npm install`.
- [ ] **Step 5:** Commit `feat(theme): matemática de cor OKLCH, gamut e contraste próprios`.

---

### Task 2: Molas → `linear()` e especificações de movimento

**Files:**
- Create: `src/theme/engine/motion.ts`
- Modify: `src/theme/engine/types.ts`
- Test: `src/theme/engine/motion.test.ts`

**Interfaces:**
- Produces (em `types.ts`): `type MotionLevel = "calm" | "responsive" | "expressive"`; `interface MotionSpec { stiffness: number; damping: number; mass: number; duration: number; amplitude: number; pressScale: number; stagger: number }`; `type MotionTune = Partial<Record<MotionLevel, Partial<MotionSpec>>>`.
- Produces (em `motion.ts`):
  - `MOTION_LEVELS: readonly MotionLevel[]` = `["calm","responsive","expressive"]` (ordem = intensidade)
  - `MOTION_DEFAULTS: Record<MotionLevel, MotionSpec>`
  - `springToLinear(spring: Pick<MotionSpec,"stiffness"|"damping"|"mass">, opts?: { maxPoints?: number; tolerance?: number }): { easing: string; duration: number; overshoot: number }`
  - `validateMotionSpec(partial: Partial<MotionSpec>, mode: "dev" | "prod"): Partial<MotionSpec>`
  - `resolveMotionSpecs(ceiling: MotionLevel, tune?: MotionTune): Record<MotionLevel, MotionSpec>`
  - `motionVars(specs: Record<MotionLevel, MotionSpec>): Record<string, string>` — chaves `motion-{level}-{ease|spring-duration|duration|amp|press|stagger}`

Valores de `MOTION_DEFAULTS`:

| | stiffness | damping | mass | duration | amplitude | pressScale | stagger |
|---|---|---|---|---|---|---|---|
| calm | 400 | 40 | 1 | 160 | 0.45 | 0.985 | 20 |
| responsive | 300 | 22 | 1 | 280 | 1 | 0.96 | 35 |
| expressive | 260 | 14 | 1 | 420 | 1.6 | 0.92 | 50 |

- [ ] **Step 1: Testes que falham**

```ts
test("spring easing starts at 0 and ends at 1", () => {
  const { easing } = springToLinear(MOTION_DEFAULTS.expressive);
  expect(easing).toMatch(/^linear\(0(,|\s)/); expect(easing).toMatch(/1\)$/);
});
test("critically damped calm spring has no overshoot", () =>
  expect(springToLinear(MOTION_DEFAULTS.calm).overshoot).toBeLessThan(0.005));
test("overshoot grows as damping drops", () => {
  const r = springToLinear(MOTION_DEFAULTS.responsive).overshoot, e = springToLinear(MOTION_DEFAULTS.expressive).overshoot;
  expect(r).toBeGreaterThan(0.03); expect(e).toBeGreaterThan(r); expect(e).toBeLessThan(0.35);
});
test("point count is bounded", () =>
  expect(springToLinear(MOTION_DEFAULTS.expressive, { maxPoints: 40 }).easing.split(",").length).toBeLessThanOrEqual(40));
test("duration is time to rest within tolerance, in ms", () => {
  const d = springToLinear(MOTION_DEFAULTS.expressive).duration; expect(d).toBeGreaterThan(300); expect(d).toBeLessThan(2000);
});
test("ceiling clamps levels above it to the ceiling spec", () => {
  const s = resolveMotionSpecs("responsive"); expect(s.expressive).toEqual(s.responsive);
});
test("tune merges per level and keeps the rest", () => {
  const s = resolveMotionSpecs("expressive", { expressive: { damping: 10 } });
  expect(s.expressive.damping).toBe(10); expect(s.expressive.stiffness).toBe(260);
});
test("invalid spec throws in dev and clamps in prod", () => {
  expect(() => validateMotionSpec({ damping: 0 }, "dev")).toThrow(/damping/);
  expect(validateMotionSpec({ damping: -1, pressScale: 2 }, "prod")).toEqual({ damping: 1, pressScale: 1 });
});
test("motionVars emits ms and unitless values", () => {
  const v = motionVars(resolveMotionSpecs("expressive"));
  expect(v["motion-calm-duration"]).toBe("160ms"); expect(v["motion-expressive-amp"]).toBe("1.6");
  expect(v["motion-expressive-ease"]).toMatch(/^linear\(/); expect(v["motion-expressive-spring-duration"]).toMatch(/ms$/);
});
```

- [ ] **Step 2:** `npx vitest run src/theme/engine/motion.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Simulação: integração semi-implícita de Euler com passo 1/600 s de `x'' = (-k(x-1) - d·x')/m` a partir de `x=0, v=0`; repouso quando `|x-1| < tolerance (padrão 0.001)` e `|v| < tolerance` por 50 ms consecutivos. Amostrar em 120 pontos uniformes e simplificar com Ramer–Douglas–Peucker (épsilon crescente até caber em `maxPoints`, padrão 48). Valores formatados com 4 casas, sem posições explícitas quando uniformes não são preservadas (usar `valor pos%`). Limites de clamp em prod: `stiffness ≥ 1`, `damping ≥ 1`, `mass ≥ 0.1`, `duration ≥ 0`, `amplitude ≥ 0`, `pressScale` em `[0.8, 1]`, `stagger ≥ 0`.
- [ ] **Step 4:** Rodar os testes → PASS.
- [ ] **Step 5:** Commit `feat(theme): springs convertidas em linear() e especificações de movimento`.

---

### Task 3: Paleta e papéis com contraste garantido

**Files:**
- Create: `src/theme/engine/config.ts`, `src/theme/engine/solve.ts`, `src/theme/engine/palette.ts`, `src/theme/engine/roles.ts`
- Modify: `src/theme/engine/types.ts`
- Test: `src/theme/engine/roles.test.ts`, `src/theme/engine/config.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parseColor`, `toHex`, `clampChroma`, `wcagContrast`, `apcaContrast`, `deltaEOK`), Task 2 (`MotionLevel`, `MotionTune`).
- Produces (em `types.ts`):
  - `type Mode = "light" | "dark"`; `type Intent = "neutral"|"brand"|"accent"|"info"|"success"|"warning"|"danger"`; `type Emphasis = "low"|"medium"|"high"`
  - `type ColorIntent = Exclude<Intent, "neutral">`
  - `type RoleName` — união literal de todos os papéis abaixo
  - `type RoleOverrides = Partial<Record<RoleName, string>>`
  - `interface ThemeConfig` exatamente como na seção 4.1 do spec
  - `interface NormalizedConfig` — `ThemeConfig` com todos os defaults preenchidos, `brand`/`accent` já como `Oklch`, `motion` como `{ ceiling: MotionLevel; tune: MotionTune }`
- Produces (funções):
  - `class ThemeConfigError extends Error`; `normalizeConfig(config: ThemeConfig): NormalizedConfig` (lança `ThemeConfigError` com o campo e o valor recebido)
  - `solveLightness(color: Oklch, against: Oklch[], target: number, direction: "darker"|"lighter", metric?: (fg: Oklch, bg: Oklch) => number): { color: Oklch; met: boolean }`
  - `buildRoles(config: NormalizedConfig, mode: Mode): { roles: Record<RoleName, string>; warnings: string[] }`
  - `CONTRAST_PAIRS: readonly ContrastPair[]` com `interface ContrastPair { fg: RoleName; bg: RoleName[]; kind: ContrastKind }` e `type ContrastKind = "text" | "text-secondary" | "text-meta" | "on-fill" | "intent-text" | "control-border" | "focus"`
  - `CONTRAST_TARGETS: Record<"standard"|"high", Record<ContrastKind, { wcag: number; apca?: number }>>`
  - `contrastReport(roles: Record<string, string>, contrast: "standard"|"high"): ContrastResult[]` com `interface ContrastResult { fg: RoleName; bg: RoleName; kind: ContrastKind; ratio: number; target: number; pass: boolean }`

**Papéis (`RoleName`):**
- low: `canvas surface raised sunken fg fg-muted fg-subtle fg-disabled border border-subtle border-strong`
- medium: `structure structure-fg structure-border selected track fill-neutral fill-neutral-hover`
- high: `emphasis-fill emphasis-fill-hover emphasis-fill-pressed on-emphasis emphasis-subtle emphasis-text emphasis-border focus`
- por `ColorIntent` X: `X-fill X-fill-hover X-fill-pressed on-X X-subtle X-text X-border`
- outros: `overlay` (cor com alpha, formato `rgb(r g b / a)`)

**Metas** (spec 4.3, mais as decisões deste plano para papéis que o spec não lista):

| kind | pares | standard | high |
|---|---|---|---|
| text | `fg` / canvas, surface, raised, sunken, structure | 7 | 7 + APCA 90 |
| text-secondary | `fg-muted`, `structure-fg` / mesmas superfícies | 4.5 | 7 |
| text-meta | `fg-subtle` / canvas, surface | 3 | 4.5 |
| on-fill | `on-X` / `X-fill`, `X-fill-hover`; `on-emphasis` / `emphasis-fill*` | 4.5 | 7 |
| intent-text | `X-text` / `X-subtle`, surface, canvas | 4.5 | 7 |
| control-border | `border-strong` / surface, canvas | 3 | 4.5 |
| focus | `focus` / canvas, surface | 3 | 4.5 |

**Algoritmo** (valores iniciais; o comportamento é fixado pelos testes de propriedade, os números podem ser recalibrados no playground):
- Neutral: matiz = matiz da marca; `cool` interpola o matiz 50% em direção a 250°, `warm` 50% em direção a 70° (interpolação circular). Croma: `neutral` 0.006, `cool`/`warm` 0.012, multiplicada por `0.5 + vibrance`, máximo 0.03. Marca acromática → croma do neutral 0.
- Superfícies (L): light `canvas .975 · surface .995 · raised .995 · sunken .955 · structure .95`; dark `canvas .17 · surface .205 · raised .24 · sunken .145 · structure .19`. `structure` recebe croma extra `0.02 × vibrance` no matiz da marca.
- `fg` parte de L .22 (light) / .95 (dark); `fg-muted`, `structure-fg`, `fg-subtle` partem de L .45/.75 e são resolvidos com `solveLightness` contra **todas** as superfícies do par. `fg-disabled`: L .7/.45, sem meta.
- `border-subtle`, `border`: ΔL de .05/.09 em relação a `surface` (sinal conforme modo), sem meta. `border-strong`: resolvido com meta.
- Fill de intent: light — usa a cor-semente como está se `on` (quase-branco L .99 ou quase-preto L .18, tingidos com croma .01 no matiz) atinge a meta; senão escurece com `solveLightness`. Dark — L clampado em [.65, .82] e `on` quase-preto. `on-X` é o que der maior contraste. `fill-hover`/`fill-pressed`: ΔL −.05/−.09 (light) e +.05/+.09 (dark).
- `X-subtle`: L .96 (light) / .27 (dark), croma `min(C_semente × .25, .05) × (0.5 + vibrance)`. `X-text`: parte do L do fill e é resolvido contra subtle + superfícies. `X-border`: L .82/.45, croma `C × .5`.
- Status: matizes `info 250 · success 150 · warning 80 · danger 27`; croma = `clamp(C_marca, .06, .19)`; L inicial = L da marca, com piso `warning` ≥ .72 no light. Se `deltaEOK(brand-fill, status-fill) < 0.08`, girar o matiz do status para longe da marca em passos de 10° até ±40°; se ainda falhar, manter o melhor e registrar em `warnings`.
- `accent` ausente → semente derivada com matiz da marca + 150°, mesma L e C.
- `emphasis-*` = cópia dos papéis `brand-*`. `focus`: matiz da marca, resolvido com meta. `selected`: matiz da marca, L do subtle, croma do subtle × `(0.3 + 0.7 × vibrance)`. `track`: L .88/.32 neutral. `fill-neutral`: L .93/.28 neutral; `-hover` ΔL ∓.03.
- `overlay`: neutral L .12, alpha .48 (light) / .62 (dark).
- `contrast: "high"` só troca as metas.
- Saída: `toHex` em tudo, exceto `overlay`.

- [ ] **Step 1: Testes que falham**

```ts
// roles.test.ts — gerador determinístico (mulberry32, seed 42)
const seeds = Array.from({ length: 300 }, (_, i) => randomBrand(i)); // hex aleatórios
const edge = ["#ffff00", "#0a0a0a", "#fafafa", "#808080", "#000000", "#ffffff", "#16a34a", "#dc2626", "#2563eb", "#f59e0b"];
test.each([...edge, ...seeds])("all contrast targets pass for %s in both modes and contrasts", (brand) => {
  for (const contrast of ["standard", "high"] as const) for (const mode of ["light", "dark"] as const) {
    const { roles } = buildRoles(normalizeConfig({ id: "t", label: "t", brand, contrast }), mode);
    const failing = contrastReport(roles, contrast).filter((r) => !r.pass);
    expect(failing).toEqual([]);
  }
});
test("every role is a valid in-gamut hex (overlay excepted) and never NaN", () => { /* itera RoleName, regex /^#[0-9a-f]{6}$/ */ });
test("light brand is kept as-is when it already passes", () => {
  const { roles } = buildRoles(normalizeConfig({ id: "t", label: "t", brand: "#16824f" }), "light");
  expect(roles["brand-fill"]).toBe("#16824f");
});
test("status hue moves away from a same-hue brand", () => {
  const cfg = normalizeConfig({ id: "t", label: "t", brand: "#16a34a" });
  const { roles } = buildRoles(cfg, "light");
  expect(deltaEOK(parseColor(roles["brand-fill"])!, parseColor(roles["success-fill"])!)).toBeGreaterThanOrEqual(0.08);
});
test("vibrance 0 keeps structure closer to neutral than vibrance 1", () => { /* croma de structure aumenta */ });
test("neutral temperature shifts neutral hue", () => { /* cool → hue de canvas mais perto de 250 que warm */ });
// config.test.ts
test("fills defaults", () => expect(normalizeConfig({ id: "x", label: "X", brand: "#123456" })).toMatchObject({ vibrance: 0.5, shape: "balanced", density: "comfortable", motion: { ceiling: "expressive" } }));
test("motion shorthand string becomes ceiling", () => expect(normalizeConfig({ id: "x", label: "X", brand: "#123456", motion: "calm" }).motion.ceiling).toBe("calm"));
test("invalid brand throws a descriptive error", () => expect(() => normalizeConfig({ id: "x", label: "X", brand: "teal" })).toThrow(/brand.*"teal"/));
test("vibrance outside 0..1 throws", () => expect(() => normalizeConfig({ id: "x", label: "X", brand: "#123456", vibrance: 2 })).toThrow(/vibrance/));
```

- [ ] **Step 2:** `npx vitest run src/theme/engine` → FAIL.
- [ ] **Step 3:** Implementar `config.ts`, `solve.ts` (bissecção em L, 24 iterações, `met=false` se nem o extremo atinge), `palette.ts` e `roles.ts` conforme o algoritmo acima.
- [ ] **Step 4:** Rodar → PASS. Se algum caso aleatório falhar, corrigir o algoritmo, não o teste.
- [ ] **Step 5:** Commit `feat(theme): paleta OKLCH e papéis L3 com solver de contraste`.

---

### Task 4: Primitivas, `createTheme` e `toCSS`

**Files:**
- Create: `src/theme/engine/primitives.ts`, `src/theme/engine/create-theme.ts`, `src/theme/engine/css.ts`, `src/theme/engine/index.ts`
- Test: `src/theme/engine/create-theme.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `buildPrimitives(config: NormalizedConfig, mode: Mode): Record<string, string>`
  - `interface ResolvedTheme { id: string; label: string; config: NormalizedConfig; shared: Record<string,string>; light: Record<string,string>; dark: Record<string,string>; warnings: string[] }`
  - `createTheme(config: ThemeConfig): ResolvedTheme`
  - `toCSS(theme: ResolvedTheme, opts?: { root?: boolean }): string`
  - `index.ts` reexporta tipos e todas as funções públicas das Tasks 1–4.

**Tokens de primitivas** (chaves sem `--ui-`):
- Forma (`shared`): `radius-control radius-chip radius-card radius-panel radius-pill` com a tabela 6.1 do spec (valores em px; `999` → `9999px`).
- Densidade (`shared`): `density-scale` = `0.875 | 1 | 1.125`; `control-sm control-md control-lg` pela tabela 6.2.
- Tipo (`shared`): `font-sans` = `"<sans>", ui-sans-serif, system-ui, sans-serif`; `font-mono` = `"<mono>", ui-monospace, SFMono-Regular, Consolas, monospace`; `text-{caption,label,body,body-lg,title-sm,title,display,display-lg}` e `-leading` pela seção 6.3.
- Elevação (por modo): `shadow-flat` (`none`), `shadow-raised`, `shadow-overlay`, `shadow-modal`. Light: duas camadas com cor = neutral L .2 e alpha `.06/.10/.14` (contato) + `.04/.08/.12` (difusa), offsets `0 1px 2px` / `0 1px 3px`, `0 4px 12px` / `0 2px 4px`, `0 12px 32px` / `0 4px 8px`. Dark: mesmas geometrias, alpha `.3/.4/.5`.
- Movimento (`shared`): `motionVars(resolveMotionSpecs(config.motion.ceiling, config.motion.tune))`.

**`toCSS`:** para preset `id`, emitir `[data-theme="id"]{shared+light}` e `.dark [data-theme="id"], .dark[data-theme="id"], [data-theme="id"][data-ui-mode="dark"], [data-ui-mode="dark"] [data-theme="id"]{dark}`; com `root: true`, prefixar `:root` no primeiro seletor e `.dark` no segundo. Overrides de `config.overrides[mode]` sobrescrevem os papéis; cada override que reprova em `contrastReport` adiciona entrada em `warnings` com par e razão medida.

- [ ] **Step 1: Testes que falham**

```ts
const cfg: ThemeConfig = { id: "t", label: "T", brand: "#16824f" };
test("createTheme is deterministic", () => expect(createTheme(cfg)).toEqual(createTheme(cfg)));
test("shape knob maps to radius table", () => {
  expect(createTheme({ ...cfg, shape: "precise" }).shared["radius-control"]).toBe("6px");
  expect(createTheme(cfg).shared["radius-card"]).toBe("12px");
  expect(createTheme({ ...cfg, shape: "soft" }).shared["radius-chip"]).toBe("9999px");
});
test("density knob maps to control heights", () => expect(createTheme({ ...cfg, density: "compact" }).shared["control-md"]).toBe("32px"));
test("font knob is honored with fallbacks", () => expect(createTheme(cfg).shared["font-sans"]).toMatch(/^"Plus Jakarta Sans", /));
test("ceiling flattens expressive in CSS vars", () => {
  const t = createTheme({ ...cfg, motion: "responsive" });
  expect(t.shared["motion-expressive-ease"]).toBe(t.shared["motion-responsive-ease"]);
});
test("override is applied and a contrast-breaking override warns", () => {
  const t = createTheme({ ...cfg, overrides: { light: { "on-emphasis": "#777777" } } });
  expect(t.light["on-emphasis"]).toBe("#777777"); expect(t.warnings.join()).toMatch(/on-emphasis/);
});
test("toCSS emits light and dark blocks with --ui- prefix", () => {
  const css = toCSS(createTheme(cfg));
  expect(css).toContain('[data-theme="t"]{'); expect(css).toContain(".dark [data-theme=\"t\"]");
  expect(css).toMatch(/--ui-canvas:#[0-9a-f]{6};/); expect(css).not.toMatch(/NaN|undefined/);
});
```

- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(theme): createTheme com primitivas de forma, densidade, tipo, elevação e movimento`.

---

### Task 5: Presets, geração de CSS e ponte Tailwind

**Files:**
- Create: `src/theme/presets/{forest,graphite,orchestrator,ember,ink,index}.ts`, `scripts/theme/generate.ts`, `src/styles/theme/themes.generated.css` (gerado), `src/theme/presets/presets.test.ts`
- Modify: `src/theme/tokens.css` (reescrita), `src/styles/theme/foundations.css` (reescrita), `package.json` (scripts)
- Delete: `src/styles/theme/themes.css`, `scripts/theme/{seed.mjs,build.mjs,check.mjs,generate.mjs}`, `src/theme/presets.ts`

**Interfaces:**
- Consumes: `createTheme`, `toCSS`, `ThemeConfig`.
- Produces:
  - `PRESETS: Record<"forest"|"graphite"|"orchestrator"|"ember"|"ink", ThemeConfig>`, `DEFAULT_PRESET = "forest"`
  - Utilitários Tailwind para todos os `RoleName` (`bg-canvas`, `text-fg-muted`, `bg-danger-fill`, `text-on-emphasis`…), para o contrato de intent (`bg-intent-fill`, `bg-intent-fill-hover`, `bg-intent-fill-pressed`, `text-on-intent`, `bg-intent-subtle`, `text-intent-text`, `border-intent-border`, `stroke-intent-fill`), para estados (`bg-state-hover`, `bg-state-pressed`, `bg-state-selected`), raios (`rounded-control|chip|card|panel|pill`), alturas (`h-control-sm|md|lg`), sombras (`shadow-raised|overlay|modal`), tipo (`text-caption` … `text-display-lg`, `font-sans`, `font-mono`).
  - Utilitários de movimento via `@utility`: `motion-transition` (`transition-property: color, background-color, border-color, box-shadow, opacity, transform, translate, scale; transition-duration: var(--motion-duration); transition-timing-function: var(--motion-ease)`), `motion-press` (`&:active:not(:disabled){ scale: var(--motion-press) }` com transição em `--motion-spring-duration`).
  - Variáveis de contexto de movimento: `--motion-ease --motion-duration --motion-spring-duration --motion-amp --motion-press --motion-stagger`, definidas por `[data-motion="calm|responsive|expressive"]` a partir de `--ui-motion-{level}-*`; `:root` usa `calm`.

**Presets:**

| id | config |
|---|---|
| forest | `brand "#16824F"`, `neutral "neutral"`, `vibrance .5` |
| graphite | `brand "#34434B"`, `neutral "cool"`, `vibrance .2`, `motion "responsive"` |
| orchestrator | `brand "#2FC4A0"`, `accent "#E28B55"`, `neutral "cool"`, `vibrance .6` |
| ember | `brand "#E2553A"`, `accent "#F2B53A"`, `neutral "warm"`, `vibrance .8`, `shape "soft"` |
| ink | `brand "#3B5BDB"`, `vibrance .15`, `contrast "high"`, `shape "precise"`, `density "compact"`, `motion "calm"` |

Todos com `label` igual ao id capitalizado.

- [ ] **Step 1: Testes que falham** (`presets.test.ts`)

```ts
test.each(Object.keys(PRESETS))("preset %s resolves without warnings", (id) => expect(createTheme(PRESETS[id]).warnings).toEqual([]));
test.each(Object.keys(PRESETS))("preset %s matches snapshot", (id) => expect(createTheme(PRESETS[id])).toMatchSnapshot());
test("generated CSS is up to date", async () => {
  const fs = await import("node:fs");
  expect(fs.readFileSync("src/styles/theme/themes.generated.css", "utf8")).toBe(renderPresetsCSS());
});
```
  `renderPresetsCSS(): string` vive em `src/theme/presets/index.ts`: cabeçalho `/* gerado por scripts/theme/generate.ts — não editar */`, `toCSS(createTheme(PRESETS.forest), { root: true })` e depois os demais.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar presets e `renderPresetsCSS`; `scripts/theme/generate.ts` grava o arquivo. Scripts do `package.json`: `"theme:build": "tsx scripts/theme/generate.ts"`, `"theme:check": "vitest run src/theme"`, `"theme:lint": "node scripts/theme/lint.mjs src"`, `"theme": "npm run theme:build && npm run theme:check && npm run theme:lint"`; remover `theme:seed` e `audit:contrast`.
- [ ] **Step 4:** Reescrever `tokens.css`: `@import "tailwindcss"`, `@source`, `@import` de `foundations.css`, `themes.generated.css` e (Task 6) fontes; `@theme inline` mapeando `--color-<role>: var(--ui-<role>)` para cada `RoleName`; blocos `[data-intent="X"]` definindo `--intent-fill/-fill-hover/-fill-pressed/--on-intent/--intent-subtle/--intent-text/--intent-border` a partir de `--ui-X-*` (neutral: `fill-neutral`, `fill-neutral-hover`, `fill-neutral-hover`, `fg`, `selected`, `fg`, `border-strong`; brand: `emphasis-*`); `--state-base` = `var(--ui-fg)` em `:root` e `var(--intent-fill)` em `[data-intent]:not([data-intent="neutral"])`; estados por `color-mix(in oklab, var(--state-base) 6% | 10% | 14%, transparent)`; `--spacing: calc(0.25rem * var(--ui-density-scale))`; raios, alturas, sombras, tipo e utilities de movimento.
- [ ] **Step 5:** Reescrever `foundations.css`: blocos `[data-density="compact|comfortable|spacious"]` (escala e alturas da tabela 6.2, depois dos blocos de tema), `z-index` atual, containers atuais, e redução de movimento para `@media (prefers-reduced-motion: reduce)` **e** `:root[data-reduce-motion="true"], :root[data-reduce-motion="true"] [data-motion]` — `--motion-ease: linear; --motion-amp: 0; --motion-press: 1; --motion-duration: 120ms; --motion-spring-duration: 120ms; --motion-stagger: 0ms`.
- [ ] **Step 6:** `npm run theme:build && npm test -- --run && npm run build:css` → PASS e `dist/index.css` contém `--ui-canvas` e `.motion-press`.
- [ ] **Step 7:** Commit `feat(theme): presets como config, CSS gerado e ponte Tailwind v2`.

---

### Task 6: Fontes embutidas

**Files:**
- Create: `src/styles/fonts/{plus-jakarta-sans-latin.woff2,plus-jakarta-sans-latin-ext.woff2,jetbrains-mono-latin.woff2,jetbrains-mono-latin-ext.woff2,fonts.css,OFL-PlusJakartaSans.txt,OFL-JetBrainsMono.txt}`, `src/styles/fonts/fonts.test.ts`
- Modify: `src/theme/tokens.css` (import), `package.json` (`files`: `"src/styles"` no lugar de `"src/styles/theme"`)

- [ ] **Step 1: Teste que falha**

```ts
test("every url() in fonts.css points to an existing file", () => {
  const css = fs.readFileSync("src/styles/fonts/fonts.css", "utf8");
  const urls = [...css.matchAll(/url\("\.\/([^"]+)"\)/g)].map((m) => m[1]);
  expect(urls.length).toBe(4);
  for (const u of urls) expect(fs.existsSync(`src/styles/fonts/${u}`)).toBe(true);
});
test("font-display is swap and families match theme defaults", () => {
  expect(css).toMatch(/font-family: "Plus Jakarta Sans"/); expect(css).toMatch(/font-family: "JetBrains Mono"/); expect(css).not.toMatch(/font-display: (?!swap)/);
});
```
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** No scratchpad: `npm pack @fontsource-variable/plus-jakarta-sans @fontsource-variable/jetbrains-mono`, extrair, copiar os `*-latin-wght-normal.woff2` e `*-latin-ext-wght-normal.woff2` com os nomes acima e os arquivos `LICENSE` como `OFL-*.txt`. Escrever `fonts.css` com 4 `@font-face` (`font-weight: 200 800` para Jakarta, `100 800` para Mono; `font-display: swap`; `unicode-range` copiado do CSS do fontsource). Importar em `tokens.css`. Nenhuma dependência é adicionada ao `package.json`.
- [ ] **Step 4:** Rodar → PASS; `npm run build:css` sem erro.
- [ ] **Step 5:** Commit `feat(theme): Plus Jakarta Sans e JetBrains Mono embutidas (OFL)`.

---

### Task 7: Runtime de tema (Provider, Scope, script, injeção)

**Files:**
- Create: `src/theme/inject.ts`, `src/dev/env.ts`
- Modify (reescrita): `src/theme/theme-provider.tsx`, `src/theme/theme-scope.tsx`, `src/theme/theme-context.ts`, `src/theme/use-theme.ts`, `src/theme/get-theme-script.ts`, `src/theme/index.ts`, `src/index.ts`
- Delete: `src/theme/theme-inputs.ts`, `src/theme/theme-definitions.ts`
- Test: `src/__tests__/theme-runtime.test.tsx` (substitui `theme-inputs.test.ts`, que é removido)

**Interfaces:**
- Consumes: `createTheme`, `toCSS`, `PRESETS`, `DEFAULT_PRESET`, `ThemeConfig`, `ThemeConfigError`, `MotionLevel`.
- Produces:
  - `isDev(): boolean` — `typeof process !== "undefined" && process.env.NODE_ENV !== "production"`
  - `injectTheme(theme: ResolvedTheme, doc?: Document): void` — um único `<style data-dettmann-theme="<id>">` por id, substituído a cada chamada; no-op sem `document`
  - `resolveThemeInput(input: string | ThemeConfig, registry: Record<string, ThemeConfig>): ResolvedTheme` — id desconhecido ou config inválida: em dev lança `ThemeConfigError`; em prod faz `console.error` e retorna o `DEFAULT_PRESET`
  - `ThemeProviderProps { children; theme?: string | ThemeConfig; defaultTheme?: string; themes?: Record<string, ThemeConfig>; defaultMode?: ThemeMode; storageKey?; themeStorageKey?; targetSelector?; disableTransitionOnChange? }` (`ThemeMode = "light"|"dark"|"system"` passa a viver em `theme-context.ts`)
  - `ThemeContextValue { mode; resolvedMode: Mode; setMode; theme: ResolvedTheme; setTheme(next: string | ThemeConfig): void }`
  - `ThemeScopeProps { theme?: string | ThemeConfig; mode?: Mode; density?: ThemeConfig["density"]; motion?: MotionLevel; className?; children }` — renderiza `div` com `data-theme`, `data-ui-mode`, `data-density`, `data-motion` (só os definidos) e injeta configs não-preset
  - `getThemeScript(options)` mantém a assinatura atual; default `"forest"`
  - `src/index.ts` exporta `createTheme`, `PRESETS`, tipos do motor, `ThemeProvider`, `ThemeScope`, `useTheme`, `getThemeScript`

Presets embutidos não são injetados (já estão no CSS gerado). Somente ids de `themes` (registro do consumidor) e configs inline são injetados.

- [ ] **Step 1: Testes que falham**

```ts
test("applies data-theme and dark class for a preset without injecting a style", () => {
  render(<ThemeProvider theme="graphite" defaultMode="dark"><span /></ThemeProvider>);
  expect(document.documentElement.dataset.theme).toBe("graphite");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.querySelectorAll("style[data-dettmann-theme]")).toHaveLength(0);
});
test("injects a runtime config and replaces it on change instead of accumulating", async () => {
  const { rerender } = render(<ThemeProvider theme={{ id: "mine", label: "Mine", brand: "#7c3aed" }}><span /></ThemeProvider>);
  rerender(<ThemeProvider theme={{ id: "mine", label: "Mine", brand: "#db2777" }}><span /></ThemeProvider>);
  const styles = document.querySelectorAll('style[data-dettmann-theme="mine"]');
  expect(styles).toHaveLength(1); expect(styles[0].textContent).toContain("--ui-brand-fill");
});
test("two scopes with different configs get separate styles", () => { /* ids "a" e "b"; dois <style> e dois data-theme */ });
test("unknown stored theme id falls back to default", () => { localStorage.setItem("ui-theme", "removed"); /* render; dataset.theme === "forest" */ });
test("blocked localStorage does not throw", () => { /* vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error() }) */ });
test("invalid config throws ThemeConfigError in dev", () => expect(() => render(<ThemeProvider theme={{ id: "x", label: "X", brand: "nope" }}><span /></ThemeProvider>)).toThrow(/brand/));
test("invalid config falls back in prod", () => { vi.stubEnv("NODE_ENV", "production"); /* não lança; dataset.theme === "forest"; console.error chamado */ });
test("ThemeScope sets density and motion attributes", () => { /* data-density="compact", data-motion="calm" */ });
test("getThemeScript output is valid JS that sets data-theme", () => { /* new Function(getThemeScript({defaultTheme:"ink"}))(); dataset.theme === "ink" */ });
```
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(theme): runtime v2 com presets, configs injetadas e escopos`.

---

### Task 8: Contrato `emphasis × intent`

**Files:**
- Create: `src/theme/emphasis.ts`
- Test: `src/theme/emphasis.test.ts`

**Interfaces:**
- Consumes: `Emphasis`, `Intent`, `MotionLevel`.
- Produces:
  - `INTENTS: readonly Intent[]`, `EMPHASES: readonly Emphasis[]`
  - `interface EmphasisInput { emphasis?: Emphasis; intent?: Intent; motion?: MotionLevel }`
  - `interface EmphasisResolution { emphasis: Emphasis; intent: Intent; motion: MotionLevel; className: string; attrs: { "data-intent": Intent; "data-layer": Emphasis; "data-motion": MotionLevel } }`
  - `resolveEmphasis(input: EmphasisInput, defaults?: { emphasis?: Emphasis; intent?: Intent }): EmphasisResolution`
  - `intentData(intent?: Intent): { "data-intent"?: Intent }`
  - `EMPHASIS_MOTION: Record<Emphasis, MotionLevel>` = `{ low: "calm", medium: "responsive", high: "expressive" }`

**Tabela de classes:**

| emphasis | intent neutral | demais intents |
|---|---|---|
| high | `bg-fg text-canvas hover:opacity-90` | `bg-intent-fill text-on-intent hover:bg-intent-fill-hover active:bg-intent-fill-pressed` |
| medium | `bg-fill-neutral text-fg hover:bg-fill-neutral-hover` | `bg-intent-subtle text-intent-text hover:bg-state-hover` |
| low | `bg-transparent text-fg hover:bg-state-hover active:bg-state-pressed` | `bg-transparent text-intent-text hover:bg-state-hover active:bg-state-pressed` |

Default de `emphasis` = `"medium"` salvo `defaults`. `intent` default: `"brand"` se a emphasis resolvida for `high`, senão `"neutral"`. `motion` explícito sobrescreve `EMPHASIS_MOTION`.

- [ ] **Step 1: Testes que falham**

```ts
test("high without intent resolves to brand + expressive", () => expect(resolveEmphasis({ emphasis: "high" })).toMatchObject({ intent: "brand", motion: "expressive", attrs: { "data-layer": "high" } }));
test("explicit neutral high is respected", () => expect(resolveEmphasis({ emphasis: "high", intent: "neutral" }).className).toContain("bg-fg"));
test("medium danger uses subtle classes", () => expect(resolveEmphasis({ emphasis: "medium", intent: "danger" }).className).toContain("bg-intent-subtle"));
test("default is medium neutral responsive", () => expect(resolveEmphasis({})).toMatchObject({ emphasis: "medium", intent: "neutral", motion: "responsive" }));
test("motion override wins", () => expect(resolveEmphasis({ emphasis: "low", motion: "expressive" }).motion).toBe("expressive"));
test("every emphasis × intent combination yields classes and attrs", () => { for (const e of EMPHASES) for (const i of INTENTS) expect(resolveEmphasis({ emphasis: e, intent: i }).className.length).toBeGreaterThan(0); });
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(theme): contrato central emphasis × intent`.

---

### Task 9: Primitivas de movimento

**Files:**
- Create: `src/motion/{read-motion.ts,animate.ts,motion-scope.tsx,use-motion.ts,presence.tsx,use-flip.ts,index.ts}`
- Modify: `src/index.ts` (exporta `src/motion`)
- Test: `src/__tests__/motion.test.tsx`

**Interfaces:**
- Consumes: `MotionLevel`, `MotionSpec`, `MotionTune`, `MOTION_LEVELS`, `MOTION_DEFAULTS`, `springToLinear`, `motionVars`, `validateMotionSpec`, `isDev`, `useTheme`.
- Produces:
  - `interface MotionValues { ease: string; duration: number; springDuration: number; amp: number; press: number; stagger: number; reduced: boolean }`
  - `readMotion(el: Element): MotionValues` — lê as `--motion-*` computadas; `reduced` = media query **ou** `el.closest(':root[data-reduce-motion="true"]')`; valores ausentes (jsdom) caem para `MOTION_DEFAULTS.calm`
  - `animate(el: Element, keyframes: Keyframe[] | ((m: MotionValues) => Keyframe[]), opts?: { durationFactor?: number; spring?: boolean; delay?: number; iterations?: number; direction?: PlaybackDirection; fill?: FillMode }): Animation | null` — usa `springDuration`/`ease` quando `spring !== false`, senão `duration` + `ease`; `delay`, `iterations`, `direction` e `fill` são repassados à WAAPI (suporte a loops, stagger e coreografias, ver `docs/specs/referencia-icones-animados.md`); reduzido → keyframes reduzidos a opacidade (remove `transform/translate/rotate/scale`), 120 ms e `iterations` limitado a 1; sem `el.animate` → `null`
  - `<MotionScope level?: MotionLevel; tune?: Partial<MotionSpec>; children>` — renderiza `div` com `data-motion` (nível efetivo = `min(level, teto do tema)`) e, com `tune`, `style` com as `--motion-*` recalculadas via `springToLinear`; usa `display: contents` quando não há `tune`
  - `useMotion(): { level: MotionLevel; spec: MotionSpec }`
  - `<Presence show: boolean; enter?: Keyframe[] | ((m) => Keyframe[]); exit?: …; children: ReactElement>` — mantém o filho montado até a saída terminar; padrões: enter `opacity 0→1` + `translateY(4px × amp)→0`, exit o inverso
  - `useFlip<T extends HTMLElement>(deps: unknown[]): (key: string) => (el: T | null) => void` — mede antes/depois em `useLayoutEffect` e anima `translate` com `animate`

- [ ] **Step 1: Testes que falham**

```ts
test("animate returns null when WAAPI is missing", () => expect(animate(document.createElement("div"), [{ opacity: 0 }, { opacity: 1 }])).toBeNull());
test("animate strips transforms when app-level reduce motion is on", () => {
  document.documentElement.dataset.reduceMotion = "true";
  const el = document.createElement("div"); document.body.append(el);
  const spy = vi.fn(() => ({}) as Animation); (el as any).animate = spy;
  animate(el, [{ transform: "scale(1)", opacity: 0 }, { transform: "scale(1.2)", opacity: 1 }]);
  expect(spy.mock.calls[0][0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  expect(spy.mock.calls[0][1]).toMatchObject({ duration: 120 });
});
test("animate honors prefers-reduced-motion", () => { /* matchMedia mock true → mesmo resultado */ });
test("animate passes delay/iterations/direction/fill through and caps loops when reduced", () => {
  /* sem redução: opts { delay: 40, iterations: Infinity, direction: "alternate", fill: "both" } chegam ao spy;
     com data-reduce-motion: iterations === 1 */
});
test("MotionScope clamps to the theme ceiling", () => {
  render(<ThemeProvider theme={{ id: "c", label: "C", brand: "#123456", motion: "responsive" }}><MotionScope level="expressive"><Probe /></MotionScope></ThemeProvider>);
  expect(screen.getByTestId("probe").closest("[data-motion]")!.getAttribute("data-motion")).toBe("responsive");
});
test("MotionScope tune emits CSS vars", () => { /* style contém --motion-ease: linear( */ });
test("Presence keeps child mounted until exit finishes", async () => { /* show=false → ainda no DOM; resolve finished → removido */ });
test("Presence without WAAPI unmounts immediately", () => { /* … */ });
test("useFlip animates moved items only", () => { /* getBoundingClientRect mockado; animate chamado para o item que mudou de posição */ });
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(motion): animate, MotionScope, Presence e useFlip sem dependências`.

---

### Task 10: Orçamento — guarda em dev e `BudgetInspector`

**Files:**
- Create: `src/dev/budget.ts`, `src/dev/budget-inspector.tsx`, `src/dev/index.ts`
- Modify: `src/theme/theme-provider.tsx` (liga a guarda em dev), `src/index.ts`
- Test: `src/__tests__/budget.test.tsx`

**Interfaces:**
- Consumes: `Emphasis`, `isDev`.
- Produces:
  - `interface BudgetViolation { region: Element; highCount: number }`
  - `findBudgetViolations(root: ParentNode): BudgetViolation[]` — para cada `[data-budget-region]`, conta descendentes `[data-layer="high"]` visíveis (não dentro de `[hidden]`, `[inert]`, `[aria-hidden="true"]` e, se `checkVisibility` existir, visível); viola se > 1
  - `useBudgetGuard(enabled: boolean): void` — `MutationObserver` no `document.body` com debounce de 250 ms; `console.warn("[dettmann-ui] budget: <n> high-emphasis elements in", region)` uma vez por região (`WeakSet`)
  - `sampleLayers(opts: { width: number; height: number; step: number; hit: (x: number, y: number) => Element | null }): Emphasis[]` — elemento sem ancestral `[data-layer]` conta como `low`; ancestral `[data-budget-ignore]` é descartado
  - `summarizeLayers(samples: Emphasis[]): Record<Emphasis, number>` (frações 0..1)
  - `budgetVerdict(r: Record<Emphasis, number>, tol?: { lowMedium?: number; highMax?: number }): { ok: boolean; messages: string[] }` — metas 0.6 / 0.3 / 0.1; defaults `lowMedium 0.08`, `highMax 0.12`
  - `<BudgetInspector step?: number; tolerance?; defaultOpen?: boolean />` — `null` em produção; painel `data-budget-ignore` fixo no canto inferior direito com `low / medium / high` em %, veredito, botão "Medir" e alternância de heatmap (`<canvas>` `pointer-events: none` pintando cada amostra com `--ui-fg-subtle`, `--ui-selected`, `--ui-emphasis-fill`)

- [ ] **Step 1: Testes que falham**

```ts
test("flags a region with two visible high elements", () => {
  document.body.innerHTML = `<div data-budget-region><button data-layer="high"></button><button data-layer="high"></button></div>`;
  expect(findBudgetViolations(document)).toHaveLength(1);
});
test("ignores hidden high elements", () => { /* segundo botão dentro de [hidden] → [] */ });
test("guard warns once per region in dev and never in prod", async () => { /* fake timers 250ms; warn chamado 1x; NODE_ENV=production → 0 */ });
test("sampleLayers maps hits to nearest data-layer ancestor and skips ignored", () => { /* hit mockado */ });
test("verdict passes 62/29/9 and fails 40/30/30", () => {
  expect(budgetVerdict({ low: 0.62, medium: 0.29, high: 0.09 }).ok).toBe(true);
  expect(budgetVerdict({ low: 0.4, medium: 0.3, high: 0.3 }).ok).toBe(false);
});
test("BudgetInspector renders nothing in production", () => { /* vi.stubEnv */ });
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(dev): guarda de orçamento 60/30/10 e BudgetInspector`.

---

### Task 11: Adaptação mínima — tokens neutros e primitivas visuais

**Files:**
- Modify: todos os `.tsx`/`.ts` em `src/components`, `src/templates`, `src/primitives` que usam os utilitários da tabela abaixo
- Modify: testes em `src/__tests__` que afirmam essas classes

Substituições mecânicas (somente classes; nenhum redesenho):

| antigo | novo |
|---|---|
| `bg-page` / `text-page` / `ring-offset-page` | `bg-canvas` / `text-canvas` / `ring-offset-canvas` |
| `bg-muted` | `bg-sunken` |
| `bg-hover` / `bg-pressed` | `bg-state-hover` / `bg-state-pressed` |
| `ring-ring` / `border-ring` / `bg-ring` | `ring-focus` / `border-focus` / `bg-focus` |
| `text-fg-inverse` | `text-canvas` |
| `bg-structure-raised` | `bg-structure` |
| `shadow-xs` `shadow-sm` / `shadow-md` `shadow-lg` / `shadow-xl` `shadow-2xl` | `shadow-raised` / `shadow-overlay` / `shadow-modal` |
| `rounded-xs` / `rounded-sm` `rounded-md` `rounded-lg` `rounded` / `rounded-xl` / `rounded-2xl` `rounded-3xl` | `rounded-chip` / `rounded-control` / `rounded-card` / `rounded-panel` |
| `transition-colors duration-fast ease-default` (e variantes com `duration-normal`) | `motion-transition` |

`rounded-full`, `rounded-none` e cantos por lado (`rounded-t`…) ficam como estão.

- [ ] **Step 1:** Aplicar as substituições (busca por regex com fronteira de palavra; revisar cada `rounded-*` em contexto).
- [ ] **Step 2:** `grep -rnE "\b(bg|text|ring|border)-(page|muted|hover|pressed|ring)\b|fg-inverse|structure-raised|shadow-(xs|sm|md|lg|xl|2xl)\b|duration-(fast|normal)|ease-default" src --include=*.tsx --include=*.ts` → sem resultados.
- [ ] **Step 3:** `npm run typecheck && npm test -- --run` → PASS (atualizar asserções de classe nos testes existentes conforme a tabela).
- [ ] **Step 4:** Commit `refactor(ui): componentes consomem tokens neutros v2`.

---

### Task 12: Adaptação mínima — `tone` → `intent`/`emphasis`, `data-layer`, lint

**Files:**
- Modify: `src/components/{alert,avatar,badge,button,checkbox,featured-icon,indicator,progress,radio,slider,status-toggle,switch,tag}/index.tsx`, `src/components/toast/toast.viewport.tsx`, `src/primitives/{icon,spinner,typography}.tsx`, `src/templates/calendar/internal/event-colors.ts`, `src/core/recipe/index.test.ts`, demais arquivos com `secondary-*`/`primary-*`/`brand-*`
- Modify: componentes estruturais para `data-layer="medium"`: `src/templates/{sidebar,navbar,app-shell}`, `src/components/{toolbar,tabs,table,data-table}` (cabeçalho/lista de tabs)
- Modify: regiões de orçamento `data-budget-region`: `src/components/toolbar`, `src/components/action-bar`, rodapé de `src/components/modal`, área de ações de `src/templates/resource-page`
- Modify: `scripts/theme/lint.mjs`
- Delete: `src/theme/tone.ts`
- Test: atualizar testes existentes; `src/__tests__/button.test.tsx` ganha casos novos

**Interfaces:**
- Consumes: `resolveEmphasis`, `intentData`, `Intent`, `Emphasis`, `MotionLevel`.
- Produces:
  - `Button` props: remove `variant` e `tone`; adiciona `emphasis?: Emphasis` (default `"medium"`), `intent?: Intent`, `motion?: MotionLevel`; mantém `size`, `fullWidth`, `loading`, `loadingText`, `startIcon`, `endIcon`. Raiz recebe `resolveEmphasis(...).attrs`, `motion-transition motion-press rounded-control` e altura `h-control-*` por `size`.
  - `Badge`/`Tag`: `variant: solid|soft|outline` → `emphasis: high|medium|low`; `tone` → `intent`.
  - Demais componentes listados: `tone?: Tone` → `intent?: Intent` (mapa `primary→brand`, `secondary→neutral`, demais iguais).

Substituições de cor:

| antigo | novo |
|---|---|
| `bg-tone` / `-hover` / `-pressed` | `bg-intent-fill` / `-hover` / `-pressed` |
| `text-on-tone` | `text-on-intent` |
| `bg-tone-subtle` / `bg-tone-subtle-hover` | `bg-intent-subtle` / `bg-state-hover` |
| `border-tone-border` / `border-tone` | `border-intent-border` / `border-intent-fill` |
| `text-tone-text` / `text-tone` / `stroke-tone` | `text-intent-text` / `text-intent-fill` / `stroke-intent-fill` |
| `bg-primary` `bg-brand` / `bg-primary-subtle` `bg-brand-subtle` / `bg-primary-subtle-hover` | `bg-emphasis-fill` / `bg-emphasis-subtle` / `bg-emphasis-subtle hover:bg-state-hover` |
| `text-primary-text` / `border-primary` / `ring-primary` | `text-emphasis-text` / `border-emphasis-border` / `ring-focus` |
| `bg-secondary` / `bg-secondary-hover` `bg-secondary-pressed` / `text-on-secondary` | `bg-fill-neutral` / `bg-fill-neutral-hover` / `text-fg` |
| `bg-secondary-subtle` / `text-secondary-text` / `border-secondary(-border)` / `ring-secondary(-border)` | `bg-selected` / `text-fg` / `border-border-strong` / `ring-focus` |
| `bg-{danger,warning,success,info}` / `border-{…}` / `ring-{…}-border` | `bg-{…}-fill` / `border-{…}-border` / `ring-{…}-border` |
| `data-tone` / `toneData()` | `data-intent` / `intentData()` |

Usos de `variant="link"` no Button passam a `emphasis="low"`.

- [ ] **Step 1: Testes que falham** (em `button.test.tsx`)

```ts
test("high button carries brand intent, high layer and expressive motion", () => {
  render(<Button emphasis="high">Implantar</Button>);
  const b = screen.getByRole("button");
  expect(b).toHaveAttribute("data-intent", "brand"); expect(b).toHaveAttribute("data-layer", "high"); expect(b).toHaveAttribute("data-motion", "expressive");
});
test("default button is medium neutral responsive", () => { /* data-layer medium, data-intent neutral, data-motion responsive */ });
test("low danger button uses intent text classes", () => { /* className contém text-intent-text, data-intent danger */ });
test("motion prop overrides", () => { /* motion="calm" → data-motion calm */ });
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Aplicar a API e as substituições; remover `tone.ts`; adicionar `data-layer="medium"` e `data-budget-region` nos arquivos listados.
- [ ] **Step 4:** Expandir `lint.mjs` (escopo `src/components`, `src/templates`, `src/primitives`; ignora `*.test.*` e `__tests__`) para reprovar também: `/\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|divide|shadow|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/`, `/\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/`, `/\b(?:bg|text|border|ring|stroke)-(?:tone|primary|secondary)\b|-(?:tone|primary|secondary)-/`, `/\bdata-tone\b/`.
- [ ] **Step 5:** `npm run typecheck && npm test -- --run && npm run theme:lint` → PASS. Verificar o lint criando temporariamente `src/components/__lint_probe.tsx` com `className="bg-red-500"` → lint FAIL; apagar o arquivo.
- [ ] **Step 6:** Commit `refactor(ui): componentes adotam emphasis × intent, camadas e lint v2`.

---

### Task 13: Playground

**Files:**
- Create: `playground/{index.html,vite.config.ts,main.tsx,app.tsx,app.test.tsx}`, `playground/panels/{theme-editor.tsx,ramps.tsx,contrast.tsx,sample-screen.tsx,motion-demo.tsx,export.tsx}`
- Modify: `package.json` (`"playground": "vite --config playground/vite.config.ts"`; devDependencies `vite` e `@tailwindcss/vite` nas versões já usadas pelo `frontend/`), `vitest.config.ts` (`include` adiciona `playground/**/*.test.tsx`), `tsconfig.json` (`include` adiciona `playground`)

**Interfaces:**
- Consumes: `createTheme`, `PRESETS`, `contrastReport`, `ThemeScope`, `MotionScope`, `animate`, `Presence`, `useFlip`, `BudgetInspector`, componentes existentes.
- Produces: `App` (default export de `app.tsx`) e `configToCode(config: ThemeConfig): string` (em `export.tsx`, saída `createTheme({ ... })` com apenas as chaves diferentes do default).

Conteúdo: editor com seletor de preset e todos os botões do `ThemeConfig` (cor via `<input type="color">` + campo de texto); duas colunas `ThemeScope` light/dark; painel de rampas (amostras de cada papel com hex); painel de contraste (`contrastReport` com razão, meta e ✓/✗); tela de exemplo (sidebar, toolbar com uma ação `high`, tabela, formulário, botão que abre `Modal`); demonstração de movimento (três botões iguais com `MotionScope` calm/responsive/expressive, lista reordenável com `useFlip`, item que entra/sai com `Presence`); `BudgetInspector` sempre montado; painel de exportação com `configToCode`.

- [ ] **Step 1: Testes que falham** (`app.test.tsx`)

```ts
test("renders both modes and the contrast panel with no failures for the default preset", () => {
  render(<App />);
  expect(screen.getAllByTestId("mode-column")).toHaveLength(2);
  expect(screen.queryAllByTestId("contrast-fail")).toHaveLength(0);
});
test("changing brand updates the exported code", async () => { /* digitar "#7c3aed" → export contém brand: "#7c3aed" */ });
test("configToCode omits defaults", () => expect(configToCode({ id: "x", label: "X", brand: "#123456", vibrance: 0.5 })).not.toContain("vibrance"));
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS; `npm run playground` sobe sem erro no console (verificar no navegador embutido com `preview_start` e tirar screenshot de light/dark).
- [ ] **Step 5:** Commit `feat(playground): editor de tema ao vivo com contraste, movimento e orçamento`.

---

### Task 14: Skill `dettmann-ui-use` e instalador

**Files:**
- Create: `skills/dettmann-ui-use/SKILL.md`, `scripts/skills/install.mjs`, `src/__tests__/skills-install.test.ts`
- Modify: `package.json` (`"skills:install": "node scripts/skills/install.mjs"`)

**Interfaces:**
- Produces: `node scripts/skills/install.mjs <target>` copia cada `skills/<nome>/` para `<target>/.claude/skills/<nome>/` e `<target>/.cursor/skills/<nome>/` (sobrescreve), remove `<target>/.cursor/skills/dettmann-ui/` legado se existir, não toca outras pastas; sai com código 1 e mensagem se `<target>` não existe.

- [ ] **Step 1: Teste do instalador que falha**

```ts
test("installs skills into .claude and .cursor and removes legacy folder only", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  fs.mkdirSync(path.join(dir, ".cursor/skills/dettmann-ui"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".claude/skills/other"), { recursive: true });
  execFileSync("node", ["scripts/skills/install.mjs", dir]);
  expect(fs.existsSync(path.join(dir, ".claude/skills/dettmann-ui-use/SKILL.md"))).toBe(true);
  expect(fs.existsSync(path.join(dir, ".cursor/skills/dettmann-ui-use/SKILL.md"))).toBe(true);
  expect(fs.existsSync(path.join(dir, ".cursor/skills/dettmann-ui"))).toBe(false);
  expect(fs.existsSync(path.join(dir, ".claude/skills/other"))).toBe(true);
});
test("fails clearly for a missing target", () => expect(() => execFileSync("node", ["scripts/skills/install.mjs", "/no/such/dir"], { stdio: "pipe" })).toThrow());
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementar o instalador. **Step 4:** PASS.
- [ ] **Step 5:** Escrever a skill com o processo de `superpowers:writing-skills` (invocar a skill). Cenários de pressão para a linha de base (subagente **sem** a skill, projeto consumidor fictício com a lib v2) e para a verificação (**com** a skill):
  1. "Adicione os botões Salvar e Excluir perfil no rodapé deste diálogo" → esperado: `Salvar` `emphasis="high"`, `Excluir` `emphasis="low" intent="danger"`, nunca dois `high`.
  2. "Crie um tema roxo para este app" → esperado: `createTheme({ brand: … })` com botões, sem hex por papel.
  3. "Faça um card de estatística com número grande e variação" quando não existe componente → esperado: compõe primitivas sem cor local ou para e indica `dettmann-ui-author`; não cria componente paralelo no projeto.
  4. "O menu lateral está sem graça, dê vida a ele" → esperado: estrutura em `medium`/`responsive`, ícones herdando movimento, sem mudar para `expressive` sem motivo.
  Conteúdo mínimo: tabela de decisão de emphasis, regras de intent, orçamento e `BudgetInspector`, movimento (herança, `MotionScope`, prop `motion`, redução), composição por slots, tema (`createTheme`, presets, `ThemeScope`), proibições, checklist de revisão de tela (absorve `.cursor/skills/dettmann-ui/ui-review`).
- [ ] **Step 6:** Commit `feat(skills): dettmann-ui-use e instalador para Claude Code e Cursor`.

---

### Task 15: Skill `dettmann-ui-author`

**Files:**
- Create: `skills/dettmann-ui-author/SKILL.md`

- [ ] **Step 1:** Escrever com `superpowers:writing-skills`. Cenários (subagente atuando **dentro** de `dettmann-ui-vnext`):
  1. "Adicione um componente Chip à lib" → esperado: recipe + slots, `resolveEmphasis`, `data-layer`, `motion-transition`/`motion-press`, `rounded-chip`, teste em `src/__tests__`, export em `src/index.ts`, nenhuma cor literal, `npm run theme:lint` verde.
  2. "Deixe o warning mais amarelo" → esperado: altera o algoritmo/metas em `src/theme/engine` com teste de propriedade, nunca hex no CSS gerado à mão; regenera com `theme:build`.
  3. "Adicione uma animação de sucesso ao Toast" → esperado: usa `animate`/`Presence` e `--motion-amp`, respeita redução de movimento, sem dependência nova.
  Conteúdo mínimo: as 4 camadas e o que cada uma pode tocar; anatomia de componente; testes obrigatórios; comandos de validação; quando atualizar docs (`docs/theme-system.md`, `docs/decisions.md`) e skills (inclusive esta e `dettmann-ui-use`).
- [ ] **Step 2:** Commit `feat(skills): dettmann-ui-author`.

---

### Task 16: Skill `dettmann-ui-improve`

**Files:**
- Create: `skills/dettmann-ui-improve/SKILL.md`, `skills/dettmann-ui-improve/fixtures/` (arquivos de exemplo usados só nos cenários de teste da skill)

- [ ] **Step 1:** Criar fixtures: uma tela React com `className="bg-[#1e293b] rounded-[10px]"`, `transition-all duration-300`, o mesmo bloco "ícone + título + contador" repetido em três lugares, dois botões `emphasis="high"` na mesma toolbar, uma lista que remove itens sem `Presence`.
- [ ] **Step 2:** Escrever com `superpowers:writing-skills`. Cenários:
  1. "Onde esta tela pode melhorar?" (fixture) → esperado: relatório com todos os 5 problemas, cada um com `arquivo:linha`, impacto × esforço, correção sugerida citando o componente/primitiva da lib; nenhuma edição de arquivo.
  2. "Audite a lib" → esperado: lista componentes sem estados loading/empty/error, sem teclado ou sem movimento, lacunas de catálogo; relatório priorizado; nenhuma edição.
  Formato fixo do relatório: tabela `prioridade | achado | onde | correção | impacto | esforço`, seguida de "padrões que deveriam virar componente".
- [ ] **Step 3:** Commit `feat(skills): dettmann-ui-improve`.

---

### Task 17: Documentação, decisões e limpeza final

**Files:**
- Modify: `docs/theme-system.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/migration.md`, `README.md`, `examples/orchestrator-theme-usage.tsx` (passa a usar `PRESETS.orchestrator`/`createTheme`)
- Delete: `examples/orchestrator-theme.css`, `.cursor/skills/dettmann-ui/`, `scripts/theme/README.md` (substituído por seção no `docs/theme-system.md`)
- Modify (raiz do repo): `../AGENTS.md`, `../mod-orchestrator-spec-v2/docs-ia/decisoes.md`
- Create (raiz do repo): `../.claude/skills/dettmann-ui-*`, `../.cursor/skills/dettmann-ui-*` via instalador

- [ ] **Step 1:** Atualizar os docs da lib: arquitetura de 4 camadas, `ThemeConfig` e botões, contrato `emphasis × intent`, movimento e ajuste fino, orçamento, playground, skills; `docs/decisions.md` registra as decisões da seção 3 do spec; `docs/migration.md` traz as tabelas de substituição das Tasks 11–12 (servirão ao subprojeto 4).
- [ ] **Step 2:** Rodar `npm run skills:install -- ..` (raiz do Mod Orchestrator). Em `../AGENTS.md`, trocar a seção "UI (dettmann-ui)" para apontar `.claude/skills/dettmann-ui-use`, `dettmann-ui-author` e `dettmann-ui-improve`, mantendo a nota de que o `frontend/` usa `dettmann-ui-v1` até o subprojeto 4.
- [ ] **Step 3:** Em `../mod-orchestrator-spec-v2/docs-ia/decisoes.md`, adicionar a próxima decisão (D095, ou o próximo número livre) "Adoção da dettmann-ui v2": v2 com ruptura, app congelado em `dettmann-ui-v1` até a migração (subprojeto 4), skills novas.
- [ ] **Step 4:** Validação completa:
  - `npm run typecheck && npm test -- --run && npm run theme && npm run build` (em `dettmann-ui-vnext`) → PASS
  - `grep -rn "culori\|themes.css\|theme-inputs\|tone.ts\|data-tone" src scripts docs README.md` → apenas menções históricas em `docs/decisions.md`/`docs/migration.md`
  - Na raiz: `npm --prefix frontend run typecheck && npm --prefix frontend test` → PASS (app intacto em v1)
- [ ] **Step 5:** Commit `docs(dettmann-ui): documentação v2, decisão D095 e skills instaladas`.
