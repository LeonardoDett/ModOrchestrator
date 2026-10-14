# Componentes do redesign das telas — inventário e fichas

Data: 2026-10-14. Fase RD1 do plano do redesign (`mod-orchestrator-spec-v2/propostas/2026-10-14-plano-implementacao-redesign.md`). Executa os passos 1 a 3 da seção 4 de `2026-10-13-catalog-growth.md`.

Fonte: canvas "Redesign das telas do Mod Orchestrator" (versão `1791938498-49a1`), 31 pranchas lidas. As três reservadas (`FuturoDownloads`, `FuturoAssets`, `FuturoExtensoes`) ficaram de fora. As cinco de `JogoPerfis`, `JogoDiagnostico`, `JogoNotificacoes`, `JogoModsMenus` e `Configuracoes` ainda aguardam a revisão do Leonardo: os componentes delas estão classificados, mas só entram num lote depois da aprovação.

Classes usadas abaixo:

| Classe | Significado |
|---|---|
| **existe** | O componente atual resolve sem mudança de API. |
| **estende** | Componente atual com uma prop, variação ou slot a mais. |
| **1.3** | Está na seção 1.3 do `catalog-growth.md` (fora do redesenho): passa pelo redesenho antes de a tela usá-lo. |
| **novo** | Componente que não existe; tem ficha na seção 4. |
| **app** | Composição em `frontend/src/features/`: carrega termo ou regra de mods (critério 1 do `catalog-growth.md` §3) ou aparece numa tela só. |

## 1. Achados que mudam o plano

1. **A tabela de C1 a C23 do plano foi confirmada com quatro correções.** C10 (separador que recolhe) e C11 (modal grande com abas) já existem: a `DataTable` tem agrupamento com `renderGroupHeader` e grupos recolhíveis, e o `Modal` tem `size="wide"`. C17 (cartão de escolha) já existe no `Radio` (slot `card`). C6 (chip de número) vira extensão do `Indicator`, não átomo novo.
2. **Seis componentes que a tabela do plano não tinha:** `StatTile` (novo), `FilterChip` (novo), `SettingRow` (novo, era C23), `SwatchPicker` (novo, junta a paleta de cores e a grade de ícones de C9), a paleta categórica no tema e o monograma do jogo no `Avatar`.
3. **O destaque por jogo não exige motor novo.** `ThemeScope` aceita um `ThemeConfig`, e o `ThemeConfig` deriva tudo de uma semente `brand`. O destaque do jogo é um `ThemeScope` com a mesma configuração do app e outra semente. Falta só a função que monta essa configuração e o teste de contraste para sementes arbitrárias.
4. **A cor de categoria e de tag precisa de tokens.** A Organização oferece uma paleta nomeada (Azul, Verde, Âmbar, Coral, Rosa, Violeta, Turquesa, Cinza, Ciano, Lima, Laranja, Vermelho, Índigo, Grafite e outras). Sem uma paleta categórica no tema, o app teria de escrever hex, o que a lib proíbe. Entra no lote 1.
5. **Categorias têm hierarquia no desenho.** `JogoOrganizacao` tem o campo "Dentro de" e mostra "Gráficos › Texturas". Isso corrige a recomendação 5 do plano ("a tela v1 cria só no primeiro nível"): vale o artboard aprovado (D119), e a tela cria subcategorias. O domínio já é árvore (`mod.CategoryTree`), então o backend não muda por isso.
6. **O desenho não é uniforme no menu do jogo** (para a RD4 resolver com o artboard aprovado mais recente):
   - Diagnóstico aparece no grupo "Saúde" (`JogoGenerico`, `JogoMods`), no rodapé do menu (`JogoVisaoGeral`) ou isolado por separador (`JogoMenuRecolhido`).
   - "Ajustes da instância" aparece no rodapé do menu em `JogoVisaoGeral` e na prévia de `JogoAjustesRecursos`, e não aparece nas outras pranchas.
   - Largura do menu: 220 px (app) e 232 px (jogo) expandido, 60 px recolhido. A `Sidebar` usa 256 px e 64 px.
   Proposta para a RD4: grupo "Saúde" com Diagnóstico, e "Ajustes da instância" no rodapé, acima do cartão de implantação. As larguras viram tokens da `Sidebar` com os valores do desenho.
7. **O nível do app tem menu lateral próprio**, que o `ui/00` §2.1 não descrevia: Início, Biblioteca, um grupo "Entrar direto" com os jogos fixados (selo de problemas por jogo), Extensões e Configurações no rodapé, e a versão do app. A barra superior do nível do app tem o logo, o sino e a ajuda. Corrigido no `ui/00` junto com este inventário.

## 2. Tela × componente

Só os elementos que pedem algo da lib. Casca (barra superior e menu) está na primeira linha e vale para todas as telas do jogo.

| Prancha | Elemento | Componente | Classe |
|---|---|---|---|
| todas do jogo | barra superior: "‹ Biblioteca", seletor de jogo com monograma, seletor de perfil | `Navbar` + `Button` + `Menu`; `Avatar` monograma | 1.3; estende |
| todas do jogo | sino e ajuda só com ícone, com contagem | `Button` com selo e dica (C4, C5) | estende |
| todas do jogo | menu em grupos, selo por item, item em atenção, recolher | `Sidebar` (C1, C2) | estende |
| todas do jogo | cartão "Implantando" com progresso, "Jogar" | rodapé da `Sidebar` (C3) + `Progress` + `Button` | estende |
| `JogoMenuRecolhido` | trilho com dica, selo sobreposto, anel de progresso | `Sidebar` recolhida + `Tooltip` + `Progress.Circle` | estende; 1.3 |
| todas do jogo | cor do jogo | `ThemeScope` com semente do jogo | estende |
| `Inicio`, `Biblioteca` | menu do app com jogos fixados e selo | `Sidebar` com seção "Entrar direto" | existe |
| `Inicio` | "Precisa de atenção", "Atividade recente", "Jogos recentes" | `Card` + `Section` + `List` com slots | 1.3 |
| `Inicio` | progresso da implantação | `Progress` | existe |
| `Biblioteca` | filtro Todos / Com problema / Ocultos | `SegmentedControl` | existe |
| `Biblioteca` | "Continuar" com quatro números | `StatTile` | novo |
| `Biblioteca` | cartão de jogo com monograma, estado e "Mais ações" | `Card interactive` + `Avatar` + `Menu` | existe; estende |
| `Biblioteca` | detectados com "Gerenciar" | `List` | 1.3 |
| `JogoVisaoGeral`, `JogoGenerico` | cabeçalho do jogo com monograma grande e chips de fato | `Avatar` + `Tag` | estende; existe |
| `JogoVisaoGeral` | linha de ajuda com dispensar (C18) | `Alert` com ação e fechar | estende |
| `JogoVisaoGeral`, `JogoGenerico` | números do jogo como atalhos | `StatTile` com `href` | novo |
| `JogoVisaoGeral`, `JogoGenerico` | atenção e atividade | `List` | 1.3 |
| `JogoMods` (3 visões) | chips "142 de 380 ativos", "48 GB em disco" (C6) | `Indicator variant="chip"` | estende |
| `JogoMods` | fila, importar, implantando, mais ações (C5) | `Button size="icon"` com selo, progresso e dica | estende |
| `JogoMods` | busca e "Filtros" | `FilterBar` | existe |
| `JogoMods` | filtro rápido com contagem, seletor de visão (C7) | `SegmentedControl` (rótulo é `ReactNode`) | existe |
| `JogoMods` | lista com switch, nome com tags, categoria, conflitos, data | `DataTable` + `StatusToggle` + `Tag` | existe; estende |
| `JogoModsAninhada` | separador de categoria que recolhe (C10) | agrupamento da `DataTable` | existe |
| `JogoModsAbas` | abas por categoria com ícone, cor e contagem | `Tabs` | existe |
| `JogoModsAbas`, `JogoMods` | selo de categoria com cor e ícone; tag com cor (C8) | `Tag` com `color` da paleta e `icon` | estende |
| `JogoOrganizacao`, `JogoOrganizacaoTags` | modal com abas Categorias e Tags | `Modal` + `Tabs` | existe |
| `JogoOrganizacao` | árvore de categorias com contagem | `Tree` | existe |
| `JogoOrganizacao`, `JogoOrganizacaoTags` | paleta de cores; grade de ícones (C9) | `SwatchPicker` | novo |
| `JogoOrganizacao` | "Dentro de" | `Input.Select` | existe |
| `JogoOrganizacao` | prévia "como aparece" | composição | app |
| `JogoOrganizacaoTags` | lista de tags com contagem | `List` com seleção | 1.3 |
| `JogoFilaInstalacao` | modal com lista, progresso na linha, ação e remover | `Modal` + `List` + `Progress` | 1.3 |
| `JogoFilaInstalacao` | rodapé explicativo com ação perigosa | `Alert` + `Button intent="danger"` | existe |
| `JogoModDetalhe` e abas | modal grande com abas e contagem (C11) | `Modal size="wide"` + `Tabs` | existe |
| `JogoModDetalhe` | KPIs de conflito e requisito | `StatTile` | novo |
| `JogoModDetalhe` | dados do mod, descrição, notas | `Section` + lista de definição | 1.3 |
| `JogoModDetalhe` e abas | "Mod 4 de 380", Anterior, Próximo | composição | app |
| `JogoModConflitos` | filtro Todos / perde / vence | `SegmentedControl` | existe |
| `JogoModConflitos` | mods envolvidos | `DataTable` | existe |
| `JogoModArquivos` | barra por extensão com legenda (C12) | `Progress` com segmentos | estende |
| `JogoModArquivos` | filtro por extensão e "Em conflito" | `FilterChip` | novo |
| `JogoModArquivos` | árvore com Situação e Tamanho | `Tree` com `renderEnd` | existe |
| `JogoModHistorico` | linha do tempo | `List` | 1.3 |
| `JogoModInstalacao` | passos recolhíveis com grupos e opções escolhidas | `Accordion` | existe |
| `JogoFomod` | passos com nota e estado | `Stepper orientation="vertical"` | existe |
| `JogoFomod` | aviso "escolhas anteriores carregadas" com ação | `Alert` com ação | estende |
| `JogoFomod` | opção com "Escolha anterior", motivo de desabilitado, imagem (C15) | `Radio` / `Checkbox` + `Badge` | app |
| `JogoFomod` | painel da opção em foco com imagem ampliável | `MediaImage` + `Lightbox` | existe |
| `JogoFomodResumo` | escolhas por passo com "Alterar" | `List` | 1.3 |
| `JogoFomodResumo` | avisos e requisitos com caixa de regra | `Alert` + `Checkbox` | existe |
| `JogoFomodResumo` | 386 arquivos, 1,3 GB; arquivos por destino | `StatTile` + `List` | novo; 1.3 |
| `JogoFomodResumo` | categoria e "+ tag" | `Input.Select` + `Tag` | existe; estende |
| `JogoConflitos` | "12 pares a decidir", "26 decididos" | `Indicator variant="chip"` | estende |
| `JogoConflitos` | lista de mods com pendência e "Ocultar resolvidos" | `List` + `Switch` | 1.3 |
| `JogoConflitos` | linha com dois vencedores, "Sugerido", cadeado (C13) | `Radio` cartão horizontal + `Badge` | app |
| `JogoConflitos` | "Para todos os 7" (C14) | `ButtonGroup` | existe |
| `JogoConflitos` | rodapé de alterações não salvas (C14) | `ActionBar sticky` | existe |
| `JogoPlugins` | limites "Completos 198 de 254", "Light 89 de 4096" | `Indicator variant="chip"` + `Progress` | estende |
| `JogoPlugins` | filtro rápido, ordenação automática | `SegmentedControl`, `Switch` | existe |
| `JogoPlugins` | tabela com índice, flags, grupo, mod de origem | `DataTable` + `Badge` | existe |
| `JogoPlugins`, `JogoOrdemDeCarga` | painel do item à direita | `Inspector` | existe |
| `JogoOrdemDeCarga` | "Diferente da aplicada no jogo, 12 diferenças" | `Alert` compacto | existe |
| `JogoOrdemDeCarga` | lista de arrastar com trava e "movido" (C16) | `DataTable reorderable` | existe |
| `JogoOrdemDeCarga` | "Comparar" | `DiffViewer` | existe |
| `JogoAjustesRecursos` | abas Geral, Recursos, Pastas, Implantação | `Tabs` | existe |
| `JogoAjustesRecursos` | linha de recurso: nome, detalhe, estado, chave | `SettingRow` | novo |
| `JogoAjustesRecursos` | prévia do menu e aviso com "Ligar Plugins" | `Card` + `Alert` com ação | estende |
| `JogosSuportados` | "Reconhecemos Fallout 4 nesta pasta" com ações | `Alert` com ação | estende |
| `JogosSuportados` | nível de suporte | `FilterChip` (escolha única) | novo |
| `JogosSuportados` | lista de jogos com monograma, nível e instâncias | `List` + `Avatar` + `Badge` | 1.3; estende |
| `JogosSuportados` | detalhe do jogo com recursos e ações | `Inspector` | existe |
| `ImportarOferta` | origem Vortex ou MO2 com o que foi achado (C17) | `Radio` com `card` | existe |
| `ImportarOferta` | três saídas grandes com duas linhas | `Card interactive` como botão | existe |
| `ImportarOferta`, `ImportarEscolha` | "o que vem e o que não vem", resumo | `Inspector` + `List` | existe; 1.3 |
| `ImportarEscolha` | partes e perfis com caixa, nota e ação | `Checkbox` com `card` | estende |
| `ImportarEscolha` | KPIs e espaço em disco | `StatTile` + `Progress` | novo; existe |
| `Configuracoes` (aguardando) | abas | `Tabs` | existe |
| `Configuracoes` | seção com "Vale para [jogo]" | `Section` com ação no cabeçalho | 1.3 |
| `Configuracoes` | linha: rótulo, descrição, chave, select ou botão (C23) | `SettingRow` | novo |
| `JogoPerfis` (aguardando) | cartão de perfil com selos e rodapé (C21) | `Card interactive selected` + `Badge` | existe |
| `JogoPerfis` | aviso "ativo diferente do implantado" com Implantar | `Alert` com ação | estende |
| `JogoPerfis` | pontos de restauração | `DataTable` | existe |
| `JogoDiagnostico` (aguardando) | chips por gravidade | `Indicator variant="chip"` | estende |
| `JogoDiagnostico` | filtro por área com contagem | `FilterChip` | novo |
| `JogoDiagnostico` | lista agrupada por gravidade, "Novo", ignorados recolhidos (C22) | `List` com grupos + `Accordion` | 1.3 |
| `JogoDiagnostico` | painel: causa, evidência, como resolver, ações | `Inspector` | existe |
| `JogoNotificacoes` (aguardando) | painel do sino: lido e não lido, ações, dispensar (C19) | `Popover` + `List` | 1.3 |
| `JogoModsMenus` (aguardando) | painel de filtros com grupos de chips (C20) | `Popover` + `FilterChip` | novo |
| `JogoModsMenus` | chips de filtro aplicado na barra | `Tag` dispensável | existe |
| `JogoModsMenus` | menu "Mais ações" com separadores | `Menu` | existe |

## 3. Lista consolidada

| Componente | Classe | Nível | Telas que usam | Lote |
|---|---|---|---|---|
| Semente do jogo no `ThemeScope` | estende | tema | todas do jogo | 1 |
| Paleta categórica (cores de categoria e tag) | novo | tema | Mods, Organização, filtros | 1 |
| `Button`: selo, progresso, dica obrigatória em `size="icon"` | estende | átomo | casca, Mods | 1 |
| `Indicator variant="chip"` | estende | átomo | Mods, Conflitos, Plugins, Diagnóstico, Perfis | 1 |
| `Avatar`: monograma quadrado com cor | 1.3 + estende | átomo | casca, Biblioteca, Início, Adicionar jogo, Importar | 1 |
| `Tooltip` | 1.3 | molécula | casca, todas as ações só com ícone | 1 |
| `Alert`: ação e dispensar | estende | molécula | Visão geral, FOMOD, Ajustes, Adicionar jogo, Perfis | 1 |
| `Sidebar`: atenção no item, rodapé, dica e selo recolhidos, larguras do desenho | estende | organismo | casca | 1 |
| `AppShell`, `Navbar`, `Workspace` | 1.3 | template | casca | 1 |
| `Tag`: `color` da paleta e `icon` | estende | átomo | Mods, detalhe, FOMOD | 2 |
| `FilterChip` | novo | átomo | Arquivos, Adicionar jogo, Diagnóstico, filtros de Mods | 2 |
| `Progress` com segmentos | estende | átomo | Arquivos | 2 |
| `StatTile` | novo | molécula | Biblioteca, Visão geral, detalhe do mod, FOMOD, Importar | 2 |
| `SwatchPicker` | novo | molécula | Organização (cores e ícones) | 2 |
| `SettingRow` | novo | molécula | Ajustes da instância, Configurações | 2 |
| `Checkbox` com `card` | estende | molécula | Importar | 2 |
| `Section` | 1.3 | molécula | Início, detalhe do mod, Configurações | 2 |
| `List`: slots de início, título, descrição, meta, ações; não lido; grupos | 1.3 + estende | organismo | Início, Visão geral, Biblioteca, Organização, fila, histórico, FOMOD, Conflitos, Adicionar jogo, Importar, Diagnóstico, Notificações | 2 |

Fora dos lotes:

- **Composição do app:** linha de conflito (C13), opção do instalador (C15), navegação "Mod N de M" do detalhe, prévia da categoria. Cada uma nasce em `frontend/src/features/<tela>/` com peças da lib.
- **Já existem e não mudam:** `DataTable` (agrupamento, reordenação), `Modal size="wide"`, `Tabs`, `Tree`, `Stepper` vertical, `SegmentedControl`, `FilterBar`, `Inspector`, `ActionBar`, `ButtonGroup`, `Accordion`, `Radio` com `card`, `Card`, `Menu`, `Popover`, `DiffViewer`, `MediaImage`, `Lightbox`, `StatusToggle`, `Switch`, `Input.Select`. A pendência P6 da lib (conferir no navegador) vale para os que forem usados pela primeira vez numa tela nova.
- **Só depois da aprovação das pranchas:** os usos em `Configuracoes`, `JogoPerfis`, `JogoDiagnostico`, `JogoNotificacoes` e `JogoModsMenus`. Nenhum componente existe só por causa delas: `SettingRow`, `FilterChip` e `List` já são pedidos por telas aprovadas.

`SwatchPicker` aparece numa tela só, mas em dois usos diferentes (cor e ícone) e é genérico; passa no critério 2 pela recorrência dentro da tela. Se a revisão achar que não passa, vira composição do app sobre `Radio`.

## 4. Fichas

### 4.1 Semente do jogo no `ThemeScope` (tema)

- **API:** função pura `withSeed(config: ThemeConfig, seed: string, id: string): ThemeConfig` em `theme/engine`, que troca `brand` e, se houver, deriva `accent` de novo; o app passa o resultado a `<ThemeScope theme={...}>`.
- **Estados:** semente ausente ou inválida devolve a configuração do app sem mudança (nunca lança dentro da tela).
- **Teste:** para um conjunto de sementes de matizes variados (incluindo amarelo e azul claro do desenho), os papéis de texto e de ação passam no `theme:lint`; troca de escopo não vaza para fora do elemento.
- **Não faz:** não escolhe a cor do jogo. A cor vem da definição do jogo (backend), com padrão do app.

### 4.2 Paleta categórica (tema)

- **API:** papéis `category-1` a `category-16` (fundo sutil, texto, borda, ponto), gerados pelo motor em claro e escuro, com nomes estáveis exportados para o seletor (`CATEGORY_COLORS: { id, label }[]`; rótulo traduzível pelo consumidor).
- **Teste:** cada cor tem contraste de texto sobre o próprio fundo sutil e sobre `surface`; duas cores vizinhas na lista diferem também em luminosidade, não só em matiz.
- **Não faz:** não carrega significado de status. Status continua nos intents (`success`, `warning`, `danger`, `info`).

### 4.3 `Button` em `size="icon"`: selo, progresso e dica

- **API:** `badge?: ReactNode` (sobreposto no canto, sem receber foco), `progress?: number` (0 a 100, anel `Progress.Circle` em volta do ícone), `tooltip?: ReactNode` (padrão: o `aria-label`). Em `size="icon"`, `aria-label` passa a ser obrigatório no tipo.
- **Estados:** com `progress`, o nome acessível inclui o valor ("Implantando, 64%"); com `badge` numérico, também ("Fila de instalação, 3 itens").
- **Teclado:** igual ao `Button`; a dica abre no foco.
- **Não faz:** não decide quando mostrar selo ou progresso.

### 4.4 `Indicator variant="chip"`

- **API:** a variação nova desenha ícone, valor em destaque e rótulo dentro de um chip com borda (`142 de 380 ativos`); `value: ReactNode`, `label: string`, `intent`. O texto fica visível; o `role="img"` da variação atual não se aplica.
- **Não faz:** não é botão. Chip clicável é `FilterChip`.

### 4.5 `Avatar` monograma

- **API:** `shape?: "circle" | "square"`, `initials: string` (até três letras), `size`, e cor pelo escopo de tema (`brand` do `ThemeScope` em volta) ou por `color` da paleta categórica.
- **Teste:** contraste das iniciais nos dois modos; nome acessível vem de `label`.

### 4.6 `Alert`: ação e dispensar

- **API:** `action?: ReactNode` à direita, `onDismiss?: () => void` com `dismissLabel` (botão só com ícone), variação `compact` de uma linha (linha de ajuda, "diferente da aplicada").
- **Teclado:** o botão de dispensar é o último da ordem de foco.

### 4.7 `Sidebar`: o que muda

- **Item:** `attention?: boolean` (fundo e texto âmbar, selo preenchido; nome acessível ganha a contagem), `badge` já existe.
- **Seção:** `placement: "end"` já existe; ganha `footer?: ReactNode` preso no fim, abaixo das seções `end`, para o cartão de implantação e o "Jogar".
- **Recolhida:** dica com rótulo e contagem em cada item; selo sobreposto ao ícone; o `footer` recebe `collapsed` para trocar o cartão pelo anel de progresso.
- **Larguras:** tokens `--sidebar-width` e `--sidebar-width-collapsed`, com os valores do desenho (232 px e 60 px; 220 px no nível do app).
- **Não faz:** não monta os itens. O app recebe grupos e itens prontos do backend.

### 4.8 `Tag` com cor e ícone

- **API:** `color?: CategoryColorId` (da paleta 4.2; exclusivo com `intent`), `icon?: IconComponent`.
- **Teste:** com `color`, nenhuma classe de intent; com `onRemove`, o botão de remover segue no fim.

### 4.9 `FilterChip` (átomo, novo)

- **API:** `pressed`, `onPressedChange`, `count?: number`, `color?: CategoryColorId` (ponto à esquerda), `disabled`, `children`. Para escolha única, o consumidor agrupa em `FilterChip.Group type="single" | "multiple"` com `aria-label`.
- **Estados:** pressionado, não pressionado, desabilitado, contagem zero (esmaecida, ainda focável).
- **Teclado:** `Space`/`Enter` alternam; no grupo, setas movem o foco.
- **Não faz:** não filtra dados. Difere do `SegmentedControl` por permitir múltipla escolha e quebrar linha.

### 4.10 `Progress` com segmentos

- **API:** `Progress.Stacked` com `segments: { value: number; label: string; color?: CategoryColorId }[]`, `max`, legenda opcional (`legend` com rótulo e contagem). Nome acessível monta a lista ("Arquivos por tipo: .dds 742, .nif 418…").
- **Não faz:** não ordena nem agrupa "outros"; o consumidor envia os segmentos prontos.

### 4.11 `StatTile` (molécula, novo)

- **API:** `label`, `value: ReactNode`, `unit?`, `description?`, `icon?`, `intent?`, `href?` ou `onClick?` (vira link ou botão inteiro), `size?: "sm" | "md"`. `StatTile.Grid` para a fileira com colunas iguais.
- **Estados:** carregando (`Skeleton` no valor), interativo, estático.
- **Não faz:** não formata número; recebe o texto pronto do i18n.

### 4.12 `SwatchPicker` (molécula, novo)

- **API:** `options: { value: string; label: string }[]`, `value`, `onValueChange`, `renderSwatch(option)`, `columns`, `aria-label`. Dois usos: cores (`renderSwatch` pinta a cor da paleta) e ícones (`renderSwatch` desenha o ícone).
- **Teclado:** grupo de rádio em grade: setas nas duas direções, `Home`/`End`, seleção com `Space`.
- **Não faz:** não traz a lista de ícones; o consumidor envia.

### 4.13 `SettingRow` (molécula, novo)

- **API:** `label`, `description?`, `status?: ReactNode` (por exemplo "Efetivo", "Bloqueado: precisa de Plugins"), `control: ReactNode` (switch, select ou botão), `disabled?`, `id` para ligar rótulo e controle.
- **Estados:** desabilitado com motivo visível na descrição; controle ausente (recurso base, só leitura).
- **Não faz:** não salva. A tela chama o backend.

### 4.14 `Checkbox` com `card`

- **API:** o mesmo slot `card` do `Radio`, com `description` e `action?: ReactNode` à direita ("Escolher mods").

### 4.15 `List`: o que muda

- **Item:** slots `start` (ícone em quadro ou avatar), `title`, `description`, `meta` (por exemplo a hora), `actions`; estado `unread`; `List.Group` com título e contagem, recolhível.
- **Já tem:** seleção, foco por teclado, `renderItem`. A mudança é de layout e de slots; o contrato de seleção fica.
- **Não faz:** não pagina nem virtualiza. Lista longa é `DataTable`.

## 5. Lotes

Ordem de construção: de baixo para cima dentro de cada lote. Cada lote é um commit na lib, com a validação de `catalog-growth.md` §3 (passo 6), arquivos novos em `WAVE_FILES` e pastas em `LEVELS`.

**Lote 1 (RD2): tema e casca**
1. Paleta categórica (4.2) e semente do jogo (4.1).
2. Átomos: `Button` (4.3), `Indicator` (4.4), `Avatar` (4.5).
3. Moléculas: `Tooltip` (redesenho da 1.3), `Alert` (4.6).
4. Organismo: `Sidebar` (4.7).
5. Templates: `AppShell`, `Navbar`, `Workspace` (redesenho da 1.3).

**Lote 2 (RD3): conteúdo**
1. Átomos: `Tag` (4.8), `FilterChip` (4.9), `Progress` (4.10).
2. Moléculas: `StatTile` (4.11), `SwatchPicker` (4.12), `SettingRow` (4.13), `Checkbox` (4.14), `Section` (redesenho da 1.3).
3. Organismo: `List` (4.15).

O plano previa a RD3 em duas partes se ficasse grande; com este inventário o lote 2 cabe num commit.

Pendências da lib que entram junto: P4 (achados da onda 1) nos arquivos tocados; P5 na primeira mudança de `emphasis.ts`, que deve ser a do `Tag` com cor.
