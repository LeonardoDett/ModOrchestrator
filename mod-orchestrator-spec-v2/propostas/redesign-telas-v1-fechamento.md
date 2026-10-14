# Redesign das telas, fechamento do design v1

Estado em 2026-10-14. Entrada para o plano de implementação. Nada aqui foi implementado no app.

- Canvas: https://claude.ai/artifact/H2LwUCQTWSq7ev4ALRTZrP (os mockups ficam só lá, não no repositório).
- Este documento é uma **proposta**: nenhuma decisão foi registrada em `docs-ia/decisoes.md`. Cada item da seção 3 que muda contrato precisa de decisão e mapa de impacto antes de virar código (skill `maintain-ai-docs`).
- Os números, nomes de mods e caminhos nas telas são dados de exemplo.

## 1. Estrutura

Dois níveis:

1. **App**: mapa de navegação, biblioteca de jogos, início (dash global), adicionar jogo.
2. **Espaço do jogo**: tudo olha para um jogo só, com a cor de destaque do jogo no lugar do teal do app.

Casca do espaço do jogo:

- Barra superior: "‹ Biblioteca" (com borda), seletor de jogo, seletor de perfil, espaço, Notificações (sino com contagem), Ajuda, controles da janela. Sem indicador de status e sem busca.
- Menu lateral: cabeçalho "Menu" com botão de recolher; grupos Visão geral / Conteúdo (Mods, Plugins, Ordem de carga, Conflitos) / Setup (Perfis) / Saúde (Diagnóstico). Conflitos fica em âmbar com selo preenchido quando há pendência. No rodapé, o cartão "Implantando" acima do botão "Jogar".

## 2. Telas do canvas

Estados: **Aprovada** (o Leonardo disse que está ok; "em 2026-10-14" marca as liberadas em conjunto com "pode fazer todas as telas"), **Reservada** (espaço para o futuro, sem compromisso de escopo).

### Nível do app

| Artboard | Tela | Estado |
|---|---|---|
| `Main` | Mapa de navegação | Aprovada em 2026-10-14 |
| `Biblioteca` | Biblioteca de jogos | Aprovada em 2026-10-14 |
| `Inicio` | Início (dash global) | Aprovada em 2026-10-14 |
| `JogosSuportados` | Adicionar jogo: suportados, personalizados e pasta | Aprovada em 2026-10-14 |
| `ImportarOferta` | Adicionar jogo: importar de Vortex ou MO2 | Aprovada em 2026-10-14 |
| `ImportarEscolha` | Adicionar jogo: escolher o que importar | Aprovada em 2026-10-14 |

### Espaço do jogo

| Artboard | Tela | Estado |
|---|---|---|
| `JogoVisaoGeral` | Visão geral | Aprovada em 2026-10-14 (ajustada pelos comentários) |
| `JogoGenerico` | Visão geral de jogo com menos capacidades | Aprovada em 2026-10-14 (ajustada pelos comentários) |
| `JogoMods` | Mods, visão 1 Lista | Aprovada; depois ajustada pelos comentários |
| `JogoModsAninhada` | Mods, visão 2 Aninhada (categorias viram separadores) | Aprovada; idem |
| `JogoModsAbas` | Mods, visão 3 Abas por categoria | Aprovada; idem |
| `JogoFilaInstalacao` | Fila de instalação (modal) | Aprovada em 2026-10-14 |
| `JogoMenuRecolhido` | Menu lateral recolhido | Aprovada em 2026-10-14 |
| `JogoOrganizacao` | Organização, aba Categorias | Aprovada em 2026-10-14 |
| `JogoOrganizacaoTags` | Organização, aba Tags | Aprovada em 2026-10-14 |
| `JogoModDetalhe` | Detalhe do mod (modal), aba Resumo | Aprovada |
| `JogoModConflitos` | Detalhe do mod, aba Conflitos | Aprovada; depois ajustada pelos comentários |
| `JogoModArquivos` | Detalhe do mod, aba Arquivos | Aprovada; depois ajustada pelos comentários |
| `JogoModHistorico` | Detalhe do mod, aba Histórico | Aprovada |
| `JogoModInstalacao` | Detalhe do mod, aba Instalação | Aprovada; depois ajustada pelos comentários |
| `JogoFomod` | Instalador FOMOD, passo de escolhas | Aprovada; depois ajustada pelos comentários |
| `JogoFomodResumo` | Instalador FOMOD, resumo final | Aprovada; depois ajustada pelos comentários |
| `JogoConflitos` | Conflitos | Aprovada; depois ajustada pelos comentários |
| `JogoPlugins` | Plugins | Aprovada em 2026-10-14 |
| `JogoOrdemDeCarga` | Ordem de carga | Aprovada em 2026-10-14 |
| `JogoAjustesRecursos` | Ajustes da instância, recursos | Aprovada em 2026-10-14 |

### Espaços reservados

| Artboard | Tela | Estado |
|---|---|---|
| `FuturoDownloads` | Obter mods e downloads | Reservada |
| `FuturoAssets` | Inspetor de assets | Reservada |
| `FuturoExtensoes` | Extensões de usuários | Reservada |

### Não desenhadas

- Perfis.
- Diagnóstico.
- Painel de Notificações (o sino substitui o indicador de status, mas o painel aberto não foi desenhado).
- Menu "Filtros" da página de Mods.
- "Mais ações" da página de Mods.
- Ajustes globais do app.

## 3. Dependências que o design criou

### 3.1 Backend

| # | O design mostra | O que existe hoje | O que falta |
|---|---|---|---|
| B1 | **Importar de Vortex e MO2** ao adicionar um jogo: contagens antes de importar, escolha por parte (mods, regras, perfis, plugins e ordem de carga, categorias) | Só detecção para bloquear a implantação (`internal/core/domain/game/foreign.go`, `application/games/foreign.go`). Importação prevista como V1.x em `core/15-futuro.md` | Leitor de cada gerenciador, prévia com contagens, importação como plano. A detecção atual só vê MO2 portátil na pasta do jogo e o Vortex pelos arquivos implantados; é preciso achar a pasta de mods e o estado. Perfis e categorias do Vortex não estão na spec |
| B2 | **Sugestão de vencedor** em cada conflito (selo "Sugerido") | Vencedor calculado por override de arquivo › prioridade (`core/05`) | Definir de onde vem a sugestão. Sem isso, o selo sai |
| B3 | **"Para todos os N"**: decidir vários conflitos de um par de uma vez | Regra entre dois mods e override por arquivo | Confirmar se a regra entre mods cobre o caso ou se precisa de comando em lote |
| B4 | **Conflito travado**: par já decidido na lista de outro mod aparece bloqueado, com "altere por lá" | Regra e estado "revisado" | A consulta precisa dizer qual regra decidiu o par e a partir de qual mod |
| B5 | **Categorias e tags com cor e ícone**, separadas; tags abaixo do nome do mod | Notas e cor por mod (`core/02 §9`) | Modelo de categoria (uma por mod) e de tag (várias), com cor e ícone; persistência por instância |
| B6 | **Três visões da lista de mods** (Lista, Aninhada, Abas) e filtro rápido Todos / Ativos / Desligados | Lista e separadores | Preferência de visão por instância; a visão aninhada usa a categoria como separador, e isso precisa conviver com os separadores do ModOrder |
| B7 | Coluna **"Atualizado"** com data relativa e datas no detalhe do mod | A confirmar no modelo | Datas de instalação e de última atualização por mod |
| B8 | **Arquivos por extensão** com contagem (aba Arquivos) | ContentFlags por adapter (o genérico não classifica) | Contagem por extensão, que vale para qualquer jogo |
| B9 | **Aba Instalação** do mod: escolhas do FOMOD e botão Reinstalar; etiqueta "Escolha anterior" na reinstalação | `Installation.options` e pré-seleção na reinstalação | Expor as escolhas salvas em formato legível (passo, grupo, opção) |
| B10 | **Categoria e tags no resumo do FOMOD**, antes de concluir | Não existe | Aceitar categoria e tags junto com a instalação |
| B11 | **Fila de instalação** com "Instalar" por item e "Instalar todos" que pula os que pedem escolhas | Estado `imported` (arquivo retido, sem instalação) | Comando em lote que instala os diretos e deixa na fila os que têm instalador com escolhas |
| B12 | **Notificações com contagem** no lugar do indicador de status | Diagnóstico e notificações (`core/10`) | Contagem para o sino; o que antes aparecia no indicador vira notificação |
| B13 | **KPIs do mod**: conflitos (vence, perde), requisitos "X/X presentes" | Conflitos e dependências | Resumo numérico por mod num único retorno |
| B14 | **Início (dash global)** com dados de vários jogos | Lista de instâncias | Resumo por instância sem abrir o jogo |
| B15 | **Plugins**: limites (completos e light), grupo, mod de origem, masters, "carrega depois de" | `core/08` e `ui/telas/plugins.md` | Conferir se a contagem contra os limites e o motivo da posição ("por que está aqui") já saem do backend |
| B16 | **Ordem de carga**: estado "diferente da aplicada" e "Aplicar no jogo" | `ui/telas/load-order.md` | Conferir o comparativo entre a ordem desejada e a aplicada |

Itens B1, B2, B5, B10 e B11 mudam contrato. B15 e B16 foram desenhados a partir da spec e devem estar cobertos; falta só conferir campo a campo.

Escopo de jogo (D112): Plugins, Ordem de carga e os limites dependem de capability do adapter. `JogoGenerico` mostra o caminho sem elas. A importação (B1) vale para qualquer jogo nos mods e perfis; plugins e ordem de carga só entram quando o adapter tem a capability.

### 3.2 Componentes (dettmann-ui)

Conferir cada um no catálogo da lib antes de criar (skills `dettmann-ui-use` e `dettmann-ui-author`).

| # | Componente ou padrão | Onde aparece |
|---|---|---|
| C1 | Menu lateral recolhível: trilho de 60 px só com ícones, dica ao passar o mouse, selos, anel de progresso da implantação, "Jogar" como ícone | Todas as telas do jogo |
| C2 | Item de menu em destaque de atenção (âmbar, selo preenchido) | Conflitos |
| C3 | Cartão "Implantando" com progresso, preso acima do "Jogar" | Menu lateral |
| C4 | Sino com selo de contagem sobreposto | Barra superior |
| C5 | Botão só com ícone, com selo e com progresso, e dica obrigatória | Cabeçalho de Mods |
| C6 | Chips de número com ícone ("142 de 380 ativos") | Cabeçalhos de página |
| C7 | Seletor de visão (Lista, Aninhada, Abas) e filtro rápido segmentado | Mods |
| C8 | Selo de categoria (cor e ícone) e tags em linha abaixo do nome | Mods, detalhe, FOMOD |
| C9 | Paleta de 16 cores e grade de 48 ícones para escolher | Organização |
| C10 | Linha de separador de categoria que recolhe o grupo | Mods, visão Aninhada |
| C11 | Modal grande com abas (Resumo, Conflitos, Arquivos, Histórico, Instalação) | Detalhe do mod |
| C12 | Barra de proporção por tipo com legenda e contagem | Aba Arquivos |
| C13 | Linha de conflito com dois botões de vencedor, selo "Sugerido" e estado travado com cadeado | Conflitos |
| C14 | Barra de ação em lote ("Para todos os 7") e rodapé de alterações não salvas | Conflitos |
| C15 | Opção de instalador com tipo, etiqueta "Escolha anterior", imagem e descrição no foco | FOMOD |
| C16 | Lista de arrastar com painel lateral de explicação | Ordem de carga |
| C17 | Cartão de escolha grande (rádio com conteúdo) e botão de ação com duas linhas | Importação |
| C18 | Linha de ajuda fina ("Abrir o passo a passo") | Visão geral |

Tema: as telas do jogo trocam o teal pela cor de destaque do jogo (Skyrim azul, genérico dourado). Isso pede um destaque por jogo no tema, além dos tokens atuais.

## 4. Em aberto

Decisões que faltam do Leonardo:

1. **Importação: copiar ou mover os mods.** O desenho segue com **copiar** como padrão (o outro gerenciador fica intacto). **Mover** fica como alternativa, para não dobrar o espaço em disco.
2. **Onde o Ctrl K aparece.** A busca saiu do menu lateral e o atalho ficou sem indicação visível.
3. **Sugestão de conflito (B2):** definir a origem ou tirar o selo.
4. **Importação:** perfis e categorias do Vortex entram no escopo? Não estão na spec.
5. ~~Aprovação das telas que estavam aguardando.~~ Resolvido em 2026-10-14: o Leonardo liberou todas as telas desenhadas. As telas reservadas e as não desenhadas continuam fora.
6. **"Adicionar mods" e "Importar":** foram tratados como ação principal e como trazer de pasta ou de outro gerenciador. Falta confirmar.

Pendências de processo:

- Os 22 comentários do canvas foram aplicados, mas as conversas continuam abertas: só o Leonardo pode fechá-las no canvas.
- O canvas não foi aberto para conferir a renderização em nenhuma rodada.
- Telas da lista "Não desenhadas" (seção 2).
- Pendências anteriores da dettmann-ui v2 que continuam valendo: orçamento 60/30/10 e a passada de micro-interações.

O que os primeiros desenhos tinham e foi retirado por não existir no backend: miniaturas, arquivos e conflitos por opção do FOMOD, totais correndo durante a escolha, "Começar do zero" no instalador, "Sugerir categoria ao importar" e a barra por tipo de conteúdo (trocada pela de extensões).
