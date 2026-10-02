# Componentes e padrões (dettmann-ui)

Referências: D016, D022, D043; skills da lib em `dettmann-ui-vnext/.cursor/skills/dettmann-ui/` (theme-first, composition, component-authoring, ui-review); `dettmann-ui-vnext/docs/component-matrix.md`.

## 1. Regra

Toda UI usa dettmann-ui. Se falta algo **genérico**, cria-se na lib (component-authoring) com testes e documentação da lib, e o app só consome. Componentes com semântica de domínio (ex.: "linha de mod com prioridade") são **composições** no app (`frontend/src/features/<tela>/`), feitas só de peças da lib, sem estilos próprios além de layout (anti-pattern 17).

## 2. Mapeamento de necessidades → dettmann-ui

| Necessidade | Componente(s) da lib |
|---|---|
| Shell, sidebar, topbar | `AppShell`, `Sidebar`, `Navbar`, `Workspace` |
| Página com toolbar + conteúdo + inspector | `ResourcePage`, `Toolbar`, `MasterDetail`, `Inspector`, `SplitPane` |
| Tabela densa | `Table` (layout `virtual`) + `VirtualList` — ver lacuna L1 |
| Filtros e busca | `FilterBar`, `Input` (+ `Input.Select`, `Input.Combobox`, `Input.MultiSelect`), `SegmentedControl` |
| Barra de multi-seleção | `ActionBar` |
| Menus e contexto | `Menu`, `ContextMenu`, `Command` (paleta `Ctrl+K`) |
| Modais e confirmações | `Modal`, `ConfirmDialog`, `Drawer` (operações) |
| Assistentes (FOMOD, gerenciar jogo) | `Modal` + `Stepper` + `Radio`/`Checkbox` + `MediaImage`/`Lightbox` |
| Árvore de arquivos | `Tree`, `FileBrowser`, `FileList` |
| Reordenar | `ReorderableList` — ver lacuna L2 |
| Import por arrastar | `FileDropzone` |
| Status | `Badge`, `Tag`, `Alert`, `Tooltip`, `Progress`, `Spinner`, `Skeleton` |
| Vazio | `EmptyState` |
| Notificações | `Toast` + `Popover` (sino) |
| Log técnico | `LogViewer` |
| Comparação | `DiffViewer` (comparar profiles/load orders) |
| Cards (Games, Profiles, Dashboard) | `Card`, `Grid`, `Surface`, `Section` |
| Abas (Settings, Inspector, Diagnostics) | `Tabs` |
| Atalhos | `Kbd` |

## 3. Lacunas na dettmann-ui (criar na lib, não no app)

| ID | Lacuna | Uso | Fase |
|---|---|---|---|
| L1 | ✅ **resolvida na F2**: `DataTable` + `DataTableColumnPicker` na lib (`src/components/data-table`). **DataTable** genérica sobre `Table`/`VirtualList`: colunas declarativas, ordenação, redimensionar/ocultar colunas (seletor de colunas), filtro por coluna no cabeçalho, seleção múltipla (clique, Shift, Ctrl, teclado), linha focada, agrupamento com cabeçalhos recolhíveis, dezenas de milhares de linhas. A lógica de dados (filtrar/ordenar) pode ser do consumidor. | Mods, Plugins, Conflicts, Diagnostics | F2 |
| L2 | ✅ **resolvida na F5** (D071): `DataTable` com `reorderable` + `onRowsMove`: alça por linha, arraste por pointer events (várias linhas, autoscroll, indicador de destino, Esc cancela), `Alt+↑/↓` pelo teclado, tabela ocupada enquanto o consumidor valida e aplica. | Mods, Load Order | F5 |
| L3 | ✅ **resolvida na F4**: `StatusToggle` (`src/components/status-toggle`): switch compacto com estados `on`/`off`/`unavailable`/`busy`, ícone no polegar (nunca só cor), descrição do estado acessível, `aria-busy` e `aria-disabled`. | Mods, Plugins | F4 |
| L4 | ✅ **resolvida na F4**: `Indicator` (`src/components/indicator`): ícone + contagem opcional, `role="img"` com nome acessível e tom semântico. `Badge` não cobria (texto, sem nome acessível para contagem). | Mods, Plugins | F4 |
| L5 | ✅ **resolvida na F6** (D074): `Tree` com `checkedIds`/`onCheckedIdsChange` (caixa por nó; pasta marca/desmarca todas as folhas, estado misto, `Space` no nó em foco), `renderEnd` (coluna no fim da linha, ex.: select de vencedor) e `labels` (expandir/recolher/caixa traduzíveis). Lógica pura em `tree.model.ts`. | Conflicts, Inspector de Mod | F6 |
| L6 | **Visualização em grafo** (nós/arestas) para ciclos e grupos. | V1.x | — |
| L7 | ✅ **resolvida na F9** (D083): `Toast` com `action` (botão que executa e fecha). | Mods ("Também habilitar") | F9 |

Antes de cada fase, conferir a lib: a lacuna pode ter sido resolvida.

## 4. Padrões

- **Tabela** para alta densidade; **cards** só onde o item é visual e poucos (Games, Profiles, dashlets).
- **Inspector** para detalhes sem perder contexto; nunca navegar para página de detalhe de um mod.
- **Modal** só para decisões curtas, destrutivas ou assistentes; nunca para mostrar informação que caberia no Inspector.
- **Confirmação** só para destrutivo/irreversível (anti-pattern 38): remover mod, excluir profile, purge, parar de gerenciar jogo, restaurar backup. Habilitar/desabilitar/ordenar não confirmam (desfazer existe).
- **Toast** para resultado transitório; **sino** para o que precisa ser lido; **diagnóstico** para o que persiste.
- **Empty state** sempre com próxima ação.
- **Ação indisponível**: desabilitada + tooltip com motivo do backend.
- **Erros**: título humano (i18n pelo código) + "Detalhes" técnicos copiáveis.

## 5. Estados visuais padronizados

Mapeados a papéis semânticos da lib (D043), sempre com ícone:

| Estado | Papel | Ícone (lucide) | Uso |
|---|---|---|---|
| healthy / sincronizado | `success` | `check-circle-2` | deploy em dia, requisito ok |
| pending | `info` | `clock` | deploy pendente |
| warning | `warning` | `alert-triangle` | diagnósticos warning |
| blocked | `danger` | `octagon-x` | bloqueante |
| error | `danger` | `x-circle` | erro |
| disabled | `fg-disabled` | `circle-off` | mod/plugin desabilitado |
| em progresso | `brand` | `loader` (animado) | operação |
| conflito vence | `brand-text` | `arrow-up` | indicador |
| conflito perde | `fg-secondary` | `arrow-down` | indicador |
| conflito misto | `accent` | `arrow-up-down` | indicador |
| redundante | `fg-tertiary` | `equal` | indicador |

## 6. Densidade

Mostrar o suficiente para o usuário avançado sem transformar cada célula em lista de ícones: no máximo um ícone de estado por coluna; detalhes em tooltip e Inspector. Densidade `compact` disponível (setting de tema).

## 7. Revisão

Antes de concluir qualquer tela, aplicar a skill `ui-review` da lib e os critérios de aceite do documento da tela.
