# Auditoria de fidelidade: telas feitas × pranchas aprovadas

Data: 2026-10-14. Fonte: canvas "Redesign das telas do Mod Orchestrator" (versão 1792000031-0575), renderizado em 1440×900 por `scratchpad/boards/render.mjs`. Regra a partir daqui: a prancha é a especificação (layout, espaços, colunas, opções e textos). Se a lib não fizer o que a prancha pede, a lib muda.

Cada item diz o que a prancha mostra e o que o app faz hoje. Todos entram no retrabalho.

## 1. Casca do espaço do jogo (RD4) — pranchas `JogoVisaoGeral`, `JogoMods`, `JogoMenuRecolhido`, `JogoGenerico`

Barra de cima (48 px):
- Prancha: botão "Biblioteca" com borda; separador; seletor do jogo com monograma quadrado preenchido na cor do jogo; botão com borda "Perfil <nome> ▾"; à direita só notificações (selo âmbar), ajuda e controles da janela.
- App: perfil sem o rótulo "Perfil" e sem borda; ícone de busca a mais na barra; monograma com estilo diferente.

Título da página:
- Prancha: o título (24 px) fica dentro da área de conteúdo, na mesma linha dos chips e das ações da tela (altura 76 px, margem lateral 28 px).
- App: a casca desenha o título numa faixa própria, acima da tela; chips e ações ficam na linha de baixo.

Menu lateral (232 px):
- Prancha: contagens nos itens (Mods 380 em pílula neutra; Conflitos 12 em pílula âmbar, e o item inteiro em estado de atenção âmbar); rodapé com o card de implantação (ícone, "Implantando", "812 de 1.268 arquivos", "64%" e barra de progresso de 3 px na base) e o botão "Jogar" cheio, de 40 px, na cor do jogo.
- App: sem contagem em Mods; card "Implantação / Sincronizado" com selo; "Jogar" dividido com menu ao lado.
- Divergência entre pranchas: `JogoVisaoGeral` põe Diagnóstico e Ajustes da instância no rodapé do menu; `JogoMods` põe Diagnóstico no grupo "Saúde". O mapa (`Main`) diz rodapé. **Pergunta ao Leonardo.**

Menu recolhido (60 px):
- Prancha: ícones de 40×36 com selo de contagem no canto, separadores entre grupos, progresso circular "64%" e Jogar quadrado de 40 px.
- App: sem progresso circular; selos e separadores a conferir.

## 2. Mods (RD8) — pranchas `JogoMods`, `JogoModsAninhada`, `JogoModsAbas`

Cabeçalho (76 px, uma linha):
- Prancha: "Mods" + chip "142 de 380 ativos" + chip "48 GB em disco"; à direita, botões com borda de 34 px: fila (ícone + contador em pílula azul "3"), importar (ícone), implantação com "64%" quando implanta (fundo azul), mais ações (ícone); separador; "Adicionar mods".
- App: título fora da linha; ícones sem borda e sem número visível (selo); implantação sem percentual.

Barra de filtros (48 px):
- Prancha: busca de 320 px "Buscar por nome ou tag"; botão "Filtros"; filtro rápido Todos/Ativos/Desligados com contagem; à direita a troca de visão Lista/Aninhada/Abas.
- App: busca ocupa a largura toda; selects "Todas as categorias" e "Qualquer situação de conflito" na barra; botão "Colunas"; tudo dentro de um painel com borda.

Tabela:
- Prancha: só Ativo, Mod, Categoria, Conflitos, Atualizado, Tamanho; linha de 54 px com nome em cima e tags (ou "sem tags") embaixo; switch de 30×18; categoria com quadradinho colorido de ícone + nome; Conflitos em texto colorido ("Vence 3" verde, "A resolver · 2" âmbar, "Instalando 40%" azul, "Na fila"); desligados com texto apagado; tabela em cartão com raio 10 e cabeçalho de 36 px.
- App: linha de 32 px; tags ao lado do nome; alça de arrastar, "#" e "Stat…"; categoria como pílula; coluna Conflitos com indicador de ícone; Tamanho em "1.000 bytes".

Aninhada: grupo de 42 px com seta, ícone da categoria, nome em negrito e "N mods · M ativos"; colunas sem Categoria. App: agrupamento genérico da tabela.

Abas: abas de categoria dentro do cartão da tabela, com ícone colorido e contagem; colunas sem Categoria. App: abas fora do cartão; coluna Categoria continua.

Dropzone: a prancha não mostra dropzone fixa na base; a soltura de arquivos continua valendo sobre a tela. App: dropzone grande na base.

## 3. Fila de instalação — prancha `JogoFilaInstalacao`

- Prancha: modal de 760×640; cabeçalho com título, "6 mods esperando · 1 instalando agora", "Instalar todos" e fechar; linhas de 64 px com quadrado de ícone (azul instalando, âmbar pede escolhas, neutro direto), nome com versão, barra de progresso fina quando instala, detalhe ("640 MB · instala direto", "Pede escolhas: instalador com 4 passos"), botão "Instalar" ou "Escolher opções" (âmbar) e X; rodapé com ícone de info, o texto do "Instalar todos" e "Esvaziar fila" em vermelho.
- App: modal genérico com lista simples, alerta azul no rodapé e "Instalar 0".

## 4. Organização — pranchas `JogoOrganizacao`, `JogoOrganizacaoTags`

- Prancha: modal 1000×760; abas com contagem; à esquerda árvore com alça, quadrado de ícone colorido, nome e contagem, "Nova categoria" tracejado; à direita nome + "Dentro de" lado a lado, cores como botões de 40 px com bolinha e nome da cor (8 por linha), ícones 12 por linha, "Como aparece" com três prévias (na lista, como separador, como aba); rodapé "Excluir categoria" / "Cancelar" / "Salvar categoria". Tags: lista de pílulas com contagem "24 mods", nota de rodapé, prévia de mod com tags, "Usada em 24 mods" com link.
- App: estrutura parecida, mas cores sem nome, prévia com duas variantes, "Fechar" no lugar de "Cancelar", botões e espaçamentos diferentes.

## 5. Detalhe do mod (RD9) — pranchas `JogoModDetalhe`, `JogoModConflitos`, `JogoModArquivos`, `JogoModHistorico`, `JogoModInstalacao`

- Prancha (Resumo): modal 1040×780; cabeçalho com ícone grande de 52 px, nome de 20 px, categoria, tags e "+ tag", "Ativo" + switch e fechar; abas com contador (Conflitos em pílula âmbar, Arquivos com número); ações rápidas (Reordenar, Reinstalar, Abrir pasta do mod, Remover à direita em vermelho); "Conflitos e requisitos" com 4 KPIs (Perde, Vence em arquivos, Mods envolvidos, Requisitos) e link "Abrir na página de Conflitos"; "Dados do mod" em grade 4×2; Descrição e "Suas notas" lado a lado; rodapé "Mod 4 de 380 · Esc fecha" + Anterior/Próximo. Nas outras abas o cabeçalho é compacto (ícone 40 px, linha "Gráficos › Malhas · versão 2.1 · 840 MB · prioridade 4 de 142").
- App: KPIs contam mods em vez de arquivos; formulário de edição (nome, versão, autor, categoria, destaque) que a prancha não tem; sem "Reordenar"; notas como campo do formulário; cabeçalho igual em todas as abas.
- Conflitos: prancha tem frase "7 mods disputam arquivos com este", botão âmbar "Abrir na página de Conflitos", filtro "Todos · 7 / Este mod perde · 3 / Este mod vence · 4" e tabela (Mod envolvido, Categoria, Em disputa, Para este mod com pílula Vence/Perde). App: listas Vence/Perde/Redundante.
- Arquivos: prancha tem barra por tipo + legenda, busca "Buscar arquivo", filtro Todos/.dds/.nif/"Em conflito · 3", árvore com colunas Nome/Situação/Tamanho. App: barra e a árvore antiga do Inspector.
- Histórico: prancha tem linhas de 48 px com ícone por tipo, texto e "há 2 horas". App: lista simples com data absoluta.
- Instalação: prancha tem cabeçalho "Escolhas no instalador do mod (FOMOD)" com resumo, busca de opção, "Reinstalar", e passos numerados que recolhem, com grupos, dica do tipo de seleção e opções com check. App: dados do archive + lista de escolhas.

## 6. FOMOD (RD10) — pranchas `JogoFomod`, `JogoFomodResumo`

- Prancha: modal 1160×800; cabeçalho 76 px com imagem do módulo 104×52, nome e "Passo 2 de 4"; faixa azul de escolhas anteriores; três colunas fixas (passos 230 px com fundo próprio, centro, detalhe 340 px com fundo próprio); opções como linhas de 44 px com borda, rádio/checkbox desenhados, selos "Escolha anterior"/"Recomendado"/"Obrigatório" e ícone de imagem à direita; grupo "Todas estas são instaladas"; rodapé 64 px com "Cancelar importação" texto, "Voltar" e "Próximo" com seta. Resumo: "Suas escolhas" em tabela com "Alterar", Avisos em caixa âmbar, Requisitos, e à direita 2 KPIs, "Arquivos por destino" com ícone de pasta, "Organizar este mod" com categoria e tags.
- App: estrutura parecida, mas opções no estilo padrão de rádio/checkbox sem a linha com borda; colunas sem fundo próprio; botões e selos em outros estilos.

## 7. Fora do escopo desta auditoria

Conflitos (RD11) estava em andamento e será feito já pela prancha `JogoConflitos`. As telas ainda não feitas (Plugins, Ordem de carga, Visão geral, Biblioteca, Início, Adicionar jogo, importação, Configurações, Perfis, Diagnóstico, Notificações, menus de Mods) seguem a regra nova desde o início.

## 8. O que muda no método

1. Antes de codar, uma lista do que a prancha mostra (este documento, por tela).
2. A lib ganha o que faltar (ex.: linha de 54 px com duas linhas na `DataTable`).
3. Antes do commit, screenshot do app em 1440×900 ao lado do artboard; diferença só com motivo aprovado.
