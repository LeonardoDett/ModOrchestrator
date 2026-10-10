# Componentes v2, onda 2 (feedback e overlays) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a linguagem visual da D-033 a `Alert`, `Toast`, `Modal`, `Drawer`, `Menu`, `ContextMenu`, `Popover`, `Command`, `Progress`, `Stepper`, `Skeleton` e `Loader`, com entrada e saída animadas nos overlays.

**Architecture:** As peças da onda 1 (`focus-ring*`, `rowRecipe`, `wave-contract`) são reutilizadas. Entram um mapa único de ícone por intent (usado por `Alert` e `Toast`) e keyframes de overlay compartilhados. A API pública não muda, exceto props novas e opcionais.

**Tech Stack:** igual à onda 1 (React 19, Tailwind v4, `Presence`/`animate`/`animateLoop`, `@floating-ui/react`, Vitest).

**Spec:** `dettmann-ui-vnext/docs/specs/2026-10-09-v2-components-design.md` (seções 3 e 5, linha "Onda 2"). Decisões da onda 1: D-032 a D-034.

## Global Constraints

- Tudo o que vale na onda 1 (plano `2026-10-10-v2-components-wave1.md`, "Global Constraints") continua valendo.
- O `cn` não resolve conflito de utilitários: estado que muda cor **troca** a classe (variante), nunca acrescenta uma segunda.
- Sombra: `shadow-overlay` em `Menu`, `ContextMenu`, `Popover`, `Command`, `Toast`; `shadow-modal` só em `Modal` e `Drawer`.
- Item de menu/opção = `rowRecipe`; listas de itens com `flex flex-col gap-0.5` (2 px, aprovado pelo usuário na onda 1).
- Movimento de overlay só por `Presence`; sem WAAPI (jsdom) a entrada/saída é imediata, então os testes existentes de abrir/fechar não mudam.
- Nenhuma mudança de papel ARIA existente (`role="alert"` do `Alert` e do `Toast` ficam): o app tem testes que dependem deles.
- Git: um commit no `master` ao fim da onda, sem push.

## Review Focus

1. `Modal`/`Drawer` com saída animada: durante a saída o foco já voltou ao gatilho, o scroll do body já destravou e Esc/clique no fundo não reabrem nem disparam `onOpenChange` de novo.
2. `Modal.Root` deixa de retornar `null` fechado: filhos fora de `Modal.Content` não podem passar a aparecer; conteúdo fechado não fica no DOM.
3. `Command` com todos os itens desabilitados, lista vazia e `loading`: setas e Enter não quebram nem escolhem item desabilitado.
4. `ContextMenu` aberto perto da borda da janela e reaberto em outra posição sem fechar antes: uma única instância, foco no primeiro item habilitado.
5. `Skeleton` com redução de movimento: continua perceptível (pulso de opacidade), sem `transform`.

---

### Task 1: Contrato e peças compartilhadas

**Files:**
- Modify: `src/__tests__/wave-contract.test.ts` (acrescenta os arquivos da onda 2 e `core/styles/row.ts`; `outline-hidden` e `focus-within:ring-` entram na regex de foco)
- Create: `src/icons/intent-icon.ts`, `src/motion/overlay-keyframes.ts`
- Test: `src/__tests__/wave2-shared.test.ts`

**Interfaces:**
- Produces: `intentIcon(intent: Intent): IconComponent | null` — `success` → `CircleCheckIcon`, `warning` → `TriangleAlertIcon`, `danger` → `CircleAlertIcon`, `info` → `InfoIcon`, `brand`/`accent` → `SparklesIcon`, `neutral` → `InfoIcon`.
- Produces: `overlayEnter`/`overlayExit` (opacidade + `scale` de `1 - 0.04 × amp` a 1), `slideEnter(side)`/`slideExit(side)` (translate de `16 × amp` px a partir do lado) e `fadeEnter`/`fadeExit`, todos `(m: MotionValues) => Keyframe[]`.

- [ ] Teste: cada intent devolve um componente; keyframes começam em opacidade 0 e terminam em 1 com `transform` neutro; `slideEnter("left")` usa translateX negativo.
- [ ] Ver falhar, implementar, ver passar.

### Task 2: `Alert` e `Toast`

**Files:** `src/components/alert/index.tsx`, `src/components/toast/toast.viewport.tsx`; testes `src/__tests__/alert.test.tsx`, `toast.test.tsx`.

**Interfaces:**
- `Alert.Root` ganha `icon?: ReactNode | null` (padrão: `intentIcon` do intent resolvido; `null` esconde). Layout em linha (ícone + coluna de texto), `p-3`, `rounded-card`, `gap-3`. O ícone é `aria-hidden` e usa `text-intent-text`.
- `Toast`: mesmo ícone; `shadow-overlay`; ação = `Button size="sm"` (ênfase `medium`); fechar = botão `low` com `focus-ring`; superfície continua `intent-subtle`.

- [ ] Testes: ícone padrão por intent presente e oculto de leitores; `icon={null}` remove; `role="alert"` mantido; toast sem `shadow-modal`; botões com `focus-ring`; ação chama `onClick` e remove o toast.
- [ ] Implementar; rodar `alert`, `toast`, `emphasis-adoption`, `legacy-motion`.

### Task 3: `Progress`, `Stepper`, `Skeleton`, `Loader`, `Backdrop`

**Files:** `src/components/progress/index.tsx`, `stepper/index.tsx`, `src/primitives/skeleton.tsx`, `src/primitives/backdrop.tsx`; teste `src/__tests__/wave2-feedback.test.tsx`.

- `Progress`: `rounded-pill`; largura da barra com `transition-[width] duration-(--motion-duration) ease-(--motion-ease)`.
- `Stepper`: `focus-ring`, círculos `rounded-pill`.
- `Skeleton`: sai `animate-pulse`; entra `animateLoop(el, [{opacity:1},{opacity:.5},{opacity:1}], { period: 1600 })` em `useEffect`, cancelado na desmontagem. `rounded-control` fica; o exemplo do JSDoc passa a `rounded-pill`.
- `Backdrop`: saem as classes mortas `animate-in/out`; a prop `state` continua aceita (`exited` → `hidden`); quem anima é o `Presence` do consumidor (Task 4).
- `Loader`: só entra em `WAVE_FILES`.

- [ ] Testes: classes acima; `Skeleton` chama `Element.prototype.animate` (stub) e não chama com `transform` sob `data-reduce-motion`; `Backdrop` sem `animate-`.
- [ ] Implementar; rodar o arquivo, `loader.test`, `motion.test`.

### Task 4: `Modal` e `Drawer`

**Files:** `src/components/modal/modal.root.tsx`, `modal.content.tsx`, `modal.close-button.tsx`, `src/components/drawer/drawer.root.tsx`, `drawer.content.tsx`, `drawer.close-button.tsx`; testes `src/__tests__/modal.test.tsx`, `drawer.test.tsx`.

- `Root` deixa de retornar `null` quando fechado: devolve o provider sempre. `Content` envolve fundo e painel em `Presence show={open}` (`fadeEnter/Exit` no `Backdrop`; `overlayEnter/Exit` no `Modal`, `slideEnter/Exit(side)` no `Drawer`). Fechado e sem animação em curso, nada fica no DOM.
- Demais filhos diretos de `Root` (fora de `Content`) continuam não renderizados quando fechado: `Root` renderiza `children` só se `open` **ou** se a saída está em curso; para isso `Root` guarda `present` (liga com `open`, desliga quando o `Content` avisa pelo contexto `onExited`, ou imediatamente se não houver `Content`/WAAPI).
- `useOverlay({ enabled: open })` não muda: foco, scroll e Esc soltam no instante do fechamento.
- `Drawer`: raios `rounded-l-panel`/`rounded-r-panel`/`rounded-t-panel`/`rounded-b-panel`; `focus-bare` no painel. Botões de fechar com `focus-ring`.

- [ ] Testes: abrir/fechar como hoje (sem WAAPI some na hora); com stub de `animate` que não resolve, o diálogo continua no DOM após fechar, `aria-hidden`/`inert` no painel em saída, e um segundo Esc não chama `onOpenChange`; irmão de `Content` dentro de `Root` não aparece fechado; classes de raio do `Drawer`.
- [ ] Implementar; rodar `modal`, `drawer`, `overlay-scope`, `templates-card-table`, e os testes do `frontend` que abrem diálogos.

### Task 5: `Menu`, `ContextMenu`, `Popover`

**Files:** `src/components/menu/index.tsx`, `context-menu/index.tsx`, `popover/index.tsx`; testes `src/__tests__/menu.test.tsx`, `context-menu-inspector.test.tsx`, novo `src/__tests__/popover.test.tsx` se não houver.

- Conteúdo: `shadow-overlay`, `focus-bare`, `flex flex-col gap-0.5` (menus), entrada por `Presence` (`overlayEnter`); saída imediata (o `FloatingFocusManager` desmonta com o conteúdo).
- Itens de `Menu` e `ContextMenu`: `rowRecipe({ active, disabled })` + `rounded-chip w-full text-left`. `ContextMenu` destrutivo: `text-danger-text` trocando o `text-fg` (variante), atalho em `Kbd`-like `text-caption text-fg-muted`. Desabilitado por tokens.
- `rowRecipe` ganha `tone?: "default" | "danger"` (texto `text-danger-text`, hover `hover:bg-danger-subtle`) para não escrever cor no componente.

- [ ] Testes: classes de linha e de painel; item desabilitado sem `opacity-`; destrutivo com uma única cor de texto; teclado existente intacto.
- [ ] Implementar; rodar os três arquivos e `row-recipe`.

### Task 6: `Command`

**Files:** `src/components/command/index.tsx` (reformatar em linhas legíveis); teste `src/__tests__/sidebar-command-log.test.tsx` + novo `command.test.tsx`.

- Opções: `rowRecipe({ active, disabled, multiline: Boolean(description) })`, `div role="option"` com `id` e `aria-activedescendant` no campo; o foco fica no campo.
- Setas pulam desabilitados; todos desabilitados → nenhum ativo. `Home`/`End`.
- `loading?: boolean` + `loadingLabel?: string` (padrão `"Loading"`): no lugar da lista, `Loader` com o rótulo. Vazio: `role="status"`.
- `shadow-overlay` fica (é overlay quando usado em paleta); `gap-0.5`.

- [ ] Testes: Review Focus 3 inteiro; `aria-activedescendant` acompanha as setas; clique em desabilitado não chama `onValueChange`.
- [ ] Implementar; rodar os dois arquivos.

### Task 7: App, docs, validação, revisão e commit

- [ ] Ajustar o `frontend/` onde a onda mudar comportamento (buscar `Alert.Root`, `useToast`, `Modal.Root`, `Drawer`, `Menu`, `ContextMenu`, `Command`, `Skeleton`, `Progress`, `Stepper`).
- [ ] Playground: painel "Feedback e overlays".
- [ ] Docs: `decisions.md` D-035 (onda 2: ícone por intent, overlays com `Presence`, `Modal.Root` montado na saída, `Command` com `loading`), `component-matrix.md`, `migration.md`, skills; `npm run skills:install -- ..`; D109 em `decisoes.md` do app.
- [ ] Lib: `npm run typecheck && npm test -- --run && npm run theme && npm run build`. App: `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `go vet ./... && go test ./...`, `wails build`.
- [ ] Navegador: playground claro e escuro; abrir e fechar modal, drawer, menu e toast.
- [ ] `dettmann-ui-improve` nos arquivos da onda (sem P1) e revisão independente do diff; corrigir Critical/Important com teste.
- [ ] Commit único: `feat(dettmann-ui): onda 2 do redesenho — feedback e overlays (D-035, D109)`.
