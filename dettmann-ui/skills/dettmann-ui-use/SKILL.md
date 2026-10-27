---
name: dettmann-ui-use
description: Use when building, styling, theming, animating or reviewing UI in a project that imports "dettmann-ui" — screens, dialogs, buttons, cards, menus, sidebars, dashboards, themes, colors, motion. Também quando pedirem para criar/ajustar tela, tema, cor, botão, card, menu lateral, animação, "dar vida", "deixar mais bonito" ou revisar uma tela num projeto que usa dettmann-ui.
---

# dettmann-ui — uso em projeto consumidor

## Princípio

A lib decide cor, raio, densidade e movimento. A tela decide **quanto** cada
elemento chama atenção (`emphasis`) e **o que significa** (`intent`). Se você está
escrevendo cor, duração ou um componente genérico no projeto, parou de usar a lib.

Consulte a API em `node_modules/dettmann-ui` (tipos) antes de usar uma prop. Não
invente props nem valores: os tipos são a fonte.

## Ênfase (`emphasis`) — tabela de decisão

| Elemento | `emphasis` | Observação |
|---|---|---|
| A ação principal da região (Salvar, Criar, Implantar) | `high` | **Uma por região.** Sem `intent` vira `brand`. |
| Ação secundária, padrão de controles | `medium` (padrão) | Omitir a prop = `medium`. |
| Terciária, cancelar, ícone de toolbar, ação destrutiva fora do foco | `low` | Ex.: `emphasis="low" intent="danger"` para Excluir. |
| Destrutiva que **é** a ação principal (diálogo de confirmação de exclusão) | `high` + `intent="danger"` | Continua sendo o único `high` da região. |

Regiões: `Modal.Footer`, `Toolbar`, `ActionBar`, ações do `ResourcePage`
(`data-budget-region`). Dois `high` numa região = erro; em dev o console avisa
`[dettmann-ui] budget: N high-emphasis elements`.

## Intent

Valores válidos, só estes: `neutral` (padrão) · `brand` · `accent` · `info` ·
`success` · `warning` · `danger`. Em `intent` não existem `primary`, `secondary`,
`error`, `tone`, `variant="destructive"` (nomes da v1 ou de outras libs) — erro de tipo.
Ainda restam props legadas, pendentes do subprojeto 3: o `variant` do `Alert`
(`default|info|success|warning|danger`; prefira `intent`, que o sobrepõe) e as
props `bg`/`color` de `Box` e `color` de `Divider` (aceitam `primary`/`secondary`).
Não as use em código novo: pinte com `intent`, `Surface` e papéis (`bg-surface`...).

- Status (`info/success/warning/danger`) só para **significado** (estado, risco,
  variação). Nunca para "dar cor" à tela.
- `brand` é o 10%; `accent` é o segundo 10% (novidade, realce), raro.
- Texto/ícone com significado: `<Typography intent="success">`, `<Icon intent="danger">`.

## Orçamento 60/30/10

- 60 `low`: canvas, superfícies, texto. 30 `medium`: estrutura (Sidebar, Toolbar,
  Tabs, cabeçalho de tabela nascem `medium`). 10 `high`: ação principal, foco, seleção.
- `<BudgetInspector />` (exportado da lib) mede a fatia de tela por camada; meta
  ±8 p.p. em low/medium e high ≤ 12%. Coloque-o na raiz em dev; ele e a guarda do
  console só rodam em dev (`isDev()`), em produção renderizam `null`.

## Movimento

- Nível vem da ênfase: `low`→`calm`, `medium`→`responsive`, `high`→`expressive`,
  sempre limitado pelo teto do tema (`motion` do `ThemeConfig`).
- `<MotionScope level="responsive">` define o nível de uma subárvore para quem
  **não** tem ênfase própria: ícones, `Surface interactive`, utilitários
  `motion-transition`/`motion-press`, `Presence`, `animate()`, `useMotion()`.
- Um `Button` dentro de `MotionScope` **mantém** o movimento da sua ênfase (intent
  explícito por elemento vence). Para mudar um elemento, use a prop `motion`:
  `<Button emphasis="high" motion="calm">`.
- "Dar vida" = estados (hover/press/foco/seleção), `Presence` em listas que entram
  e saem, `useFlip` em reordenação, `MotionScope level="responsive"` na região. Não
  suba para `expressive` sem motivo (é do `high`); não escreva `transition: 200ms`,
  `duration-300`, keyframes próprios.
- Redução de movimento é automática (`prefers-reduced-motion` e
  `:root[data-reduce-motion="true"]`): primitivas e CSS da lib viram fade curto.
  Não reimplemente a checagem; só use as primitivas.

## Ícones e loaders

- Ícone existe no catálogo (`dettmann-ui/icons`: `TrashIcon`, `CheckIcon`, `RefreshIcon`…) →
  use o ícone próprio; senão `<Icon icon={X} />` (lucide). Nunca lucide solto.
- Ícone dentro de um controle (`Button`, item de menu, aba…) já anima sozinho com a
  ênfase do controle: não escreva hover/press para ele. Só `trigger="none"` desliga.
- Mudança de estado (copiou, salvou, contagem mudou) → `playKey={valor}`: toca de novo
  quando muda (não na montagem); mudanças de `playKey` são ignoradas enquanto `loop` está ativo.
- Estado contínuo (implantando, sincronizando) → `loop` no ícone narrativo
  (`<RocketIcon loop />`). Se é o **único** indicador, ponha texto de status ao lado
  (ou `label`): movimento sozinho não basta.
- Espera genérica → `<Loader variant="arc|dots|pulse|bars" label="…" />`; `Spinner` não
  existe mais.
- Nunca force `data-motion="expressive"` para "animar mais": a intensidade vem da
  ênfase do controle (`amp`). Para mudar, use a prop `motion` do controle.
- Raiz `dettmann-ui` exporta só `Loader`, `defineIcon` e tipos; ícones vêm de
  `dettmann-ui/icons`.

## Tema

```tsx
import { ThemeProvider, createTheme, type ThemeConfig } from "dettmann-ui";

const roxo: ThemeConfig = { id: "roxo", label: "Roxo", brand: "#7c3aed" };
// "roxo mais presente": vibrance (0..1), accent, neutral — nunca hex por papel.
// const roxo = { ...base, vibrance: 0.75, accent: "#e879f9" };

createTheme(roxo).warnings; // [] esperado; verifique num teste ou no console

<ThemeProvider theme={roxo}>…</ThemeProvider>
// ou registro selecionável: <ThemeProvider themes={{ roxo }} defaultTheme="roxo">
```

- `brand` é a única semente obrigatória; o motor gera light **e** dark com contraste
  resolvido. Botões: `accent`, `neutral` (`cool|neutral|warm`), `vibrance`,
  `contrast` (`standard|high`), `shape` (`precise|balanced|soft`), `density`
  (`compact|comfortable|spacious`), `motion`, `font`.
- Presets: `orchestrator` (padrão), `forest`, `graphite`, `ember`, `ink`.
- `overrides` (por nome de papel) é último recurso; nunca CSS com `--ui-*` à mão.
- `<ThemeScope theme? mode? density? motion?>`: subárvore com outro tema/modo/
  densidade/movimento. Sempre emite `data-theme` e `data-motion` e herda o modo
  forçado do escopo de fora.
- Overlays (`Modal`, `Popover`, `Menu`, `Tooltip`… via `Portal`) herdam tema, modo,
  densidade, movimento e `tune` do escopo. Em `createPortal` próprio, envolva com
  `<OverlayScope>`.

## Composição

Monte telas com slots e primitivas: `Card.Root/Header/Title/Body/Footer`,
`Modal.Root/Content/Header/Title/Body/Footer`, `Stack`, `Inline`, `Surface`,
`Typography`, `Icon`, `Badge`, `Sidebar`, `Toolbar`, `ResourcePage`.

Escolha de opção: `Input.Select` (custom, comportamento MD3 — não use `<select>` nativo);
opções aceitam `icon` e `description`, e `{ label, options }` vira grupo. Precisa
de busca → `Input.Combobox`. Várias de uma lista fixa → `Input.Select multiple`
(valor `string[]` no `Input.Root`; `maxSelected`, `selectedText`, `moreLabel`);
várias com busca → `Input.MultiSelect`. Em teste, clique no `combobox` e na
`option` (não há `selectOptions`).

Dado sensível (senha, token, chave): `Input.Password` (botão de olho embutido,
`hideOnBlur`, `revealLabel`/`hideLabel` via i18n). Nunca `Input.Field type="password"`
com botão de revelar escrito à mão.

Feedback e overlays (D-035): `Alert.Root` e toasts já mostram o ícone do intent
(`icon={null}` no `Alert.Root` para só texto); `Modal`/`Drawer` animam entrada e
saída sozinhos (não envolva em `Presence`); `Command` tem `loading`/`loadingLabel`;
item destrutivo de `ContextMenu` é `destructive: true`, nunca classe de cor.

Casca do redesign (D-038): área com cor própria (espaço de um jogo) = `<ThemeScope theme={withSeed(configDoApp, corDoJogo, id)}>`,
nunca cor local. Cor escolhida pelo usuário (categoria, tag) = paleta categórica:
`data-category="<cor>"` (ou a prop `color` de `Avatar`), ids em `CATEGORY_COLORS`;
não use intent de status para isso. Botão só com ícone: `aria-label` obrigatório,
`tooltip` com o mesmo texto, e `badge`/`progress` são decorativos (`badge` `true` = ponto: "algo roda", D-043) (o nome acessível
diz a contagem ou o valor). Chip de número no cabeçalho = `Indicator variant="chip"`.
Monograma de jogo = `Avatar shape="square"` com `label`. Dica ou aviso de uma linha
com ação = `Alert.Root compact action onDismiss dismissLabel`. Menu lateral com
contagem e atenção = `Sidebar` (`count`, `countLabel`, `attention`, `footer` como
função de `{ collapsed }`); app de desktop = `AppShell layout="topbar"` +
`Navbar size="compact" windowControls`.

Conteúdo do redesign (D-039): número com rótulo (KPI) = `StatTile` (`StatTile.Grid`);
filtro que liga e desliga, com contagem = `FilterChip` (`FilterChip.Group type`); para
visões de uma lista continue com `SegmentedControl`. Escolher cor ou ícone =
`SwatchPicker` com `renderSwatch`. Linha de ajuste = `SettingRow` (`controlId` liga o
rótulo ao controle). Selo de categoria/tag = `Tag color icon`. Proporção por tipo =
`Progress.Stacked`. Lista de feed ou resumo com ações = `List.Root selectionMode="none"`
com `List.Item title description meta actions unread`; grupos = `List.Group`.

Estrutura (D-037): `Card.Root` usa `emphasis` (`low` padrão; `medium` = estrutura),
`interactive` e `selected`; não existe mais `variant` nem sombra em cartão. O
orçamento 60/30/10 se ajusta trocando área entre `low` e `medium` (`Card emphasis`,
`Toolbar`, `FilterBar`, `ActionBar`), nunca com cor local.

Dados (D-036): `DataTable` já vem com linhas de 32 px (28 em `density="compact"`; 54 em `density="relaxed"` para nome com tags embaixo, D-040) e
anima reordenação, ordenação e filtro sozinho; não passe `rowHeight` nem envolva
linhas em `useFlip`. Textos embutidos sempre por i18n: `FilterBar filtersLabel`,
`ReorderableList labels`, `DataTable labels`, `Tree labels`.

Linguagem visual (D-033, "ferramenta profissional densa"): sem sombra fora de
overlay, separação por borda de 1 px, seleção = `bg-selected` + indicador da marca,
desabilitado por tokens, foco só por `focus-ring`/`focus-ring-inset`. Em controle
próprio da tela, use esses utilitários; não escreva `focus-visible:ring-*`.

**Faltou componente** (ex.: card de estatística):

1. Componha **dentro do arquivo da tela**, só com primitivas e papéis
   (`text-fg-muted`, `intent=…`), sem cor local.
2. Se o pedido é reutilizável/genérico ("vamos usar em outras telas"), **não** crie
   `src/components/StatCard.tsx` no projeto: é um componente paralelo. Diga ao
   usuário que é lacuna da lib e que deve ser feito com a skill
   `dettmann-ui-author` dentro da `dettmann-ui`; entregue a composição local até lá.

Não invente conteúdo (contadores, nomes, títulos de exemplo): use só dados que a
tela já tem ou deixe a prop vazia.

## Proibido

- hex/`rgb()`/`hsl()` e paleta crua (`bg-red-500`, `text-white`, `bg-[#…]`).
- Duração/raio/sombra arbitrários (`duration-300`, `rounded-[10px]`).
- Ícone lucide solto (catálogo `dettmann-ui/icons` primeiro; senão `<Icon icon={X} />`); `Spinner` (use `Loader`).
- Mais de um `high` por região; status como decoração.
- Componente genérico paralelo no projeto; props ou valores que os tipos não têm.

| Racionalização | Realidade |
|---|---|
| "É só um componente pequeno no projeto" | Duas fontes de verdade; vai para a lib. |
| "`primary`/`destructive` é o padrão de toda lib" | Aqui é `emphasis` × `intent`. |
| "Precisa de vida, então `expressive`" | Vida = estados e `responsive`; `expressive` é do 10%. |
| "Um hex rápido para o roxo" | `brand`/`vibrance`/`accent` no `ThemeConfig`. |
| "Forço `data-motion` para o ícone mexer mais" | A amplitude é `amp` do nível do controle; ajuste a ênfase ou `motion=`. |
| "O `loop` já mostra que está carregando" | Sem texto de status é só movimento; reduzido vira pulso. Adicione texto. |

## Checklist de revisão de tela

- [ ] Light **e** dark conferidos.
- [ ] `<BudgetInspector />` dentro da meta; nenhum aviso `budget` no console.
- [ ] Um `high` por região; status só com significado.
- [ ] Busca no diff: sem hex/rgb/paleta crua/duração ou raio arbitrário.
- [ ] Foco visível; ações com nome acessível; seleção não só por cor.
- [ ] Overlays: foco preso, `Escape` fecha; menus/árvores/listas com teclado.
- [ ] Estados loading, vazio, erro, desabilitado e destrutivo explícitos.
- [ ] Movimento só por primitivas/escopos; nada de `transition` manual.
- [ ] Ícones do catálogo onde existem; `loop` com texto de status; `Loader` em vez de `Spinner`.
- [ ] Nenhum componente genérico novo no projeto; typecheck do projeto verde.

Fidelidade às pranchas (D-040): a prancha aprovada é a especificação da tela. Tela do espaço do jogo = `ResourcePage layout="workspace"` (título, `meta` com chips e ações numa linha de 76 px). Linha densa com switch = `Switch size="xs"`; tag do usuário embaixo do nome = `Tag size="xs" dot color`. Modal de detalhe: `Modal.Content size="custom"` com a medida da prancha, `Modal.Header layout="stacked"` + `Tabs size="sm"`, `Modal.Title size="lg"`, `Modal.Footer size="sm"` (linha de status). KPI de painel = `StatTile size="lg"` (`outlined` quando pede atenção); tabela de 48 px = `Table density="relaxed"`; árvore com colunas = `Tree variant="rows"`; chip de categoria = `Tag shape="rounded"`; "+ tag" = `TagAdd`. Assistente: `Modal.Header layout="bar"`, `Alert band` sob o cabeçalho, `Modal.Body padding="none"` com colunas próprias, `Stepper variant="list"`, opções em `Radio.Item`/`Checkbox variant="row"` com selos em `action`, `Modal.Footer size="lg"`, KPI lateral `StatTile layout="inline"`. Tela de painéis divididos: `ResourcePage layout="workspace" bleed`, lista lateral `List density="pane"`; chip de status = `Indicator variant="chip" intent`; link no meio do texto = `Button size="inline"`; limite em uso = `Indicator variant="chip" lead meter`. Escolha entre fontes e partes (importação): escolha principal com descrição = `Button size="tile-lg" description`, as secundárias `size="tile"`; fonte em cartão = `Radio.Item variant="card" media`; parte de uma lista = `Checkbox variant="band" media`, linha num grupo emoldurado = `variant="band-sm"`; barra num painel afundado = `Progress track="strong"`. Marca de linha (notificação, problema) = `FeaturedIcon shape="tile" intent`; filtro de visão num painel = `FilterChip tone="neutral"`. Menu com grupos = `Menu.Separator`; item com ícone = `Menu.Item icon`; liga/desliga que não fecha = `Menu.Item checked`; item de duas linhas (nome + motivo/valor) = `Menu.Item description`, com `media` (ícone do app, avatar) e `end` (ponto de estado) (D-044); submenu ao lado = `Menu.Sub label`; filtro em uso removível = `Tag size="lg" onRemove`. Faltou algo da prancha: mude a lib, não adapte a tela.
