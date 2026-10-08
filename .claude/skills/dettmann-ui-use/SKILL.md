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
- Presets: `forest` (padrão), `graphite`, `orchestrator`, `ember`, `ink`.
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
de busca → `Input.Combobox`; várias → `Input.MultiSelect`. Em teste, clique no
`combobox` e na `option` (não há `selectOptions`).

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
- Ícone lucide solto (use `<Icon icon={X} />`).
- Mais de um `high` por região; status como decoração.
- Componente genérico paralelo no projeto; props ou valores que os tipos não têm.

| Racionalização | Realidade |
|---|---|
| "É só um componente pequeno no projeto" | Duas fontes de verdade; vai para a lib. |
| "`primary`/`destructive` é o padrão de toda lib" | Aqui é `emphasis` × `intent`. |
| "Precisa de vida, então `expressive`" | Vida = estados e `responsive`; `expressive` é do 10%. |
| "Um hex rápido para o roxo" | `brand`/`vibrance`/`accent` no `ThemeConfig`. |

## Checklist de revisão de tela

- [ ] Light **e** dark conferidos.
- [ ] `<BudgetInspector />` dentro da meta; nenhum aviso `budget` no console.
- [ ] Um `high` por região; status só com significado.
- [ ] Busca no diff: sem hex/rgb/paleta crua/duração ou raio arbitrário.
- [ ] Foco visível; ações com nome acessível; seleção não só por cor.
- [ ] Overlays: foco preso, `Escape` fecha; menus/árvores/listas com teclado.
- [ ] Estados loading, vazio, erro, desabilitado e destrutivo explícitos.
- [ ] Movimento só por primitivas/escopos; nada de `transition` manual.
- [ ] Nenhum componente genérico novo no projeto; typecheck do projeto verde.
