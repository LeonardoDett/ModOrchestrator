# Componentes v2, onda 1 (controles e entradas) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar os controles e entradas da dettmann-ui v2 que o Mod Orchestrator usa, segundo a linguagem "ferramenta profissional densa", e entregar `Input.Select multiple` e `Input.Password`.

**Architecture:** Três peças compartilhadas nascem primeiro (utilitários de anel de foco, recipe de linha selecionável, testes de contrato por varredura de fonte e de níveis atômicos). Depois cada grupo de componentes é ajustado contra esses testes. O app é ajustado e medido no fim.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`tokens.css`), `defineRecipe`, `@floating-ui/react`, Vitest + Testing Library. Sem dependência nova.

**Spec:** `dettmann-ui-vnext/docs/specs/2026-10-09-v2-components-design.md` (seções 3, 4, 5 linha "Onda 1", 6, 7).

## Global Constraints

- Skill obrigatória para todo arquivo da lib: `.claude/skills/dettmann-ui-author/SKILL.md`. Para o `frontend/`: `dettmann-ui-use`. Antes de fechar: `dettmann-ui-improve`.
- Cor só por `resolveEmphasis` / `restingClassName` / papéis L3. Nenhum hex, `rgb()`, paleta crua ou classe `intent-*` nova fora de `src/theme/emphasis.ts`.
- Sombra só em overlay (`shadow-overlay`, `shadow-modal`). `shadow-raised` sai de todos os componentes desta onda.
- Desabilitado: `bg-sunken` + `text-fg-subtle`, nunca `opacity-40/50/60`.
- Raio: `rounded-control|chip|card|panel|pill`. `rounded-full`, `rounded-lg`, `rounded-md` não aparecem.
- Movimento: `motion-transition`, `motion-press`, `Presence`, `useFlip`, `animate()`. A única forma de `duration-*` aceita é `duration-(--motion-duration)` com `ease-(--motion-ease)` (D-024).
- Foco: só os utilitários `focus-ring` / `focus-ring-inset` (Task 1). Nenhum `outline-none` solto.
- Linha compacta = `h-control-sm` (32 px em `comfortable`, 28 px em `compact`).
- Textos embutidos são props com padrão em inglês (D-009).
- Design Atômico (D-032): átomo não importa molécula; molécula não importa organismo.
- Mudança de API pública entra em `docs/migration.md` e o `frontend/` é ajustado na mesma onda.
- Git: um único commit no `master` ao fim da onda (Task 9). Sem push.
- Comandos da lib rodam em `dettmann-ui-vnext/`; os do app, na raiz do repositório.

## Review Focus

1. `Input.Select multiple` recebendo de `Input.Root` um `value` string (não array), ou um valor que não existe mais em `options`: não quebra, trata como "nada marcado" / ignora o valor órfão na exibição e o preserva no `onChange` só se o usuário não o remover.
2. `Input.Password` com `hideOnBlur`: clicar no botão de olho tira o foco do campo; o valor **não** pode mascarar e revelar no mesmo clique (o blur para o botão não conta como saída).
3. Rótulos longos e muitas seleções no gatilho do `Select multiple`: uma linha só, sem estourar a largura do `Input.Box`; `+N` correto quando nada cabe.
4. `Input.Root disabled` com os miolos novos: menu não abre, botão de olho não alterna, nenhum dos dois entra na ordem de tabulação.
5. `SegmentedControl` com opção desabilitada selecionada e com a lista de opções mudando em runtime: o indicador acompanha sem ficar órfão.

---

### Task 1: Peças compartilhadas e testes de contrato

**Files:**
- Modify: `src/theme/tokens.css` (junto dos `@utility motion-*`)
- Create: `src/core/styles/row.ts`
- Create: `src/__tests__/wave-contract.test.ts`
- Create: `src/__tests__/atomic-levels.test.ts`
- Create: `src/__tests__/row-recipe.test.tsx`

**Interfaces:**
- Produces: utilitários CSS `focus-ring` (= `focus-visible:outline-none` + anel 2 px `ring-focus` + `ring-offset-2 ring-offset-canvas`) e `focus-ring-inset` (anel 2 px interno, sem offset). Ambos entram no safelist (`@source inline`).
- Produces: `rowRecipe` em `src/core/styles/row.ts`:
  ```ts
  export const rowRecipe: (v?: { selected?: boolean; active?: boolean; disabled?: boolean; indicator?: "start" | "bottom" | "none" }) => string;
  ```
  Base: `relative flex items-center gap-2 h-control-sm px-3 text-sm motion-transition focus-ring-inset`. `selected`: `bg-selected text-fg font-medium` + pseudo-elemento de 2 px `bg-brand-fill` na borda indicada (`indicator` padrão `start`). `active` (item sob o teclado, sem foco real): `bg-state-hover`. Não selecionado: `hover:bg-state-hover active:bg-state-pressed`. `disabled`: `text-fg-subtle cursor-not-allowed pointer-events-none`.
- Produces: `WAVE_FILES: string[]` em `wave-contract.test.ts` (caminhos relativos a `src/`), que as ondas seguintes estendem.
- Produces: `LEVELS: Record<string, "atom" | "molecule" | "organism" | "template">` em `atomic-levels.test.ts`, chave = nome da pasta em `src/components`/`src/templates` ou arquivo de `src/primitives`.

- [ ] **Step 1: Escrever `wave-contract.test.ts`** (falha até as Tasks 2 a 8)

  Lê cada arquivo de `WAVE_FILES` como texto e afirma, por arquivo, que não casa:
  ```ts
  const FORBIDDEN: [string, RegExp][] = [
    ["opacidade em desabilitado", /\bopacity-(40|50|60)\b/],
    ["sombra fora de overlay", /\bshadow-raised\b/],
    ["raio genérico", /\brounded(-[lrtb])?-(full|sm|md|lg|xl|2xl)\b/],
    ["movimento manual", /\bduration-\d+\b|\btransition-(all|colors|opacity)\b|\banimate-(in|out|spin|pulse|bounce)\b|@keyframes/],
    ["foco escrito à mão", /focus-visible:ring-|focus:ring-|\boutline-none\b/],
    ["lucide solto", /from ["']lucide-react["']/],
  ];
  ```
  `WAVE_FILES` da onda 1: `components/button/index.tsx`, `components/button-group/index.tsx`, `components/checkbox/index.tsx`, `components/radio/index.tsx`, `components/switch/index.tsx`, `components/segmented-control/index.tsx`, `components/status-toggle/index.tsx`, `components/badge/index.tsx`, `components/tag/index.tsx`, `components/indicator/index.tsx`, `primitives/kbd.tsx` e todos os `components/input/input.*.tsx` exceto `input.pin.tsx`.
  Exceção de sombra: `input.select.tsx`, `input.combobox.tsx`, `input.multi-select.tsx` podem conter `shadow-overlay` (a regex só proíbe `shadow-raised`).
  "Lucide solto" permite o import quando o glifo não existe em `src/icons/index.ts`; a lista de exceções é explícita no teste (`ALLOWED_LUCIDE: Record<arquivo, string[]>`), começa vazia.

- [ ] **Step 2: Escrever `atomic-levels.test.ts`**

  `LEVELS` classifica **todas** as pastas (o teste falha se faltar alguma). Níveis da onda 1: átomos `button`, `checkbox`, `radio`, `switch`, `badge`, `tag`, `indicator`, `loader`, `kbd` e demais primitivos; moléculas `button-group`, `segmented-control`, `status-toggle`, `input`. Classifique o restante lendo os imports atuais; se um import existente violar a regra, registre-o em `KNOWN_VIOLATIONS` (lista explícita no teste, com a onda que vai resolvê-lo) em vez de esconder.
  Asserção: para cada arquivo `.tsx` não-teste, todo import relativo que aponte para outra pasta de componente/template tem nível ≤ o do importador (`atom < molecule < organism < template`), exceto os pares em `KNOWN_VIOLATIONS`.

- [ ] **Step 3: Escrever `row-recipe.test.tsx`**

  ```ts
  expect(rowRecipe()).toContain("h-control-sm");
  expect(rowRecipe()).toContain("focus-ring-inset");
  expect(rowRecipe({ selected: true })).toContain("bg-selected");
  expect(rowRecipe({ selected: true })).toMatch(/before:.*bg-brand-fill/);
  expect(rowRecipe({ selected: true, indicator: "none" })).not.toMatch(/before:/);
  expect(rowRecipe({ disabled: true })).not.toMatch(/opacity-/);
  expect(rowRecipe({ disabled: true })).not.toMatch(/hover:/);
  ```

- [ ] **Step 4: Rodar e ver falhar**

  Run: `npx vitest run src/__tests__/wave-contract.test.ts src/__tests__/atomic-levels.test.ts src/__tests__/row-recipe.test.tsx`
  Expected: `row-recipe` falha por módulo inexistente; `wave-contract` falha listando os arquivos atuais; `atomic-levels` passa ou lista violações reais.

- [ ] **Step 5: Implementar `focus-ring`/`focus-ring-inset` em `tokens.css` e `rowRecipe` em `src/core/styles/row.ts`**

  Confirme o nome do papel da marca para o indicador em `tokens.css` antes de usar (`bg-brand-fill` ou o equivalente existente); ajuste o teste do Step 3 ao nome real, sem criar papel novo.

- [ ] **Step 6: Rodar**

  Run: `npm run theme:build && npx vitest run src/__tests__/row-recipe.test.tsx src/__tests__/atomic-levels.test.ts`
  Expected: PASS. (`wave-contract` continua vermelho até a Task 8.)

### Task 2: `Button` e `ButtonGroup`

**Files:**
- Modify: `src/components/button/index.tsx`, `src/components/button-group/index.tsx`
- Test: `src/__tests__/button.test.tsx`

**Interfaces:**
- Consumes: `focus-ring` (Task 1).
- Produces: API do `Button` inalterada. Novo comportamento: `aria-busy="true"` quando `loading`.

- [ ] **Step 1: Testes novos em `button.test.tsx`**

  ```tsx
  it("has no shadow at any emphasis", () => { /* low, medium, high: className não contém "shadow-" */ });
  it("medium is outlined by a border", () => { expect(screen.getByRole("button", { name: "Save" })).toHaveClass("border", "border-border"); });
  it("loading sets aria-busy and keeps the accessible name", () => { /* <Button loading>Save</Button> → aria-busy="true", name "Save", disabled */ });
  it("group joins radii with the control primitive", () => { /* ButtonGroup: className contém "rounded-l-control" e "rounded-r-control", não "rounded-l-lg" */ });
  ```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/__tests__/button.test.tsx`

- [ ] **Step 3: Implementar**

  `Button`: remove `shadow-raised` e `disabled:shadow-none`; `medium` ganha `border border-border` (`low` e `high` ficam `border border-transparent` para não mudar de tamanho entre ênfases); foco pelo utilitário `focus-ring`; `aria-busy`. `ButtonGroup`: `rounded-l-control`/`rounded-r-control`.

- [ ] **Step 4: Rodar** — `npx vitest run src/__tests__/button.test.tsx` → PASS.

### Task 3: `Checkbox`, `Radio`, `Switch`, `StatusToggle`

**Files:**
- Modify: `src/components/checkbox/index.tsx`, `radio/index.tsx`, `switch/index.tsx`, `status-toggle/index.tsx`
- Test: `src/__tests__/selection-controls.test.tsx` (novo), `src/__tests__/status-indicators.test.tsx`

**Interfaces:**
- Consumes: `focus-ring`; `CheckIcon`, `MinusIcon` de `src/icons` (import relativo `../../icons/glyphs/...`, nunca o barrel `icons/index`).
- Produces: APIs inalteradas.

- [ ] **Step 1: Testes em `selection-controls.test.tsx`**

  Para cada um dos quatro: (a) Espaço alterna e chama `onCheckedChange`/`onChange` com o valor novo; (b) controlado não muda sem o pai atualizar; (c) `disabled` não alterna, tem `bg-sunken` e nenhuma classe `opacity-`; (d) nome acessível vem do rótulo; (e) `data-intent="brand"` quando marcado. Mais:
  ```tsx
  it("checkbox mark replays on check", () => { /* stub em Element.prototype.animate; marcar chama animate; desmarcar não */ });
  it("switch thumb has a border, not a shadow", () => { /* thumb: className contém "border", não "shadow-" */ });
  it("pill shapes use the semantic radius", () => { /* track do Switch e do StatusToggle: "rounded-pill" */ });
  ```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/__tests__/selection-controls.test.tsx`

- [ ] **Step 3: Implementar**

  - `Checkbox`: marca = `CheckIcon` (indeterminado = `MinusIcon`) com `trigger="none"` e `playKey` incrementado só na transição para marcado; caixa `rounded-chip`; `focus-ring`.
  - `Radio`: ponto interno escala com `transition-transform duration-(--motion-duration) ease-(--motion-ease)`; `rounded-pill`; `focus-ring`.
  - `Switch` e `StatusToggle`: track e thumb `rounded-pill`; thumb `bg-surface border border-border` sem sombra; `focus-ring`.

- [ ] **Step 4: Rodar** — `npx vitest run src/__tests__/selection-controls.test.tsx src/__tests__/status-indicators.test.tsx src/__tests__/emphasis-adoption.test.tsx` → PASS.

### Task 4: `SegmentedControl`

**Files:**
- Modify: `src/components/segmented-control/index.tsx`
- Test: `src/__tests__/segmented-control.test.tsx` (novo)

**Interfaces:**
- Consumes: `focus-ring`, `useFlip` (`src/motion/use-flip.ts`: `useFlip<T>(deps): (key) => (el) => void`).
- Produces: API inalterada. O contêiner ganha `data-layer="medium"`.

- [ ] **Step 1: Testes**

  ```tsx
  it("is a radiogroup driven by arrows", () => { /* ←/→ movem e selecionam, pulando opção desabilitada; Home/End */ });
  it("sizes come from control primitives", () => { /* sm → h-control-sm, md → h-control-md, lg → h-control-lg; nenhum h-8/h-9/h-11 */ });
  it("selected segment is a bordered surface without shadow", () => { /* "bg-surface", "border", sem "shadow-" */ });
  it("disabled option uses tokens, not opacity", () => { /* "text-fg-subtle", sem "opacity-" */ });
  it("keeps one indicator when options change at runtime", () => { /* rerender com a opção selecionada removida: zero ou um elemento [data-slot=indicator], nunca dois */ });
  it("declares the structural layer", () => { /* radiogroup tem data-layer="medium" */ });
  ```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**

  Um único elemento `[data-slot=indicator]` (`bg-surface border border-border rounded-chip`) renderizado dentro do segmento selecionado e animado entre segmentos com `useFlip([value])`; contêiner `bg-structure rounded-control p-0.5`.

- [ ] **Step 4: Rodar** → PASS.

### Task 5: `Badge`, `Tag`, `Indicator`, `Kbd`

**Files:**
- Modify: `src/components/badge/index.tsx`, `tag/index.tsx`, `indicator/index.tsx`, `src/primitives/kbd.tsx`
- Test: `src/__tests__/status-indicators.test.tsx`, `src/__tests__/emphasis-adoption.test.tsx`

**Interfaces:**
- Consumes: `focus-ring`, `XIcon` (`src/icons/glyphs/x`).
- Produces: `Tag` passa a aceitar `emphasis?: "low" | "medium"` (padrão `medium`; `low` = só borda e texto do intent). Emenda a D-024 (registrar em D-033). `Badge`, `Indicator`, `Kbd`: API inalterada.

- [ ] **Step 1: Testes**

  ```tsx
  it("Tag resolves color through the emphasis table", () => { /* medium: classes de restingClassName(resolveEmphasis({emphasis:"medium", intent})) presentes; data-layer="medium" */ });
  it("Tag low is an outline", () => { /* "bg-transparent", "border", "text-intent-text" */ });
  it("Tag remove button is keyboard reachable and labelled", () => { /* Tab foca, Enter chama onRemove, nome = removeLabel */ });
  it("Badge and Tag use chip/pill radii", () => { /* nenhum "rounded-full" */ });
  it("Kbd is flat", () => { /* sem "shadow-"; "rounded-chip" */ });
  ```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar** (botão de remover do `Tag`: `XIcon size="xs"` se o tamanho existir, senão `sm`; confira em `define-icon.tsx`).

- [ ] **Step 4: Rodar** → PASS.

### Task 6: Família `Input` (redesenho dos miolos existentes)

**Files:**
- Modify: `src/components/input/input.box.tsx`, `input.field.tsx`, `input.textarea.tsx`, `input.number.tsx`, `input.label.tsx`, `input.select.tsx`, `input.combobox.tsx`, `input.multi-select.tsx`
- Test: `src/__tests__/input.test.tsx`, `input-select.test.tsx`, `input-number.test.tsx`

**Interfaces:**
- Consumes: `rowRecipe`, `focus-ring` (Task 1).
- Produces: nenhuma mudança de API. Opções de `Select`, `Combobox` e `MultiSelect` passam a ser linhas `rowRecipe`.

- [ ] **Step 1: Testes**

  ```tsx
  it("box is flat and borders carry the state", () => { /* sem "shadow-"; foco: "border-focus"; erro: "border-danger-border"; disabled: "bg-sunken" */ });
  it("select, combobox and multi-select options are compact rows", () => { /* cada role=option: "h-control-sm"; a selecionada: "bg-selected" */ });
  it("menus are the only elevated part", () => { /* listbox: "shadow-overlay" "rounded-card" "border" */ });
  it("number steppers disable with tokens", () => { /* no limite: disabled, sem "opacity-" */ });
  it("combobox and multi-select show the empty message", () => { /* busca sem resultado → emptyMessage visível com role="status" */ });
  ```
  Os testes existentes de teclado do `Select` continuam valendo sem alteração.

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**

  `Input.Box`: remove `shadow-raised`; estado de foco = `border-focus` + anel de 2 px (o anel fica no Box via `focus-within`, não no `<input>`). Menus: `shadow-modal` → `shadow-overlay`. Opções: `rowRecipe({ selected, active, disabled })`; no `Select` simples e no `Combobox`, `indicator: "start"` e o check à direita continua. `input.label.tsx` e `input.select.tsx`/`input.combobox.tsx`: trocar o movimento manual apontado pela auditoria pela forma aceita. `input.number.tsx`: `opacity-*` → tokens.

- [ ] **Step 4: Rodar** — `npx vitest run src/__tests__/input` → PASS.

### Task 7: `Input.Select multiple`

**Files:**
- Modify: `src/components/input/input.select.tsx`, `src/components/input/index.ts`
- Create (se o arquivo passar de ~450 linhas): `src/components/input/input.select.trigger.tsx` com o conteúdo do gatilho
- Test: `src/__tests__/input-select-multiple.test.tsx` (novo)

**Interfaces:**
- Consumes: `inputValueAsArray` (`input.context.tsx`), `Tag`, `Checkbox` visual (apenas a caixa, `aria-hidden`), `rowRecipe`.
- Produces:
  ```ts
  interface InputSelectProps {
    multiple?: boolean;
    /** Só com `multiple`. Troca as tags por um resumo. */
    selectedText?: (count: number) => string;
    /** Só com `multiple`. */
    maxSelected?: number;
    /** Nome acessível do contador "+N". Padrão: (n) => `${n} more`. */
    moreLabel?: (hidden: number) => string;
  }
  ```
  Com `multiple`, `Input.Root` recebe/emite `string[]` na ordem de `options`.

- [ ] **Step 1: Testes** (usar `chooseOption`-like local: clicar no gatilho e na opção)

  ```tsx
  it("toggles options without closing the menu", ...);        // dois cliques → onChange(["a"]) depois (["a","b"]); listbox continua aberto
  it("emits values in option order", ...);                    // marcar "c" e depois "a" → ["a","c"]
  it("listbox is multiselectable and options reflect aria-selected", ...);
  it("Enter and Space toggle the active option; Esc closes keeping the value", ...);
  it("typeahead while closed does not change the value", ...);
  it("maxSelected disables the unchecked options", ...);      // maxSelected=2 com 2 marcadas → as demais aria-disabled, as marcadas ainda desmarcam
  it("renders one hidden input per value for native forms", ...); // name="tags", ["a","b"] → dois input[type=hidden][name=tags]
  it("selectedText replaces the tags", ...);                  // selectedText={(n) => `${n} selecionados`} → "2 selecionados"
  it("a string value from Root is treated as empty", ...);    // Review Focus 1
  it("ignores orphan values in the trigger but keeps them on change", ...); // value ["zzz","a"], marcar "b" → onChange(["a","b","zzz"]) (órfãos ao fim)
  it("disabled Root never opens", ...);                       // Review Focus 4
  it("collapses overflowing tags into +N with an accessible name", ...); // Review Focus 3: mock de offsetWidth/scrollWidth; contador tem aria-label de moreLabel
  ```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/__tests__/input-select-multiple.test.tsx`

- [ ] **Step 3: Implementar**

  Um único componente com ramo por `multiple` (não um segundo componente). Estouro das tags: medir com `ResizeObserver` no gatilho e esconder do fim para o começo; sem `ResizeObserver` (jsdom/SSR) mostra todas. O gatilho nunca quebra linha (`flex-nowrap overflow-hidden`). Seleção única continua idêntica (os testes de `input-select.test.tsx` não mudam).

- [ ] **Step 4: Rodar** — `npx vitest run src/__tests__/input-select` → PASS (os dois arquivos).

### Task 8: `Input.Password`

**Files:**
- Create: `src/components/input/input.password.tsx`
- Modify: `src/components/input/index.ts`, `src/__tests__/root-exports.test.ts` (se listar os miolos), `src/__tests__/input-miolo-types.test.ts`
- Test: `src/__tests__/input-password.test.tsx` (novo)

**Interfaces:**
- Consumes: `useInputContext("Password")`, `useControllableState`, `EyeIcon`/`EyeOffIcon` (`src/icons/glyphs`), `focus-ring`.
- Produces:
  ```ts
  interface InputPasswordProps extends Omit<ComponentPropsWithoutRef<"input">, InputRootOwnedNativeProps | "type"> {
    revealed?: boolean;
    defaultRevealed?: boolean;              // false
    onRevealedChange?: (revealed: boolean) => void;
    hideOnBlur?: boolean;                   // true
    revealable?: boolean;                   // true
    revealLabel?: string;                   // "Show value"
    hideLabel?: string;                     // "Hide value"
  }
  export function InputPassword(props: InputPasswordProps): JSX.Element;
  ```
  Exposto como `Input.Password`.

- [ ] **Step 1: Testes**

  ```tsx
  it("masks by default and reveals on toggle", ...);          // type="password" → clique → type="text", aria-pressed="true", nome = hideLabel
  it("is controlled when `revealed` is given", ...);          // clique chama onRevealedChange(true) e o type não muda sem o pai
  it("hides again when focus leaves field and button", ...);  // revelar, Tab para fora → type="password"
  it("clicking the eye does not hide and re-reveal", ...);    // Review Focus 2: foco no campo, clicar no olho uma vez → revelado; onRevealedChange chamado exatamente 1×
  it("hideOnBlur={false} keeps it revealed", ...);
  it("returns focus to the field keeping the caret", ...);    // selectionStart preservado após alternar
  it("revealable={false} renders no button", ...);
  it("toggle is type=button and does not submit the form", ...);
  it("defaults: autoComplete current-password, spellCheck false, autoCapitalize off; consumer overrides", ...);
  it("disabled Root disables field and toggle", ...);         // Review Focus 4
  it("forwards value changes as plain strings to Root", ...);
  ```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**

  `hideOnBlur`: decidir pelo `relatedTarget` do `blur` (se for o botão ou o campo, não esconde); o botão usa `onPointerDown` com `preventDefault` para não tirar o foco do campo no clique do mouse, e o teclado (Tab até o botão, Enter) devolve o foco ao campo depois de alternar. O botão é `emphasis="low"` visual, mas é um `<button>` próprio com as classes de `resolveEmphasis({ emphasis: "low" })` (átomo `Button` pode ser usado: `input` é molécula).

- [ ] **Step 4: Rodar** — `npx vitest run src/__tests__/input-password.test.tsx src/__tests__/wave-contract.test.ts` → PASS (o contrato fica verde aqui pela primeira vez).

### Task 9: App, documentação, validação e commit

**Files:**
- Modify: `dettmann-ui-vnext/playground/panels/*` (painel de controles: incluir `Select multiple` e `Password`)
- Modify: `frontend/src/**` onde a onda mudar aparência ou API (buscar usos de `Tag`, `SegmentedControl`, `Input.MultiSelect`, `type="password"`)
- Modify: `dettmann-ui-vnext/docs/decisions.md` (D-032, D-033, D-034), `docs/component-matrix.md`, `docs/migration.md`, `skills/dettmann-ui-use/SKILL.md`, `skills/dettmann-ui-author/SKILL.md`, `skills/dettmann-ui-improve/SKILL.md`
- Modify: `mod-orchestrator-spec-v2/docs-ia/decisoes.md` (D108)

- [ ] **Step 1: Docs da lib.** D-032 (Design Atômico, regra de dependência, teste `atomic-levels`). D-033 (linguagem visual: as regras 3.1 a 3.7 do spec, `focus-ring`, `rowRecipe`, `Tag` com `emphasis`, botão sem sombra). D-034 (`Input.Select multiple`, `Input.Password`). `component-matrix.md` ganha a coluna de nível e as variações. Skills: `focus-ring`, `rowRecipe`, níveis, variações novas; em `dettmann-ui-improve`, heurística para `type="password"` escrito à mão → `Input.Password`.
- [ ] **Step 2: `npm run skills:install -- ..`** (dentro de `dettmann-ui-vnext/`) e conferir o diff em `.claude/skills` e `.cursor/skills`.
- [ ] **Step 3: App.** Ajustar usos quebrados/alterados; trocar por `Input.Password` qualquer campo sensível escrito à mão; D108 em `decisoes.md` ("Redesenho dos componentes da dettmann-ui, onda 1", com o que mudou no app).
- [ ] **Step 4: Validação da lib** — em `dettmann-ui-vnext/`: `npm run typecheck && npm test -- --run && npm run theme && npm run build`. Expected: tudo verde, suíte inteira.
- [ ] **Step 5: Validação do app** — na raiz: `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `wails build`. Expected: tudo verde.
- [ ] **Step 6: Visual.** `npm run playground` e o `frontend` em dev (backend offline): capturas do painel de controles e de `Configurações` + `Mods` do app, claro e escuro, com a leitura do `BudgetInspector`.
- [ ] **Step 7: Auditoria.** Skill `dettmann-ui-improve` sobre os arquivos de `WAVE_FILES` e as telas tocadas. Expected: nenhum P1; P2/P3 anotados para as ondas seguintes.
- [ ] **Step 8: Commit único no `master`** (sem push):
  ```bash
  git add dettmann-ui-vnext frontend mod-orchestrator-spec-v2 .claude/skills .cursor/skills
  git commit -m "feat(dettmann-ui): onda 1 do redesenho — controles e entradas (D-032 a D-034, D108)"
  ```
