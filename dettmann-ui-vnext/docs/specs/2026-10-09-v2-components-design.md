# dettmann-ui v2 — Componentes (redesenho, micro-interações, variações novas)

Status: aprovado (2026-10-10).
Subprojeto 3 de 4 da reformulação da dettmann-ui v2 (roadmap: seção 2 de
`2026-10-06-v2-foundation-design.md`). Depende da fundação (1) e dos ícones animados (2),
concluídos. O subprojeto 4 (migração do app) foi feito antes deste (decisão D107 do app),
então este ciclo altera a lib **e** ajusta o `frontend/` do Mod Orchestrator.

## 1. Objetivo

Os componentes receberam só a adaptação mínima na fundação (D-024): compilam com os
tokens novos, mas não cumprem as decisões de design da v2. Este ciclo redesenha tudo o
que o Mod Orchestrator usa para que as decisões valham de fato:

- contrato `emphasis × intent` e orçamento 60/30/10 em todos os componentes, não só em
  `Button` e `Badge`;
- forma `balanced`, movimento que segue a ênfase e ícones animados em uso real;
- personalidade de **ferramenta profissional densa**;
- duas variações novas pedidas pelo autor: seleção múltipla no `Input.Select` e campo de
  dado sensível com botão de revelar.

Critérios de sucesso:

1. Todas as telas do app medem 60/30/10 no `BudgetInspector` (tolerância padrão: ± 8 p.p.
   em low e medium, high ≤ 12%), nos temas claro e escuro. Ponto de partida: Dashboard sem
   jogo, tema escuro, low 80% / medium 20% / high 0%.
2. O logo da barra de título fica legível nos dois temas.
3. A auditoria `dettmann-ui-improve` sobre os componentes do escopo e sobre o `frontend/`
   não tem achado P1.
4. Nenhum componente do escopo escolhe cor fora do contrato (teste automático, seção 7).

## 2. Decisões do brainstorming

| Tema | Decisão |
|---|---|
| Escopo | Redesenho completo de tudo o que o `frontend/` importa da lib (seção 5). O que o app não usa fica para depois |
| Personalidade | Ferramenta profissional densa (referências: Linear, Raycast): superfícies calmas, destaque só na ação principal, micro-interações curtas e precisas |
| Execução | Quatro ondas por nível, cada uma validada no app e fechada num commit |
| Organização | Design Atômico é o princípio da lib: átomos → moléculas → organismos → templates. Um componente só depende dos de nível igual ou inferior (D-032) |
| Seleção múltipla | `Input.Select` ganha `multiple`, com o mesmo menu MD3. `Input.MultiSelect` (busca com tags) continua para listas longas |
| Dado sensível | `Input.Password`: campo mascarado com botão de olho |
| Logo | A barra de título pinta o PNG como máscara com `bg-fg`; sem arquivo novo |
| Crescimento do catálogo | Plano estruturado próprio, entregue depois deste ciclo (seção 9) |

Abordagens descartadas: aprovar uma tela de referência no playground antes de tocar nos
componentes (demora a aparecer no app); ciclo único com um commit no final (difícil de
revisar e de corrigir o rumo); Fluent 2 refinado ou Material 3 Expressive como
personalidade.

## 3. Linguagem visual

Oito regras. Cada uma vale para todos os componentes do escopo e é verificável.

### 3.1 Camadas

- O fundo da tela é `low` (ausência de `data-layer` conta como `low`).
- Peças de estrutura declaram `data-layer="medium"` e usam `bg-structure`: barra de
  título, `Sidebar`, `Toolbar`, `ActionBar`, `Tabs.List`, cabeçalho de `Table`/`DataTable`,
  cabeçalho de `Inspector`, `FilterBar`.
- `Card.Root` ganha `emphasis?: "low" | "medium"` (padrão `low`). `low`: `bg-surface` com
  borda, sem `data-layer`. `medium`: `bg-structure`, `data-layer="medium"`. `high` não
  existe em `Card`: o destaque vem da ação dentro dele.
- A tela escolhe o `emphasis` dos cards pela medição; a lib não tenta acertar o orçamento
  sozinha.

### 3.2 Cor

- Preenchimento da marca só em `emphasis="high"`, no máximo um por `data-budget-region`.
- Seleção (linha de tabela, item de árvore, de lista, de menu, de sidebar, aba): `bg-selected`
  mais um indicador de 2 px na cor da marca na borda inicial (na borda inferior para abas).
  Nunca bloco preenchido.
- Status: texto, ponto (`Indicator`) ou ícone com `intent`. Fundo `intent-subtle` só em
  `Alert`, `Badge`/`Tag` `medium` e `Toast`. Preenchimento `intent-fill` só em ação `high`
  destrutiva ou alerta que bloqueia.
- Todo componente com cor própria resolve as classes por `resolveEmphasis`
  (interativo) ou `restingClassName` (não interativo). Nenhuma classe de cor de intent
  escrita à mão.

### 3.3 Densidade

- `Table`, `DataTable`, `Tree`, `ReorderableList`, `LogViewer`, `DiffViewer`
  e itens de `Menu`/`ContextMenu`/`Command` nascem compactos: linha de 32 px
  (`h-control-sm` na densidade `comfortable`), texto `text-sm`.
- Números em colunas usam `tabular-nums`; caminhos, hashes e IDs usam a fonte mono.
- Formulários, `Modal` e `Drawer` ficam na densidade do tema (`comfortable`).
- A densidade do tema e o `ThemeScope density` continuam valendo: "compacto" aqui é a
  escolha do passo da escala, não um valor fixo em px.

### 3.4 Bordas e elevação

- Separação por borda de 1 px (`border-border`). `Card`, `Table`, `Inspector` e painéis
  não têm sombra.
- Sombra só em overlays: `shadow-overlay` em `Menu`, `ContextMenu`, `Popover`,
  `Input.Select`/`Combobox`/`MultiSelect`, `Command`, `Toast`; `shadow-modal` em `Modal`
  e `Drawer`.

### 3.5 Foco

Um anel único em todo elemento focável, inclusive linha de tabela, item de árvore e de
lista: `focus-visible:ring-2 ring-focus` com afastamento de 2 px (interno, `ring-inset`,
quando o elemento encosta na borda do contêiner, como linhas e abas). Nenhum
`outline-none` sem o anel.

### 3.6 Movimento

- Pressionar: `motion-press`. Hover e seleção: camada de estado com `motion-transition`.
- Ícones do catálogo dentro de controles reagem pelo gatilho herdado (D-028); mudança de
  estado usa `playKey` (ex.: copiar → check).
- Entrada e saída de overlay, toast, item de lista que aparece ou some, conteúdo de
  `Accordion` e de `Tabs`: `Presence`.
- Reordenação (`ReorderableList`, mover linha no `DataTable`, ordenar coluna): `useFlip`.
- O nível vem da ênfase (`low` = `calm`): nada com mola visível em superfícies `low`.
- Nenhum `duration-<número>`, `transition-colors|all|opacity`, `animate-*` ou `@keyframes` em
  componente; a única forma manual aceita é `duration-(--motion-duration)` com
  `ease-(--motion-ease)` para propriedades que não são cor (D-024). (As
  ocorrências achadas na auditoria saem neste ciclo; `Loader` e `Skeleton` usam as
  primitivas de movimento).

### 3.7 Estados

Cada componente cobre o que precisa, pela tabela da `dettmann-ui-improve`:

| Estado | Quem precisa |
|---|---|
| carregando | `Button`, `DataTable`, `Table`, `Tree`, `ReorderableList`, `MediaImage`, `Inspector`, `Command` |
| vazio | `DataTable`, `Table`, `Tree`, `ReorderableList`, `Command`, `LogViewer`, `DiffViewer`, `FilterBar` (sem resultado) |
| erro | família `Input`, `MediaImage`, `FileDropzone` |
| desabilitado | todo controle; sempre `bg-sunken` + `text-fg-subtle`, nunca só opacidade |

Textos embutidos continuam sobreponíveis (D-009).

### 3.8 Logo (app)

`frontend/src/shell/TitleBar.tsx` troca o `<img>` por um elemento com `role="img"`,
`aria-label` do nome do app, `mask-image` do PNG e `bg-fg`. O PNG branco vira só a forma.

## 4. Variações novas

### 4.1 `Input.Select multiple`

```tsx
<Input.Root name="tags" value={tags} onChange={setTags}>
  <Input.Label>Categorias</Input.Label>
  <Input.Box>
    <Input.Select multiple options={options} placeholder="Escolha…" />
  </Input.Box>
</Input.Root>
```

- `multiple?: boolean` no `Input.Select`. Com ele, o valor do `Input.Root` é `string[]`.
- Menu: o mesmo listbox ancorado, com `aria-multiselectable`. Cada opção mostra uma caixa
  de marcação à esquerda; marcar não fecha o menu.
- Teclado: igual ao simples, com Enter/Espaço alternando a opção ativa; Esc/Tab fecham
  mantendo o que foi marcado (a mudança já foi emitida a cada alternância). Typeahead só
  move o item ativo quando aberto; fechado, não altera o valor.
- Gatilho: rótulos das opções marcadas como `Tag` na ordem das opções; quando não cabem
  numa linha, mostra as que cabem e um contador `+N`. `selectedText?: (count) => string`
  permite o resumo "3 selecionados" no lugar das tags.
- `maxSelected?: number`: ao atingir, as opções não marcadas ficam desabilitadas.
- Formulário nativo: um `<input type="hidden">` por valor, com o mesmo `name`.
- `Input.MultiSelect` não muda de API; só recebe o redesenho da onda 1.

### 4.2 `Input.Password`

```tsx
<Input.Root name="apiKey" value={key} onChange={setKey}>
  <Input.Label>Chave da API</Input.Label>
  <Input.Box>
    <Input.Password autoComplete="off" />
  </Input.Box>
</Input.Root>
```

- Miolo da família `Input`, ao lado de `Input.Field`. Renderiza `<input>` com
  `type="password"` (ou `text` quando revelado) e, no fim da caixa, um botão `low` com
  `EyeIcon`/`EyeOffIcon` e `aria-pressed`.
- Props: `revealed`/`defaultRevealed`/`onRevealedChange` (controlado e não controlado);
  `hideOnBlur?: boolean` (padrão `true`: volta a mascarar quando o foco sai do campo e do
  botão); `revealLabel`/`hideLabel` (padrões em inglês, D-009); `revealable?: boolean`
  (padrão `true`; `false` remove o botão, para dado que nunca deve aparecer).
- Padrões do `<input>`: `autoComplete="current-password"`, `spellCheck={false}`,
  `autoCapitalize="off"`. O consumidor troca para `new-password` ou `off`.
- O botão não entra na ordem de submissão (`type="button"`) e não rouba o cursor: depois
  de alternar, o foco volta ao campo com a seleção preservada.
- Serve para qualquer dado sensível (senha, token, chave); o nome segue o `type` do HTML.

## 5. Escopo por onda

Só o que o `frontend/src` importa hoje. Cada onda muda a lib e ajusta o app no mesmo
commit.

| Onda | Nível | Componentes |
|---|---|---|
| 1 | átomos e moléculas de entrada | `Button`, `ButtonGroup`, `Input` (Field, Textarea, Select, Combobox, MultiSelect, Number, **Password**, **Select multiple**), `Checkbox`, `Radio`, `Switch`, `SegmentedControl`, `StatusToggle`, `Badge`, `Tag`, `Indicator`, `Kbd` |
| 2 | moléculas de feedback e overlays | `Alert`, `Toast`, `Modal`, `Drawer`, `Menu`, `ContextMenu`, `Popover`, `Command`, `Progress`, `Stepper`, `Skeleton`, `Loader` |
| 3 | organismos de dados | `Table`, `DataTable` (com `DataTableColumnPicker`, ordenação, mover linha), `Tree`, `ReorderableList`, `Tabs`, `Accordion`, `Inspector`, `FilterBar`, `DiffViewer`, `LogViewer`, `MediaImage`, `Lightbox`, `FileDropzone` |
| 4 | estrutura, templates e telas | `Sidebar`, `Toolbar`, `ActionBar`, `Card` (`emphasis`), `EmptyState`, `FeaturedIcon`, primitivos que precisarem (`Typography`, `Stack`, `Inline`, `Icon`); no app: logo, orçamento tela a tela, micro-interações que faltam, densidade das listas |

Em cada componente, o trabalho é o mesmo: aplicar as regras 3.1 a 3.7, remover os achados
da auditoria (movimento manual, `opacity-*` em desabilitado, lucide solto com equivalente
no catálogo, valores arbitrários) e cobrir com teste.

Mudança de API é permitida quando a regra exigir (a v2 é de ruptura, D-012) e entra em
`docs/migration.md` com a substituição; o app é ajustado na mesma onda.

## 6. Arquitetura

Sem camada nova. O que muda:

- `src/theme/emphasis.ts` continua a única fonte de classes de cor. Se um componente
  precisar de uma combinação que a tabela não tem (ex.: item selecionado), ela entra
  como função nomeada nesse arquivo, não como classe local.
- Um recipe compartilhado para "linha selecionável" (altura compacta, camada de estado,
  indicador de seleção, anel interno) em `src/core/styles`, usado por `Table`, `DataTable`,
  `Tree`, `ReorderableList`, `Menu`, `ContextMenu`, `Command` e itens da
  `Sidebar`. Evita oito cópias da regra 3.2.
- O mesmo para o anel de foco (3.5): um utilitário único em `tokens.css`
  (`focus-ring` e `focus-ring-inset`), no lugar das variações escritas por componente.
- Dependência entre componentes segue D-032 (átomo não importa molécula). O teste de
  camadas da seção 7 verifica.

## 7. Testes e validação

Por onda, antes do commit:

1. **Lib**
   - Testes por componente: estados da regra 3.7, teclado, `data-layer` e
     `data-budget-region` esperados.
   - `emphasis-adoption.test.tsx` passa a cobrir os componentes da onda: nenhum usa
     classe `intent-*`/`brand`/`danger` etc. fora de `resolveEmphasis`/`restingClassName`.
   - `legacy-motion.test.tsx` passa a falhar para qualquer movimento manual nos
     componentes da onda.
   - Teste novo de níveis (D-032): mapa `componente → nível` e verificação dos imports.
   - `npm run verify`, `npm run theme`, `npm run build`.
2. **App**: `npm --prefix frontend run typecheck`, `npm --prefix frontend test`,
   `go vet ./... && go test ./...`, `wails build`.
3. **Visual**: capturas das telas afetadas, tema claro e escuro, com a medição do
   `BudgetInspector` de cada uma. A onda 4 mede todas as telas.
4. **Auditoria**: `dettmann-ui-improve` sobre os componentes da onda e as telas tocadas;
   sem P1.

## 8. Documentação a atualizar

- `dettmann-ui-vnext/docs/decisions.md`: D-032 (Design Atômico e regra de dependência),
  D-033 (linguagem visual: as regras da seção 3), D-034 (`Input.Select multiple` e
  `Input.Password`), mais as que surgirem por onda.
- `docs/component-matrix.md` (nível de cada componente, variações novas),
  `docs/migration.md` (mudanças de API), `docs/ai-contract.md` e `docs/anti-patterns.md`
  quando uma regra virar contrato.
- Skills `dettmann-ui-use` e `dettmann-ui-author` (regras da seção 3, recipe de linha,
  níveis atômicos) e `dettmann-ui-improve` (heurísticas novas); `npm run skills:install -- ..`.
- App: `mod-orchestrator-spec-v2/docs-ia/decisoes.md`, D108 (redesenho dos componentes,
  logo por máscara, orçamento por tela) e os documentos `ui/` afetados.

## 9. Fora do escopo deste ciclo

- Componentes que o app não usa: `Avatar`, `Breadcrumbs`, `Carousel`, `DatePicker`,
  `Calendar`, `EmptyPlaceholder`, `FileBrowser`, `FileList`, `FloatingButton`, `Gallery`,
  `MediaGallery`, `MasterDetail`, `PageContainer`, `Pagination`, `Rating`, `ResourcePage`,
  `Section`, `Slider`, `SplitPane`, `Surface`, `Workspace`, `AppShell`, `Navbar`,
  `ConfirmDialog`, `Input.Pin`, `List`, `Tooltip`. Só são tocados se uma mudança compartilhada (recipe de
  linha, anel de foco) os atingir, e nesse caso continuam passando nos testes atuais.
- **Plano de crescimento do catálogo**: documento próprio
  (`docs/plans/` ou `docs/specs/`), escrito depois da onda 4, com as lacunas achadas neste
  ciclo, critérios de entrada de componente novo e ordem por nível atômico.
- Mudança no motor de temas, nas sementes ou nos presets; regra de negócio no app.
