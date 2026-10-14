# dettmann-ui v2 — estado da lib e plano de crescimento do catálogo

Data: 2026-10-13. Fecha o subprojeto 3 (redesenho dos componentes, spec
`docs/specs/2026-10-09-v2-components-design.md`, seção 9) e serve de entrada para o plano
de implementação do redesign das telas do Mod Orchestrator
(canvas "Redesign das telas do Mod Orchestrator", design v1 aprovado).

## 1. Estado da lib

### 1.1 Entregue

| Onda | Commit | Decisões | Conteúdo |
|---|---|---|---|
| 1 | `bbe6511`, `168c4de` | D-032 a D-034 | Controles e família `Input`; `Input.Select multiple`; `Input.Password`; `focus-ring*`; `rowRecipe`; testes `wave-contract` e `atomic-levels` |
| 2 | `83acaaf` | D-035 | `Alert`, `Toast`, `Modal`, `Drawer`, `Menu`, `ContextMenu`, `Popover`, `Command`, `Progress`, `Stepper`, `Skeleton`, `Loader`; saída animada de overlays (`useExitPresence`) |
| 3 | `63ca0d0` | D-036 | `Table`, `DataTable`, `Tree`, `ReorderableList`, `Tabs`, `Accordion`, `Inspector`, `FilterBar`, `DiffViewer`, `LogViewer`, `MediaImage`, `Lightbox`, `FileDropzone` |
| 4 | `0d7305d` | D-037 | `Card` (`emphasis`), `Toolbar`, `ActionBar`, `Sidebar`, `EmptyState`, `FeaturedIcon`; no app, logo por máscara e camadas do shell |

Validação no fim da onda 4: 1797 testes da lib, `theme` (inclui `theme:lint`), build; no
app, typecheck, 90 testes, `go vet`, `go test` e `wails build`.

### 1.2 O que a lib garante hoje

- **Contrato por arquivo.** Todo arquivo em `WAVE_FILES` (`src/__tests__/wave-contract.test.ts`)
  é barrado se usar sombra fora de overlay, opacidade para desabilitado, raio genérico,
  movimento manual, foco escrito à mão ou lucide com equivalente no catálogo.
- **Níveis atômicos.** `src/__tests__/atomic-levels.test.ts` classifica toda pasta e
  barra import de nível acima (D-032).
- **Peças compartilhadas.** `rowRecipe` (linha selecionável), `focus-ring`,
  `focus-ring-inset`, `focus-bare`, `intentIcon`, keyframes de overlay, `useExitPresence`.

### 1.3 Fora do redesenho (ainda na adaptação mínima da fundação)

Componentes que o app não importava em 2026-10-09 e por isso não entraram em `WAVE_FILES`:
`Avatar`, `Breadcrumbs`, `Carousel`, `DatePicker`, `Calendar`, `EmptyPlaceholder`,
`FileBrowser`, `FileList`, `FloatingButton`, `Gallery`, `MediaGallery`, `MasterDetail`,
`PageContainer`, `Pagination`, `Rating`, `ResourcePage`, `Section`, `Slider`, `SplitPane`,
`Surface`, `Workspace`, `AppShell`, `Navbar`, `ConfirmDialog`, `Input.Pin`, `List`,
`Tooltip`. Qualquer um deles que uma tela nova passe a usar entra primeiro no redesenho
(seção 3, passo 2), não direto na tela.

### 1.4 Pendências registradas

| # | Pendência | Por que ficou | Quando resolver |
|---|---|---|---|
| P1 | Medir o orçamento 60/30/10 nas telas com jogo (Mods, Plugins, Conflitos, Perfis, Diagnóstico) | O ambiente de desenvolvimento não tem jogo gerenciado; as telas vão mudar com o redesign | No fim de cada tela do redesign, como critério de aceite da tela |
| P2 | Passada de micro-interações nas telas (`Presence` em listas que ganham/perdem itens, `playKey` em mudança de estado, feedback de ação) | As telas atuais serão substituídas pelo redesign; refazê-las agora seria retrabalho | Dentro do plano de implementação do redesign, tela a tela |
| P3 | Revisão independente das ondas 2, 3 e 4 | O revisor caiu no limite de uso; houve só revisão do autor | Antes da primeira release (V1.0), sobre o diff `168c4de..0d7305d` |
| P4 | Achados menores da revisão da onda 1 (12 itens; relatório `onda1-relatorio.md`) | Classificados como menores e adiados | Junto do primeiro componente novo que tocar o arquivo afetado |
| P5 | Preenchimento marcado de `Checkbox`, `Switch`, `Radio` e da caixa do `Select multiple` escreve classes de intent fora de `emphasis.ts` (exceção anotada na D-033) | Exigia função nova na tabela central | Primeira mudança em `emphasis.ts` |
| P6 | Não conferido no navegador: `DataTable` virtualizado (mais de 100 linhas) com reordenação animada, arrastar linha, `Tree`, `Drawer`, `Popover`, `ContextMenu` | O painel do navegador só captura com a janela visível | Primeira tela do redesign que usar cada um |

Decisão do usuário em 2026-10-13: o orçamento medido nas telas sem jogo (low 72% a 75%,
medium 25% a 28%) foi **aceito** para esse estado (D111 do app).

## 2. De onde vem a demanda por componentes novos

Por ordem de prioridade:

1. **Redesign das telas** (design v1). As telas cobertas: mapa de navegação, biblioteca
   de jogos, início global, adicionar jogo (suportados, personalizados, importar de
   Vortex/MO2), visão geral do jogo, Mods (lista, aninhada, abas), detalhe do mod (resumo,
   conflitos, arquivos, histórico, instalação), organização (categorias, tags), fila de
   instalação, FOMOD, conflitos, plugins, ordem de carga, ajustes da instância e três
   espaços reservados (downloads, inspetor de assets, extensões). **A lista dos
   componentes que cada tela pede ainda não foi extraída do canvas**: é o primeiro passo
   do plano de implementação (seção 4).
2. **Componentes da seção 1.3** que uma tela nova passar a usar.
3. **Lacunas achadas pela `dettmann-ui-improve`** (seção "Padrões que deveriam virar
   componente" do relatório) em cada tela concluída.

## 3. Como um componente novo entra

Um componente só entra na lib se passar nos quatro critérios:

1. **Genérico**: não carrega termo nem regra do domínio de mods (D-006). Se só faz
   sentido no Mod Orchestrator, é composição local na tela.
2. **Recorrente**: aparece em pelo menos duas telas do design, ou em uma tela e já foi
   reescrito à mão em outro projeto.
3. **Sem equivalente**: nenhum componente existente resolve com uma prop ou um slot a
   mais (estender vem antes de criar).
4. **Tem nível**: cabe em átomo, molécula, organismo ou template sem importar de cima.

Ciclo por componente (skill `dettmann-ui-author`):

1. **Ficha** de meia página no plano: nível, API (props públicas com tipos), estados
   (carregando, vazio, erro, desabilitado: os que fizerem sentido), teclado, o que ele
   **não** faz, e as telas que o usam.
2. **Testes primeiro**: estados, teclado, `data-layer`/`data-intent`, controlado e não
   controlado, nome acessível; o arquivo entra em `WAVE_FILES` e a pasta em `LEVELS`.
3. **Implementação** só com as peças compartilhadas (`rowRecipe`, `focus-ring*`,
   `resolveEmphasis`, `Presence`, `useFlip`, `intentIcon`). Peça nova compartilhada entra
   antes, com teste próprio.
4. **Playground**: um exemplo no painel do nível correspondente, claro e escuro.
5. **Docs**: `component-matrix.md`, decisão em `decisions.md` quando houver escolha de
   contrato, skills `dettmann-ui-use`/`dettmann-ui-author` e `npm run skills:install -- ..`.
6. **Validação**: `npm run typecheck && npm test -- --run && npm run theme && npm run build`.

Ordem de construção: sempre de baixo para cima (átomos que faltam, depois moléculas,
organismos e templates), e dentro de cada nível pelo número de telas que dependem dele.
Assim nenhuma tela começa com componente pela metade.

## 4. Próximos passos

1. Extrair do canvas a lista de componentes por tela e classificar cada um: já existe,
   existe e precisa de prop/slot, sai da seção 1.3, ou é novo.
2. Para os novos, aplicar os critérios da seção 3 e escrever as fichas.
3. Ordenar por nível e dependência; agrupar em lotes que caibam num commit.
4. Só então começar as telas, cada uma fechando com P1 e P2 da seção 1.4 e com a
   auditoria `dettmann-ui-improve` sem P1.
