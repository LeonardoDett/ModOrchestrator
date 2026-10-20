# Plano de implementação do redesign (design v1)

Status: **aprovado pelo Leonardo em 2026-10-14** ("Tudo ok"), com as recomendações da seção 6. **RD0 concluída** (D119, D120, D121). As demais decisões só valem depois de registradas em `docs-ia/decisoes.md`, cada uma na fase indicada.

Data: 2026-10-14. Convenção: um commit por fase no master, push só a pedido.

## 1. Insumos

| Frente | Documento | Commit |
|---|---|---|
| Redesign das telas | `propostas/redesign-telas-v1-fechamento.md` (telas, B1 a B16, C1 a C18, em aberto); canvas https://claude.ai/artifact/H2LwUCQTWSq7ev4ALRTZrP | `ea603a0`, `fb06cc2`, `6c26fba` |
| Desacoplamento por jogo e SDK | `docs-ia/09-proposta-multi-jogo-e-extensoes.md`, seção 0 (D112, D114, D118) | `fc358fb` |
| Lista de jogos com suporte | `propostas/2026-10-13-registro-de-jogos.md`, seção 0 (D113, D115 a D117; R5 e R6 pendentes) | `fa25df2` |
| Subprojeto de componentes | `dettmann-ui-vnext/docs/plans/2026-10-13-catalog-growth.md` (estado da lib, P1 a P6, como um componente entra) | `9a5b20f` |

Estado das telas: todas as **desenhadas** estão aprovadas (as quatro primeiras antes, as demais em 2026-10-14 com "pode fazer todas as telas", registrado em `fb06cc2`). Continuam fora as três **reservadas** (Downloads, Inspetor de assets, Extensões de usuários). Cinco pranchas foram desenhadas depois dessa liberação (`6c26fba`) e **aguardam a revisão do Leonardo**: Perfis, Diagnóstico (aba Problemas), painel de Notificações, Mods com os menus Filtros e Mais ações, e Configurações do app (aba Interface). Elas entram na RD17 e não bloqueiam as outras fases. Sem desenho ficam só abas e diálogos secundários (lista na RD17).

## 2. Regras que valem para toda fase

1. **Protocolo** (`prompts/00-protocolo.md`): resumo antes de codar (estados e fontes de verdade, invariantes, decisões, fora de escopo, **escopo de jogo**), uma camada por vez, e o fechamento com `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test` e `wails build` quando tocar UI.
2. **Escopo de jogo (D112).** Cada fase abaixo traz a linha "Sem a capability": o que acontece no `generic` (nenhum recurso opcional), no Valheim (sem `plugins` nem `load_order`) e numa instância com o recurso desligado (D115). Toda fase tem pelo menos um teste nesse caminho.
3. **Spec antes da tela.** A fase reescreve o `ui/telas/<tela>.md` a partir do artboard (formato de `ui/01-mapa-de-telas.md`) antes de mexer no `frontend/`. O canvas é a referência visual; o documento da tela é o contrato.
4. **Lib de baixo para cima.** Componente genérico nasce na `dettmann-ui-vnext` com ficha, testes e playground (`catalog-growth.md` §3). Nenhuma tela começa com componente pela metade. Peça com termo de domínio é composição em `frontend/src/features/`.
5. **Aceite de toda tela:** auditoria `dettmann-ui-improve` sem achado P1; orçamento 60/30/10 medido com jogo gerenciado (pendência P1 da lib); passada de micro-interações (pendência P2 da lib); textos em `en` e `pt-BR`; estados de página de `ui/00` §4.
6. **A UI não decide.** Nenhum `capabilities.includes(...)` novo; o que existe hoje sai na RD4.
7. **Backend sem tela nova** (RD5 a RD7, RD15) é demonstrado por teste de integração, como foram as fases R1 a R4.

## 3. Decisões novas

D119 a D121 estão registradas. Daí em diante a numeração é provisória: vale a ordem em que forem registradas.

| # | Decisão | Substitui ou emenda | Fase |
|---|---|---|---|
| D119 | **O design v1 é o layout base.** Registrada | Substitui D042 | RD0 ✅ |
| D120 | **Dois níveis: app e espaço do jogo.** Barra superior com "‹ Biblioteca", jogo, perfil, sino e ajuda; menu lateral em grupos com recolher; "Jogar" e o cartão de implantação no rodapé do menu; status e problemas viram contagem no sino | Emenda D023, D045 (Play sai da barra de título), D054 e `ui/00` §2 | RD0 ✅ |
| D121 | **Detalhe do mod em modal grande com abas**, no lugar do Inspector lateral | Emenda `ui/03` §4 ("modal só para decisão curta") | RD0 ✅ |
| D122 | **Cor de destaque por jogo** e paleta de categorias no tema. Registrada | Detalha D043 | RD2 ✅ |
| D123 | **Categoria com cor e ícone, e tags** como conceito separado; preferência de visão da lista por instância. Registrada | Detalha D026, `core/02` §9 | RD5 ✅ |
| D124 | **Fila de instalação em lote** e categoria e tags informadas junto com a instalação. Registrada | Detalha D038, D065 | RD5 ✅ |
| D125 | **Dependências entre pacotes** vindas do instalador (`Plan.Package`, ao lado de `Plan.Requirements`, que segue de arquivos). Registrada | Detalha D118; fecha `core/16` §8 | RD6 ✅ |
| D126 | **Sugestão de vencedor** em conflito: de onde vem, e que nunca cria regra sozinha; par travado. Registrada | Detalha D004, D027 | RD7 ✅ |
| D127 | **A prancha aprovada é a especificação de cada tela**; retrabalho da casca e das telas já feitas. Registrada | Emenda o método de todas as fases de tela | RD4, RD8–RD10 (retrabalho) |
| D128 | **Importar de Vortex e MO2** entra neste plano (hoje V1.x em `core/15`); copiar por padrão | Emenda D047; detalha D035, D048 | RD15 |
| D129 | **Assistente de jogo**: reconhecimento de pasta, modelos e target criável | Detalha D117 | RD14 |

### 3.1 D119, texto proposto

Registrada em `docs-ia/decisoes.md` com ajustes de redação; vale o texto de lá. O que segue é a proposta original.

> **D119 — O design v1 é o layout base das telas.** Status: vigente (substitui D042).
>
> A distribuição de telas e elementos passa a seguir o design v1 aprovado (canvas "Redesign das telas", fechamento em `propostas/redesign-telas-v1-fechamento.md`), transcrito tela a tela em `ui/telas/`. O Vortex deixa de ser a referência de layout e continua sendo a referência de fluxo e comportamento (D001); o MO2 continua a de isolamento e prioridade (D002).
>
> 1. Onde o design e o Vortex divergem, vale o design. A tabela "Divergências aprovadas" de `ui/00` §6 deixa de existir: não é mais preciso justificar diferença em relação ao Vortex.
> 2. Tela ainda não desenhada (Perfis, Diagnóstico, painel de Notificações, Ajustes globais) mantém o layout atual dentro da casca nova até ganhar artboard aprovado. Tela nova sem artboard não é implementada.
> 3. O que o design mostra e o backend não entrega não vira dado inventado: ou entra como fase com contrato, ou sai da tela (anti-pattern 18).
> 4. Continuam valendo sem mudança: a UI não decide (D021), status nunca só por cor (D043), tudo por teclado, i18n (D044), dettmann-ui obrigatória (D016).
>
> Motivo: a D042 mandava reproduzir o Vortex elemento por elemento. O redesign aprovado em 2026-10-13/14 organiza o app em biblioteca e espaço do jogo, troca o Inspector lateral por modal com abas e a toolbar de ícone e rótulo por ações só com ícone, o que a D042 classificaria como bug de UI.
>
> Mapa de impacto: `ui/00` (§1 princípio 1, §2 shell, §6), `ui/01` (colunas "Base no Vortex" e fases), `ui/02`, `ui/03` §2 e §4, todos os `ui/telas/*.md`, `docs-ia/08-paridade-vortex-v1.md` (a paridade passa a ser de recurso, não de layout), D001 (remove "reforçada por D042"), D045, D054.

## 4. Componentes da lib que o design pede

**Confirmada e corrigida pela RD1** em `dettmann-ui-vnext/docs/plans/2026-10-14-redesign-components.md`, que vale no lugar desta tabela: C10, C11 e C17 já existem, C6 vira `Indicator variant="chip"`, e entram `StatTile`, `FilterChip`, `SettingRow`, `SwatchPicker`, a paleta categórica e o monograma no `Avatar`. A tabela abaixo fica como registro da classificação inicial. "Seção 1.3" são os componentes da lib que ainda não passaram pelo redesenho e precisam passar antes de uma tela nova usá-los.

| # | Componente ou padrão | Hipótese | Lote |
|---|---|---|---|
| — | Destaque por jogo no tema | Novo no motor de tema | RD2 |
| — | `AppShell`, `Navbar`, `Workspace`, `Tooltip` | Seção 1.3: entram no redesenho | RD2 |
| C1 | Menu lateral recolhível (trilho de 60 px, dica, selos, anel de progresso) | Estender `Sidebar` | RD2 |
| C2 | Item de menu em atenção (âmbar, selo preenchido) | Prop de intent no item da `Sidebar` | RD2 |
| C3 | Cartão "Implantando" preso acima do "Jogar" | Slot de rodapé na `Sidebar`; o cartão é composição do app | RD2 |
| C4 | Sino com contagem sobreposta | Estender `Indicator` ou `Badge` sobre botão | RD2 |
| C5 | Botão só com ícone, com selo, progresso e dica obrigatória | Estender `Button` | RD2 |
| C6 | Chip de número com ícone | Novo (átomo) ou variação de `Tag` | RD2 |
| C18 | Linha de ajuda fina | Variação de `Alert` | RD2 |
| C7 | Seletor de visão e filtro rápido | `SegmentedControl` existente; conferir ícones | RD3 |
| C8 | Selo de categoria (cor e ícone) e tags em linha | Estender `Tag` com cor de paleta e ícone | RD3 |
| C9 | Paleta de 16 cores e grade de 48 ícones | Novos (seletor de cor de paleta, seletor de ícone) | RD3 |
| C10 | Linha de separador que recolhe o grupo | Agrupamento da `DataTable` (L1); conferir a linha | RD3 |
| C11 | Modal grande com abas | `Modal` + `Tabs`; tamanho novo no `Modal` | RD3 |
| C12 | Barra de proporção com legenda e contagem | Novo (molécula) | RD3 |
| C14 | Barra de ação em lote e rodapé de alterações não salvas | `ActionBar` existente; rodapé é variação | RD3 |
| C16 | Lista de arrastar com painel de explicação | `ReorderableList` ou `DataTable reorderable` + `SplitPane` (seção 1.3) | RD3 |
| C17 | Cartão de escolha grande e botão de duas linhas | Estender `Radio` (cartão) e `Button` | RD3 |
| C19 | Painel de notificações: item lido e não lido, ações na linha, dispensar | `Popover` + lista; conferir `List` (seção 1.3) | RD17 |
| C20 | Painel de filtros com grupos de chips e chips de filtro aplicado | Estender `FilterBar` | RD17 |
| C21 | Cartão de perfil com selos e rodapé de ações | `Card interactive` com slot de rodapé; os selos são composição do app | RD17 |
| C22 | Lista agrupada por gravidade com painel de evidência e ações | `MasterDetail` ou `SplitPane` (seção 1.3) + lista agrupada | RD17 |
| C23 | Linha de configuração (rótulo, descrição, controle) e seção com escopo | Novo (molécula), se a `Section` não cobrir | RD17 |
| C13 | Linha de conflito com dois vencedores, "Sugerido" e cadeado | Composição do app (termo de domínio) | RD11 |
| C15 | Opção de instalador com "Escolha anterior", imagem e descrição | Composição do app sobre `Radio`/`Checkbox`/`MediaImage` | RD10 |

## 5. Fases

Tamanho: P (até um dia), M (alguns dias), G (uma semana ou mais).

### Visão geral

| Fase | Conteúdo | Tipo | Depende de | Tam. |
|---|---|---|---|---|
| RD0 | Decisões de base e spec do shell | Docs | ok do plano | P |
| RD1 | Inventário de componentes por tela e fichas | Docs (lib) | RD0 | P |
| RD2 | Lib, lote 1: tema por jogo e casca | Lib | RD1 | M |
| RD3 | Lib, lote 2: dados e telas | Lib | RD1 | M a G |
| RD4 | Estrutura do app: dois níveis e casca | App | RD2 | M |
| RD5 | Backend: organização de mods e fila | Core | RD0 | M |
| RD6 | Backend: dependências do Valheim | Core | RD0 | P a M |
| RD7 | Backend: conflitos (sugestão, lote, travado) | Core | RD0; RD6 ajuda | M |
| RD8 | Mods: três visões, Organização e fila | Tela | RD3, RD4, RD5 | G |
| RD9 | Modal do mod (cinco abas) | Tela | RD8, RD7 | M |
| RD10 | FOMOD | Tela | RD3, RD4, RD5 | M |
| RD11 | Conflitos | Tela | RD7, RD9 | M |
| RD12 | Plugins e Ordem de carga | Tela | RD3, RD4 | M |
| RD13 | Visão geral e Ajustes da instância (R5a) | Tela | RD4 | M |
| RD14 | Nível do app: Biblioteca, Início, Adicionar jogo (R5b a R5d) | Tela + core | RD4 | G |
| RD15 | Importação de Vortex e MO2: leitura e importação | Core | RD5, RD14 | G |
| RD16 | Importação de Vortex e MO2: telas | Tela | RD15, RD3 | M |
| RD17 | Telas desenhadas depois da liberação (Notificações, menus de Mods, Perfis, Diagnóstico, Configurações), em cinco partes | Lib + tela | RD4; revisão de cada prancha | G |
| RD18 | Fechamento | Qualidade | todas | M |

Caminho mais curto até algo visível: RD0, RD1, RD2, RD4. RD5, RD6 e RD7 não dependem da lib e podem ser intercaladas com RD2 e RD3 (uma fase por vez no checkout).

### RD0. Decisões de base e spec do shell ✅

Concluída em 2026-10-14. Além dos entregáveis abaixo, foram atualizados as referências à D042 (README, anti-pattern 34, core/13, `references/`), o protocolo e as duas skills da spec.

- **Objetivo:** tirar a D042 do caminho e deixar o contrato da casca escrito.
- **Entregáveis:** D119, D120 e D121 em `decisoes.md` (D042 marcada "substituída por D119"); `ui/00` reescrito (§1, §2, §5, §6); `ui/01` com as telas novas, as renomeadas e a fase RD de cada uma; `ui/03` §2 e §4; `docs-ia/04-mapa-de-impacto.md`; ponteiro para este plano em `plano-de-desenvolvimento.md`; respostas da seção 6 registradas.
- **Dependências:** ok do Leonardo neste plano e nas perguntas 1 e 2 da seção 6.
- **Pronto quando:** nenhum documento vigente manda seguir o layout do Vortex; `ui/00` descreve os dois níveis; nenhum código mudou.
- **Sem a capability:** `ui/00` passa a dizer que grupos e itens do menu vêm do backend pelas capabilities **efetivas**; grupo sem item não aparece (é o caso de Plugins e Ordem de carga no `generic` e no Valheim).

### RD1. Inventário de componentes por tela e fichas ✅

Concluída em 2026-10-14: `dettmann-ui-vnext/docs/plans/2026-10-14-redesign-components.md`. Achados que valem para as fases seguintes estão na seção 1 dele (categorias com hierarquia no desenho; diferenças do menu do jogo entre pranchas, para a RD4; menu lateral próprio do nível do app).

- **Objetivo:** fechar a lista real de componentes antes de escrever qualquer um (passos 1 a 3 de `catalog-growth.md` §4).
- **Entregáveis:** `dettmann-ui-vnext/docs/plans/2026-10-14-redesign-components.md` com: tabela tela × componente lida do canvas (26 artboards), classificação de cada um (existe; existe e pede prop ou slot; sai da seção 1.3; novo; composição do app), ficha de meia página por componente novo, e os lotes RD2 e RD3 ordenados por nível atômico.
- **Dependências:** RD0.
- **Pronto quando:** todo artboard aprovado tem seus componentes classificados; a tabela da seção 4 deste plano está confirmada ou corrigida; cada novo passa nos quatro critérios (genérico, recorrente, sem equivalente, tem nível).
- **Sem a capability:** componente não conhece capability. A ficha de qualquer um que mostre lista ou contagem inclui o estado vazio, que é o que o `generic` exibe.

### RD2. Lib, lote 1: tema por jogo e casca ✅

Concluída em 2026-10-14: D122 no app, D-038 na lib. Lib com 1.959 testes, `theme` e build verdes; app com typecheck, 90 testes, `go test` e `wails build`.

- **Objetivo:** tudo o que a casca precisa, pronto e testado na lib.
- **Entregáveis:** destaque por jogo no motor de tema (D122; escopo CSS trocável em runtime, contraste verificado pelo `theme:lint`); `AppShell`, `Navbar`, `Workspace` e `Tooltip` passados pelo redesenho; C1 a C6 e C18; playground; `component-matrix.md`; decisões D-038 em diante na lib; skills reinstaladas.
- **Dependências:** RD1.
- **Pronto quando:** `npm run typecheck && npm test -- --run && npm run theme && npm run build` na lib; arquivos novos em `WAVE_FILES` e `LEVELS`; o app compila sem mudança de comportamento.
- **Sem a capability:** o destaque tem padrão do app para jogo que não declara cor (todo jogo personalizado). Teste: tema sem destaque declarado passa no contraste.

### RD3. Lib, lote 2: dados e telas ✅

Concluída em 2026-10-14 (D-039 na lib, sem decisão nova no app): `FilterChip`, `StatTile`, `SwatchPicker`, `SettingRow` novos; `Tag`, `Progress`, `Checkbox`, `Section` e `List` estendidos. Coube num commit.

- **Objetivo:** os componentes das telas de conteúdo.
- **Entregáveis:** C7 a C12, C14, C16, C17 conforme as fichas; `SplitPane` e outros da seção 1.3 que as fichas apontarem; pendências P4 e P5 da lib nos arquivos tocados. Pode virar dois commits (3a: C7 a C12; 3b: C14, C16, C17) se o lote ficar grande.
- **Dependências:** RD1. Independente de RD2.
- **Pronto quando:** mesma validação da RD2; pendência P6 da lib (conferir no navegador `DataTable` virtualizada com reordenação, `Tree`, `Drawer`, `Popover`, `ContextMenu`) feita para o que este lote toca.
- **Sem a capability:** não se aplica a componente; estados vazio e desabilitado cobertos por teste.

### RD4. Estrutura do app: dois níveis e casca ✅

Concluída em 2026-10-14, sem decisão nova (executa D120 e D122). Backend: `Workspace()` com grupos e cor do jogo, `MenuBadges`, `sections` no jogo gerenciado. App: casca em dois níveis com a `AppShell layout="topbar"`, menu do jogo com contagem e atenção vindas do backend, cartão de implantação e Jogar no rodapé, paleta por botão na barra, operações pelo menu Ajuda, cor do jogo por `ThemeScope`. Os três `capabilities.includes` saíram da UI. Conferida no `wails dev` com um jogo genérico de teste (nível do app, entrada no jogo, menu sem Plugins, menu recolhido de 60 px). Ficaram para as fases das telas: o título da página ainda é uma linha da casca (cada tela redesenhada traz o seu cabeçalho) e a Visão geral antiga ainda tem o próprio botão Jogar.

- **Objetivo:** o app passa a ter nível do app e espaço do jogo, com as telas atuais funcionando dentro da casca nova.
- **Entregáveis:**
  - Nível do app: casca própria e rota para Biblioteca, Início e Adicionar jogo (por enquanto com as telas atuais de Jogos e Dashboard; o conteúdo novo é da RD14).
  - Espaço do jogo: barra superior (‹ Biblioteca, jogo, perfil, sino com contagem, ajuda); menu lateral em grupos (Visão geral; Conteúdo; Setup; Saúde), recolhível com estado lembrado; Conflitos em atenção; cartão "Implantando" e "Jogar" no rodapé; destaque do jogo aplicado.
  - Backend e bridge: `Workspace()` devolve grupos, itens, selos e nível de atenção; contagem para o sino (B12); progresso da implantação para o cartão; cor de destaque na definição do jogo.
  - **A2 / R5e:** somem os `capabilities.includes(...)` de `SettingsPage.tsx`, `WorkspacePages.tsx` e `WorkaroundsTab.tsx`; o backend diz quais abas e seções existem.
  - Atalhos de `ui/00` §5 revistos; lugar do Ctrl K (pergunta 2).
- **Dependências:** RD2.
- **Pronto quando:** todas as telas atuais abrem na casca nova; teste de navegação cobre os dois níveis e o menu recolhido; `grep` por `capabilities.includes` no `frontend/src` volta vazio; os 90 testes atuais do frontend passam ou foram reescritos.
- **Sem a capability:** teste de navegação com três instâncias. `generic`: grupo Conteúdo só com Mods e Conflitos, "Jogar" só se há executável. Valheim: sem Plugins nem Ordem de carga, com "Jogar". Skyrim com `load_order` desligado (D115): Ordem de carga some, Plugins fica. `launch` desligado: "Jogar" some e o cartão de implantação continua.

### RD5. Backend: organização de mods e fila ✅

Concluída em 2026-10-14 (D123, D124; migração 0011). Feito: cor e ícone de categoria; tags definidas com cor, renomear e excluir em lote; `mods.view`; categoria, cor, ícone e tags na linha do mod; arquivos por extensão; escolhas do FOMOD legíveis no detalhe; categoria e tags na conclusão da instalação; "instalar todos"; resumo do mod (conflitos e requisitos). B7 já existia (`InstalledAt` e a data da instalação atual). A ponte e os tipos do frontend estão prontos; as telas usam na RD8 e na RD9.

- **Objetivo:** os dados que Mods, o modal do mod e o FOMOD pedem.
- **Entregáveis (domínio, aplicação, SQLite com migração 0011, bridge):**
  - B5: categoria com cor e ícone; tags (várias por mod) com cor; ambas da instância (D026). O modelo atual é árvore (`mod.CategoryTree`, com `Parent`); ver pergunta 5.
  - B6: preferência de visão por instância (Lista, Aninhada, Abas) e filtro rápido; regra de convivência com os separadores do ModOrder (pergunta 6).
  - B7: datas de instalação e de última atualização do mod.
  - B8: contagem de arquivos por extensão.
  - B9: escolhas salvas do FOMOD em forma legível (passo, grupo, opção).
  - B10: categoria e tags aceitas junto com a instalação.
  - B11: comando "instalar todos" que instala os diretos e deixa na fila os que pedem escolha.
  - B13: resumo numérico por mod (vence, perde, requisitos presentes) num retorno só.
  - D123 e D124; `core/01`, `core/02`, glossário e fontes de verdade atualizados.
- **Dependências:** RD0.
- **Pronto quando:** testes de domínio e de repositório; integração: instalar em lote com um FOMOD no meio não trava os outros e respeita o lock da instância (D038); migração 0011 testada a partir de banco na 0010.
- **Sem a capability:** vale para todo jogo. Categorias iniciais vêm de `default_categories`: no `generic` a lista começa vazia e tudo funciona. B8 foi escolhida por não depender de ContentFlags, que o `generic` não tem. B9 devolve vazio para mod sem FOMOD. Teste de integração com instância `generic` percorrendo todos os comandos novos.

### RD6. Backend: dependências do Valheim ✅

Concluída em 2026-10-14 (D125). Feito: `Plan.Package` e `Mod.Package` (campo à parte de `Plan.Requirements`, que segue de arquivos); o Valheim lê `name` e `dependencies` do manifesto, sem o pacote do framework; regras `requires` de origem metadata nos dois sentidos ao instalar, sem duplicar; `mod_requirement_missing` para pacote que nenhum mod declara; o resumo do mod conta esses pacotes. A versão é guardada, não comparada. O autor pelo nome do archive ficou fora (exigiria contrato novo). Testes: `valheim_test.go`, `integration/packages_test.go` (Valheim e `generic`); fixtures do FOMOD inalteradas.

- **Objetivo:** fechar `core/16` §8: `dependencies` do `manifest.json` viram `DependencyRule` com `source=metadata`.
- **Entregáveis:** `installer.Plan.Requirements` passa a carregar referência de pacote (nome e versão mínima), além de arquivo (D125); o adapter do Valheim lê `Autor-Nome-versão`; o casamento usa os metadados que a D118 já grava; diagnóstico de requisito ausente pelo catálogo atual; autor do mod a partir do nome do archive, se couber sem contrato novo.
- **Dependências:** RD0. Independente das telas.
- **Pronto quando:** pacote real da Thunderstore com dependências gera as regras; requisito ausente aparece em Diagnóstico e some ao instalar; reinstalar não duplica regra; o teste real opcional (`MO_E2E_VALHEIM_PACKAGE`) continua passando.
- **Sem a capability:** depende de `adapter_installers`. No `generic`, nenhum instalador declara pacote e nenhuma regra nasce (teste). No Skyrim, o FOMOD continua declarando arquivos, sem mudança de comportamento (teste de regressão com as fixtures existentes). Nome de pacote e formato `Autor-Nome-versão` ficam só em `internal/adapters/valheim`.

### RD7. Backend: conflitos (sugestão, lote, travado) ✅

Concluída em 2026-10-14 (D126). Feito: sugestão por dependência e por regra de metadados, com motivo e regra, nunca gravada; o par e o adversário trazem `suggestion` e `lock`; o travamento traz o caminho de regras pelos outros mods. B3 não precisou de comando: a regra do par já decide todos os arquivos (teste). Testes: `rules/pairs_test.go`, `integration/suggestion_test.go`.

- **Objetivo:** o que a tela de Conflitos pede além do que existe.
- **Entregáveis:**
  - B2, sugestão de vencedor (D126), conforme a resposta à pergunta 1. Proposta: sugestão calculada, nunca persistida, sempre com motivo, a partir de fatos que o backend já tem: (a) quem depende vence o requisito (`DependencyRule`); (b) regra de `source=metadata`. Sem fato, sem selo. Aceitar a sugestão é o mesmo comando de criar regra; nada é criado sozinho (D004).
  - B3: decidir todos os arquivos de um par de uma vez. Conferir se a `OrderRule` do par já cobre; se sim, só a consulta muda.
  - B4: a consulta diz qual regra decidiu o par e a partir de qual mod, para a linha travada.
  - `core/05` atualizado.
- **Dependências:** RD0; melhor depois da RD6, que dá dependências reais ao caso (a).
- **Pronto quando:** testes de domínio (sugestão determinística; aceitar sugestão que fecharia ciclo é recusado como qualquer regra, D028); INV-CON-01..04 continuam passando; meta de 500 ms com 200.000 Locations mantida.
- **Sem a capability:** vale para todo jogo, não lê nada de plugin. No `generic` sem regras de dependência não há sugestão e a tela funciona sem o selo (teste).

### RD8. Mods: três visões, Organização e fila de instalação ✅

Concluída em 2026-10-14. Feito: `ui/telas/mods.md` reescrito; cabeçalho com chips (ativos, disco) e ações só com ícone (fila com selo, importar, implantação, mais ações) e "Adicionar mods" como primário; filtro rápido Todos/Ativos/Desligados com contagem; visões Lista, Aninhada e Abas gravadas em `mods.view`; selo de categoria com cor e ícone, tags com cor e coluna "Atualizado" (tempo relativo); modal Organização (Categorias e Tags, `SwatchPicker` com as 16 cores e 48 ícones); modal da fila com "Instalar todos" e faixa de escolha pendente; busca por tag. `ModsPage.test.tsx` reescrito (inclui jogo sem categorias). Diferenças da prancha: o título fica no topo da página da casca; as tags ficam na linha do nome, porque a linha da `DataTable` tem altura fixa. A rolagem com 2.000 mods não foi medida nesta fase (a tabela continua a mesma `DataTable`); fica para a RD18.

- **Objetivo:** a tela principal do espaço do jogo.
- **Entregáveis:** `ui/telas/mods.md` reescrito; visões Lista, Aninhada e Abas; cabeçalho com chips e ações só com ícone ("Adicionar mods" em destaque; fila, importar e implantar); filtro rápido; selo de categoria e tags na linha; coluna "Atualizado"; Organização (abas Categorias e Tags, com cor e ícone); modal da fila de instalação; multi-seleção e dropzone mantidas. Menu Filtros e "Mais ações" ficam como estão hoje até a parte 17b.
- **Dependências:** RD3, RD4, RD5.
- **Pronto quando:** aceite da regra 5; critérios do `mods.md` novo; 2.000 mods rolam sem travar nas três visões; `ModsPage.test.tsx` reescrito; demonstração: arrastar 10 archives, instalar todos, categorizar, alternar as visões.
- **Sem a capability:** vale para todo jogo. No `generic`: sem categorias iniciais (a visão Abas mostra só "Sem categoria" e o convite para criar), sem ContentFlags, e nenhuma coluna de plugin. Teste da página com workspace `generic`.

### RD9. Modal do mod (cinco abas) ✅

Concluída em 2026-10-14 (D121). Feito: `ModDetailDialog` no lugar do Inspector lateral (removido); cabeçalho com categoria, tags editáveis e toggle; Resumo com os números de B13 e os dados do mod; Conflitos com a linha travada (B4); Arquivos com a barra por extensão (B8); Instalação com as escolhas do FOMOD (B9); Histórico; Anterior e Próximo; Esc devolve o foco à tabela. `mods.md` §6 reescrito; testes em `ModsPage.test.tsx` (inclui mod sem FOMOD) e `F13.test.tsx`. Os números do Resumo contam mods, não arquivos como na prancha, porque é o que B13 entrega.

- **Objetivo:** trocar o Inspector lateral pelo modal (D121).
- **Entregáveis:** `ui/telas/mods.md` §6 reescrito; abas Resumo (KPIs de B13), Conflitos (linhas com estado travado, B4), Arquivos (barra por extensão, B8), Histórico e Instalação (escolhas do FOMOD e Reinstalar, B9); Esc fecha e devolve o foco à linha.
- **Dependências:** RD8, RD7.
- **Pronto quando:** aceite da regra 5; tudo navegável por teclado; o Inspector antigo de Mods é removido.
- **Sem a capability:** a aba Instalação mostra instalador e origem para qualquer mod; a lista de escolhas só existe quando há FOMOD. Seções de plugin do mod só com `plugins`. Teste com mod de instância `generic`.

### RD10. FOMOD ✅

Concluída em 2026-10-14. Feito: DLG-06 reescrito; passos com a linha do que foi escolhido; selos "Escolha anterior", "Recomendado" e ícone de imagem nas opções; resumo com "Suas escolhas" e "Alterar", os dois números, arquivos por destino com o target que o backend agora informa (`FomodSummary.Target`, pela definição da instância) e categoria e tags na instalação (B10). Testes: `integration/fomod_test.go` (FOMOD numa instância `generic` de dois targets), fixtures reais sem mudança, `ModsPage.test.tsx` (organizar no resumo, escolha anterior na reinstalação). A demonstração com 5 FOMODs reais fica para a RD18.

- **Objetivo:** o assistente no desenho novo.
- **Entregáveis:** `ui/telas/dialogos.md` (DLG-06) reescrito; passo de escolhas (tipo de seleção, "Escolha anterior", imagem e descrição no foco); resumo final com os dois KPIs, arquivos por destino, categoria e tags (B10).
- **Dependências:** RD3, RD4, RD5.
- **Pronto quando:** aceite da regra 5; as 14 fixtures reais continuam passando; reinstalar trocando opções mostra a escolha anterior; demonstração com 5 FOMODs.
- **Sem a capability:** FOMOD é instalador de formato e vale para todo jogo (só dispara se o arquivo existe). "Arquivos por destino" usa os targets da definição da instância, nunca nomes fixos. Teste com FOMOD instalado numa instância `generic` de dois targets.

### RD11. Conflitos

- **Objetivo:** a tela de Conflitos no desenho novo.
- **Entregáveis:** `ui/telas/conflicts.md` reescrito; linha com dois botões de vencedor, selo "Sugerido" com motivo e estado travado com "altere por lá"; "Para todos os N"; rodapé de alterações não salvas; item do menu em atenção ligado à contagem.
- **Dependências:** RD7, RD9 (a linha de conflito é a mesma composição da aba do modal).
- **Pronto quando:** aceite da regra 5; `TestConflictDemonstration` passa; demonstração: dois mods sobrepostos, vencedor por par e depois um arquivo pelo outro.
- **Sem a capability:** vale para todo jogo. Sem sugestão disponível o selo não aparece. Nenhum texto fala de extensão ou pasta de jogo. Teste da página com `generic`.

Concluída em 2026-10-14 (`5dcfa9b`), já pela regra da D127: tela comparada com a prancha em 1440 × 900. Feito: `ui/telas/conflicts.md` §2 reescrito; cabeçalho com chips e "Limpar regras" / "Usar sugestões em tudo"; lista de mods em painel; linha com as duas opções, "Sugerido", trava; "Para todos os N"; barra de mudanças não salvas. Saíram "Recalcular" e "Mostrar desativados", que a prancha não tem. Antes desta fase, a casca, Mods, fila, Organização, detalhe do mod e FOMOD foram refeitos pela prancha (`4b09f95`, `b756285`, `4745846`, `7e5dd5f`).

### RD12. Plugins e Ordem de carga

- **Objetivo:** as duas telas no desenho novo.
- **Entregáveis:** conferência campo a campo de B15 e B16 contra o bridge (contagem contra limites, grupo, mod de origem, masters, motivo da posição, "diferente da aplicada"); o que faltar entra como dado do adapter; `ui/telas/plugins.md` e `load-order.md` reescritos; Plugins com limites no topo e painel do plugin; Ordem de carga com lista de arrastar, painel "por que está aqui" e "Aplicar no jogo".
- **Dependências:** RD3, RD4.
- **Pronto quando:** aceite da regra 5; INV-PLG-01..03 passam; 200 plugins; `plugins.txt` alterado por fora continua indo para triagem.
- **Sem a capability:** depende de `plugins` e `load_order`. `generic`, Valheim e instância com o recurso desligado: telas fora do menu, rota direta cai no estado "não disponível neste jogo", comandos respondem `plugins_unsupported`. Rótulos e limites vêm do adapter; nada de "completos" e "light" fixo no frontend. Teste dos três casos.

### RD13. Visão geral e Ajustes da instância (R5a)

- **Objetivo:** a entrada do espaço do jogo e a tela de recursos.
- **Entregáveis:** `ui/telas/overview.md` reescrito a partir de `JogoVisaoGeral` e `JogoGenerico`, com a linha de ajuda; Ajustes da instância, seção Recursos: chave só nos opcionais, motivo quando bloqueado por dependência, base e não aplicável sem chave (bridge pronto: `InstanceFeatures`, `SetInstanceFeature`).
- **Dependências:** RD4.
- **Pronto quando:** aceite da regra 5; ligar e desligar um recurso atualiza menu e Visão geral sem recarregar o app; desligar não escreve em target (teste de integração existente).
- **Sem a capability:** esta é a tela do caso. `JogoGenerico` é o artboard de referência: a Visão geral monta os blocos pelo que o backend devolve. No `generic` a seção Recursos mostra só os de base, sem chave. Teste com `generic`, Valheim e Skyrim.

### RD14. Nível do app: Biblioteca, Início e Adicionar jogo (R5b a R5d)

- **Objetivo:** as telas fora do jogo.
- **Entregáveis:**
  - Biblioteca de jogos (substitui a tela Jogos) e Início com resumo por instância (B14: consulta nova, sem abrir o jogo).
  - Adicionar jogo: suportados com nível de suporte, lojas e recursos (R5b, `GamesSupport`); personalizados com exportar, importar e excluir (R5c: falta o método de bridge que abre e salva o arquivo); pasta com reconhecimento e modelos (R5d: faltam a consulta "que jogo é esta pasta" e o catálogo de modelos no `generic`); opção de target criável (D129; perguntas 7 e 8).
  - `Instance.Executable` removido do DTO onde ficou redundante.
  - `ui/telas/games.md` e `dashboard.md` reescritos.
- **Dependências:** RD4. Pode virar duas fases (14a: Biblioteca, Início, R5b, R5c; 14b: R5d).
- **Pronto quando:** aceite da regra 5; exportar um jogo personalizado, excluir e importar de volta; pasta do Skyrim escolhida à mão é reconhecida; demonstração: do app vazio até o espaço do jogo.
- **Sem a capability:** a lista de suportados mostra `not_applicable` como ausência, nunca como "em breve" (anti-pattern 18). Os modelos são dados do adapter `generic`; nome de jogo ou de carregador só em `internal/adapters`. O Início não soma contagem de plugin para quem não tem.

### RD15. Importação de Vortex e MO2: leitura e importação ✅

Concluída em 2026-10-20: D128. O estudo confirmou que o banco do Vortex é legível com segurança (cópia aberta só para leitura, com o Vortex aberto ou não), então regras e perfis do Vortex entram e o risco 1 da seção 8 não se confirmou. Testes de integração em `internal/integration/imports_test.go`.

- **Objetivo:** trazer mods, ordem, regras, perfis e plugins de outro gerenciador (B1).
- **Entregáveis:**
  - Estudo curto primeiro: onde cada gerenciador guarda o estado e o que é legível com segurança. MO2: `mods/`, `profiles/<p>/modlist.txt`, `plugins.txt`, `loadorder.txt`. Vortex: pasta de staging, `vortex.deployment.json` e o banco de estado, a confirmar se dá para ler sem o Vortex aberto.
  - Port de leitura por gerenciador, somente leitura; prévia com contagens por parte.
  - Importação como operação com plano e journal: mods entram pelo pipeline de pasta (D048), **copiados** por padrão; ordem e separadores; regras; perfis; plugins e ordem de carga; categorias opcionais.
  - Relação com o bloqueio de implantação estrangeira (D035): importar não libera o deploy; a instrução de limpar no outro gerenciador continua.
  - D128; `core/15` atualizado; `core/02` e `core/11` com o fluxo.
- **Dependências:** RD5 (categorias), RD14 (ponto de entrada no adicionar jogo); respostas às perguntas 3 e 4.
- **Pronto quando:** fixtures de uma instância MO2 e de um staging do Vortex importadas em teste de integração; kill no meio da importação reabre sem lixo; nada é escrito na pasta do outro gerenciador (teste compara a árvore antes e depois); regra importada que fecharia ciclo vira diagnóstico, não erro (D028).
- **Sem a capability:** mods, ordem, regras e perfis valem para todo jogo. Plugins e ordem de carga só entram com `plugins` e `load_order` efetivas: no `generic` e no Valheim a prévia nem lista essas partes. Teste: importar uma instância MO2 para um jogo `generic`. Fato de gerenciador (nome de arquivo, formato) fica na infraestrutura do leitor, fora do domínio.

### RD16. Importação de Vortex e MO2: telas ✅

Concluída em 2026-10-20: DLG-31 em `ui/telas/dialogos.md`. A oferta aparece no fim do Gerenciar jogo quando há fonte e em Mods › Importar › "De outro gerenciador…". Regras importadas ganharam a origem `import` ("Importada", removível como as do usuário), como a prancha pede. Falta a demonstração com uma instalação real de cada gerenciador.

- **Objetivo:** `ImportarOferta` e `ImportarEscolha`.
- **Entregáveis:** oferta ao adicionar um jogo já gerenciado por outro ("Importar tudo", "Escolher o que importar", "Começar do zero"), com o que vem e o que não vem; escolha por parte, perfis, total e espaço em disco; progresso no drawer de operações; aviso de limpar a implantação no outro gerenciador.
- **Dependências:** RD15, RD3.
- **Pronto quando:** aceite da regra 5; demonstração com uma instalação real de cada gerenciador.
- **Sem a capability:** as partes de plugin e ordem de carga só aparecem quando o backend as lista. Teste da tela com prévia de jogo `generic`.

### RD17. Telas desenhadas depois da liberação

- **Objetivo:** levar Perfis, Diagnóstico, Notificações, os menus de Mods e as Configurações para o desenho novo.
- **Estado:** pranchas revisadas pelo Leonardo em 2026-10-20 ("pode continuar"). 17a ✅ (painel de Notificações). Nenhuma parte começa antes de a prancha dela ser aprovada. Elas seguem a spec existente (`ui/telas/profiles.md`, `diagnostics.md`, `settings-extensions.md`, `mods.md` §5.1, `core/10`, `core/13`) e não criam contrato novo no backend (B18).
- **Entregáveis, um commit por parte:**

  | Parte | Prancha | Conteúdo | Componentes | Depende de |
  |---|---|---|---|---|
  | 17a | `JogoNotificacoes` | Painel aberto pelo sino: lido e não lido, ações na linha, dispensar, marcar todas | C19 | RD4 |
  | 17b | `JogoModsMenus` | Menu Filtros (categoria, tags, situação, conflitos, "contém") com chips de filtro aplicado; menu Mais ações (B17) | C20 | RD8 |
  | 17c | `JogoPerfis` | Cartões de perfil, aviso de "ativo diferente do implantado", pontos de restauração | C21 | RD4 |
  | 17d | `JogoDiagnostico` | Aba Problemas: lista por gravidade e painel com evidência, impacto e ações | C22 | RD4; a ação "Importar do Vortex" só depois da RD15 |
  | 17e | `Configuracoes` | Aba Interface no padrão de linha de configuração, com o escopo "vale para [jogo]" | C23 | RD4 |

  Cada parte reescreve o documento da tela, cria na lib o componente que faltar (com ficha na RD1, se a prancha já estiver aprovada quando a RD1 rodar) e troca a tela. Se a 17a ou a 17b forem aprovadas antes da RD4 ou da RD8, entram nelas em vez de virar commit próprio.
- **Sem desenho, ficam como estão dentro da casca nova** (D119, item 2): abas Histórico, Operações e Log do Diagnóstico; abas Aplicação, Mods, Plugins, Soluções de problemas e Tema das Configurações; diálogos de Perfis (novo, clonar, transferir seleção, comparar, excluir); diálogos de Mods abertos pelo Mais ações (regras, colunas, exportar lista). As abas não desenhadas de uma tela redesenhada adotam os componentes novos da aba desenhada (C22, C23) sem mudar de conteúdo.
- **Dependências:** RD4 para todas; RD8 para a 17b; RD5 para o filtro por tag (B5).
- **Pronto quando:** cada parte tem prancha aprovada, documento reescrito e passou pelo aceite da regra 5; `ProfilesAndOrder.test.tsx`, `Diagnostics.test.tsx` e `F12.test.tsx` reescritos na parte correspondente.
- **Sem a capability:** o filtro "contém" só aparece quando o adapter classifica arquivos: some no `generic` (teste). A aba Plugins das Configurações e a seção "vale para [jogo]" vêm do backend, como na RD4: sem `plugins`, a aba não existe. Perfis não mostra estado de plugin nem ordem de carga para quem não tem a capability. Diagnóstico lista só os checks que o adapter registra; nenhum código de plugin aparece no `generic` nem no Valheim. Teste de cada tela com workspace `generic`.

### RD18. Fechamento

- **Objetivo:** consistência do conjunto.
- **Entregáveis:** medição do orçamento em todas as telas com jogo; revisão independente das ondas 2 a 4 da lib (pendência P3); percurso de todos os fluxos de `ui/02` só com teclado; `docs-ia/08-paridade-vortex-v1.md` revisto; `docs/primeiros-passos.md` e `getting-started.md` com as telas novas; investigação da falha intermitente da suíte Go (`TestDeployPurgeDeploy`); demonstrações manuais pendentes das F10 a F12 refeitas nas telas novas.
- **Dependências:** todas.
- **Pronto quando:** validação completa mais `wails build`; nenhuma tela com achado P1 da `dettmann-ui-improve`.
- **Sem a capability:** o teste "instância `generic` percorre todos os comandos do bridge" (`docs-ia/09` §7, item 3) passa a incluir os comandos criados neste plano: cada um devolve resultado ou erro de capability ausente, nunca `internal`.

## 6. Perguntas para o Leonardo

**Respondidas em 2026-10-14:** o Leonardo aprovou o plano com "Tudo ok", o que foi lido como aceite das nove recomendações abaixo. A 2 já está na D120; as demais são registradas na decisão da fase que travam, e cada fase as repete no resumo do protocolo antes de codar, onde ainda podem ser revistas.

| # | Pergunta | Recomendação | Trava |
|---|---|---|---|
| 1 | De onde vem a sugestão de vencedor num conflito? | Dependência e regra de metadados; sem fato, sem selo | RD7 |
| 2 | Onde o Ctrl K aparece, já que a busca saiu do menu? | Botão de ícone na barra superior, com a dica do atalho | RD4 |
| 3 | A importação de Vortex e MO2 entra antes da V1.0? | Sim, mas como as últimas fases de tela, para a V1.0 poder sair sem ela se atrasar | RD15 |
| 4 | Perfis e categorias do Vortex entram na importação? | Perfis sim; categorias como opção desligada, como desenhado | RD15 |
| 5 | Categoria continua em árvore ou vira lista plana? | Manter a árvore no domínio. ~~A tela v1 cria só no primeiro nível.~~ Corrigido na RD1: o artboard aprovado tem o campo "Dentro de", então a tela cria subcategorias (D119) | RD5 |
| 6 | Nas visões Aninhada e Abas, dá para reordenar a prioridade? | Não: agrupam só a exibição; prioridade se arrasta na Lista | RD5 |
| 7 | O assistente oferece "o app pode criar esta pasta"? | Sim, desligado por padrão | RD14 |
| 8 | Quais modelos prontos de jogo personalizado entram? | Só "pasta Mods" e "BepInEx" na primeira versão | RD14 |
| 9 | "Adicionar mods" é a ação principal e "Importar" traz de pasta ou de outro gerenciador? | Sim | RD8 |

Já respondido: importação **copia** os mods por padrão; mover fica registrado como alternativa em aberto (RD15).

## 7. Fora deste plano

- **Trilha do SDK** (`docs-ia/09` §0): C1 (textos e diagnósticos vêm com o adapter), C2, C3 com a R6, e D. Só a A2 entra aqui, na RD4. Aviso: as telas novas mostram mais rótulos de adapter (limites de plugin, modelos, recursos), o que aumenta o acoplamento 8 enquanto a C1 não é feita. Se for para encaixar uma fase do SDK no meio, a C1 antes da RD12 é o ponto de maior retorno.
- **Fase B** (ordem de carga genérica): espera um jogo com ordem de carga editável.
- **Telas reservadas**: Downloads, Inspetor de assets, Extensões de usuários.
- **Publicação**: repositório público, SignPath e etapa 7 do `plano-de-publicacao.md`.
- Importar profiles do r2modman e provider da Thunderstore (`core/15`).
- Pendentes da F14 (deploy incremental abaixo de 2 s com 500 mil arquivos e os demais do relatório).

## 8. Riscos

1. **Leitura do estado do Vortex** (RD15): se o banco de estado não for legível com segurança, a importação do Vortex fica limitada ao que o staging e o `vortex.deployment.json` mostram (mods e arquivos, sem regras nem perfis). O estudo no começo da fase decide antes de qualquer tela prometer mais.
2. **Tamanho da RD8**: é a tela mais usada e muda tudo de uma vez. Se passar de uma semana, a Organização e a fila viram fase própria.
3. **Lib antes das telas** (RD2, RD3): componente feito só pela ficha pode precisar de ajuste na primeira tela. O ajuste volta para a lib, não vira estilo no app.
4. **Suíte de testes do frontend**: os testes de página atuais são reescritos junto com cada tela; até a RD13 convivem telas antigas e novas na mesma casca.
5. **Checkout compartilhado**: uma fase por vez, commits com pathspec, e a falha intermitente da suíte Go pode mascarar regressão até a RD18.
