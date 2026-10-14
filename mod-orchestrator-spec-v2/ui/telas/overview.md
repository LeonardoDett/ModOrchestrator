# Tela: Overview do jogo

Core: 04, 05, 06, 08, 10. Sem equivalente no Vortex (divergência 5).

## 1. Objetivo

Porta de entrada do workspace de um jogo: "meu setup está pronto para jogar? se não, o que falta?".

## 2. Layout (pranchas `JogoVisaoGeral` e `JogoGenerico`, D127, D130)

- Cabeçalho do jogo: quadrado de 96 px com as iniciais na cor de destaque do jogo, nome, linha "jogo · loja · versão · pasta", chip "Método: X"; à direita "Abrir pasta do jogo" e "Adicionar mods". Jogar não fica aqui: é o botão do menu lateral.
- Números do jogo, quatro, cada um abre a tela que conta: mods ativos ("31 de 44"), plugins ativos (só com a seção `overview.plugins`), conflitos (a decidir, todos decididos ou nenhum) e em disco; num jogo sem plugins com implantação pendente, o quarto vira "Pendente · mudanças a implantar".
- Duas colunas: "Precisa de atenção" (uma linha por código com ícone, título, detalhe e a ação principal; implantação pendente também é uma linha, com "Implantar"; "Nada mais pede atenção neste jogo." no fim) e "Atividade neste jogo" (linhas de 40 px com ícone, texto e "há X", e "Ver histórico").
- Faixas só quando há algo: pasta do jogo sumiu, implantação de outro gerenciador, implantação interrompida, alterações externas, implantação com falha.
- A dica "Abrir o passo a passo" da prancha `JogoVisaoGeral` fica para quando o passo a passo existir.

## 3. Bridge

Consulta única `InstanceOverview(instance)` com todos os números e diagnósticos resumidos; comandos reutilizados (Deploy, Launch, Import).

## 4. Critérios de aceite

- Todo número é clicável e leva à tela filtrada correspondente.
- Se nada precisa de atenção, a tela diz isso explicitamente.
