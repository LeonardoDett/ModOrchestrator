# Componentes v2, onda 3 (dados) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a D-033 aos componentes de dados que o app usa: `Table`, `DataTable` (com `DataTableColumnPicker`), `Tree`, `ReorderableList`, `Tabs`, `Accordion`, `Inspector`, `FilterBar`, `DiffViewer`, `LogViewer`, `MediaImage`, `Lightbox` e `FileDropzone`.

**Architecture:** Mudanças localizadas por componente, sem reescrita: os comportamentos (virtualização, seleção, arrastar, teclado) ficam como estão e só mudam altura, cor de estado, foco e movimento. Reusa `rowRecipe`, `focus-ring*`, `Presence`, `useFlip` e o `wave-contract`.

**Tech Stack:** igual às ondas 1 e 2.

**Spec:** `dettmann-ui-vnext/docs/specs/2026-10-09-v2-components-design.md` (seções 3 e 5, linha "Onda 3"). Decisões anteriores: D-032 a D-035.

## Global Constraints

- Valem as restrições das ondas 1 e 2 (planos `2026-10-10-v2-components-wave1.md` e `-wave2.md`).
- Linha de dados: 32 px na densidade `comfortable` e 28 px na `compact`. No `DataTable` a altura é em px (a virtualização precisa do número): `ROW_HEIGHT = { comfortable: 32, compact: 28 }`.
- Seleção: `bg-selected` + barra de 2 px `bg-brand-fill` na borda inicial (abas: borda inferior). Uma cor por estado; o `cn` não resolve conflito.
- Arrastando: `bg-sunken text-fg-subtle`, nunca opacidade.
- Glifos lucide sem equivalente no catálogo (`Columns3`, `GripVertical`, `Terminal`, `ImageOff`, conforme `docs/migration.md`) entram em `ALLOWED_LUCIDE`, por arquivo.
- Nenhuma mudança de contrato do `DataTable` (props, eventos, papéis ARIA): o app depende deles em quase todas as telas.
- Git: um commit no `master` ao fim da onda, sem push.

## Review Focus

1. `DataTable` virtualizado com `useFlip`: rolar não anima; reordenar, ordenar e filtrar animam só as linhas que continuam visíveis; nenhuma linha fica deslocada depois da animação.
2. `DataTable` com `rowHeight` passado pelo consumidor: continua respeitado (o padrão novo não o sobrepõe).
3. Linha selecionada, focada e arrastada ao mesmo tempo: uma única cor de fundo e de texto.
4. `Tabs.Panel` e `Accordion.Content` com entrada animada: trocar de aba rápido não deixa dois painéis; sem WAAPI nada muda.
5. `Tree` com nó desabilitado selecionado e com milhares de nós: sem regressão de teclado.

---

### Task 1: Contrato

- [ ] `src/__tests__/wave-contract.test.ts`: acrescentar as pastas da onda 3 e `templates/file-dropzone`; preencher `ALLOWED_LUCIDE` (`components/data-table/column-picker.tsx`: `Columns3`; `components/data-table/data-table.tsx`: `GripVertical`; `components/reorderable-list/index.tsx`: `GripVertical`; `components/log-viewer/index.tsx`: `Terminal`; `components/media-image/index.tsx`: `ImageOff`). Rodar e ver falhar nos arquivos da onda.

### Task 2: `Tabs` e `Accordion`

**Files:** `src/components/tabs/tabs.trigger.tsx`, `tabs.panel.tsx`, `src/components/accordion/accordion.trigger.tsx`, `accordion.content.tsx`; teste `src/__tests__/wave3-disclosure.test.tsx`.

- `Tabs.Trigger`: `focus-ring-inset`; `underline` ativo = `text-fg border-brand-fill` (indicador da marca); `segmented` ativo = `bg-selected text-fg`, sem sombra.
- `Tabs.Panel` e `Accordion.Content`: o elemento entra por `Presence show` (entrada padrão); fechado continua retornando `null`.
- `Accordion.Trigger`: `focus-ring-inset`.
- [ ] Testes: classes acima, uma única cor de borda no gatilho ativo, um só `tabpanel` após trocar de aba, teclado existente (`tabs.test`, `accordion.test`) intacto.

### Task 3: `Inspector` e `FilterBar`

**Files:** `src/components/inspector/index.tsx`, `src/components/filter-bar/index.tsx` (reformatar em linhas legíveis); teste `src/__tests__/wave3-panels.test.tsx`.

- `Inspector`: cabeçalho com `data-layer="medium"` e `bg-structure`.
- `FilterBar`: raiz com `data-layer="medium"`, `bg-structure` e `data-budget-region="filter-bar"`; prop nova `filtersLabel?: string` (padrão `"Filters"`, D-009) no lugar do texto fixo; ícone do botão `size="sm"`.
- [ ] Testes: camadas, rótulo sobreponível, contador de filtros, `onQueryChange` com string.

### Task 4: `Table` e `DataTable`

**Files:** `src/components/table/index.tsx`, `src/components/data-table/data-table.tsx`, `column-picker.tsx`; testes `src/__tests__/data-table.test.tsx`, `data-table-reorder.test.tsx`, novo `src/__tests__/wave3-tables.test.tsx`.

- `ROW_HEIGHT = { comfortable: 32, compact: 28 }`; cabeçalho `h-8` / `h-7`.
- Linha: selecionada = `bg-selected` + `before:bg-brand-fill` (sai `bg-emphasis-subtle`/`bg-emphasis-fill`); não selecionada = `hover:bg-state-hover`; arrastada = `bg-sunken text-fg-subtle` **no lugar** das classes de seleção/hover; indicador de soltar `after:bg-brand-fill`.
- Foco: contêiner de rolagem `focus-bare` (o foco aparece na linha, por `outline-focus`, que já é o padrão do anel interno); botão de ordenar `focus-ring-inset`; alça de redimensionar `rounded-pill focus-ring-inset`; ícone de ordenação ociosa `text-fg-subtle` no lugar de `opacity-40`.
- `useFlip<HTMLDivElement>([ordem das chaves visíveis])` nas linhas de dados (não nas de grupo): `ref={flip(item.key)}`.
- `Table`: células `h-control-sm`, `tabular-nums` em `numeric`, sem sombra; conferir que o cabeçalho já tem `data-layer="medium"`.
- [ ] Testes: alturas (padrão e `rowHeight` explícito), classes de seleção/arraste sem conflito, `animate` chamado ao reordenar (stub com retângulos diferentes) e não chamado sem mudança de ordem; suíte existente do `DataTable` sem alteração de asserção de comportamento.

### Task 5: `Tree` e `ReorderableList`

**Files:** `src/components/tree/index.tsx`, `src/components/reorderable-list/index.tsx`; teste `src/__tests__/wave3-lists.test.tsx`.

- `Tree`: nó desabilitado por tokens; botões com `focus-ring-inset`; linha `h-control-sm`; selecionado `bg-selected` + barra da marca.
- `ReorderableList`: item arrastado por tokens; botões de mover com `focus-ring-inset`; conferir `useFlip` (acrescentar se faltar).
- [ ] Testes: classes, teclado existente intacto.

### Task 6: `LogViewer`, `DiffViewer`, `MediaImage`, `Lightbox`, `FileDropzone`

- `LogViewer`: linha clicável com `focus-ring-inset`; conferir vazio.
- `DiffViewer`, `MediaImage`, `Lightbox`, `FileDropzone`: só o que o contrato apontar; `Lightbox` mantém `shadow-modal` (é modal).
- [ ] Teste: `wave-contract` verde para todos os arquivos da onda.

### Task 7: App, docs, validação e commit

- [ ] `frontend/`: procurar `rowHeight`, `density=` e testes que dependam das alturas antigas; ajustar.
- [ ] Playground: painel "Dados".
- [ ] Docs: D-036 em `decisions.md`, `component-matrix.md`, `migration.md`, skills + `skills:install`; D110 em `decisoes.md` do app.
- [ ] Lib: `npm run typecheck && npm test -- --run && npm run theme && npm run build`. App: typecheck, testes, `go vet ./... && go test ./...`, `wails build`.
- [ ] Navegador: playground e o app em dev (tabela de mods com dados do backend offline, se houver), claro e escuro.
- [ ] Auditoria `dettmann-ui-improve` nos arquivos da onda; revisão do diff.
- [ ] Commit: `feat(dettmann-ui): onda 3 do redesenho — dados (D-036, D110)`.
