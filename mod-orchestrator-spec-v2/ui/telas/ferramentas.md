# Tela: Ferramentas

Core: 11 §6, 09 §3, 15 "Ferramentas externas". D045, D146. Vortex: `starter_dashlet`, `titlebar-launcher`, `tool_variables_base`. MO2: `editexecutablesdialog.cpp`, `executableslist.cpp`. Aparece só com a capability `tools` em vigor, no grupo Setup do menu do jogo, depois de Saves.

## 1. Objetivo

Os programas que o usuário abre com este jogo (xEdit, Nemesis, BodySlide, DynDOLOD…): iniciar, editar, ordenar o menu da barra superior e adicionar as ferramentas que o jogo conhece. Ferramentas são opcionais: a lista não tem coluna de estado (pedido do usuário na prancha), para nada parecer problema.

## 2. Layout (prancha `JogoFerramentas`, D127)

- Linha de cabeçalho de 76 px: "Ferramentas", chip "N ferramentas" e, em verde, "N em execução" (só com alguma rodando); à direita "Adicionar ferramenta" e "Mais ações" (ler de novo, Ajustes da instância). Sem faixa de "ocupado": editar a lista não usa o lock da instância.
- Lista emoldurada com a faixa "A ordem desta lista é a do menu de ferramentas na barra superior. Arraste para mudar." e linhas de 58 px: alça de arrastar, ícone (o do executável; sem ele, monograma na cor da paleta), nome, "em execução" discreto ao lado do nome quando roda, tags "Exclusiva" e "Implanta antes", caminho com argumentos em fonte mono; à direita "Iniciar" (ou "Aberta", desabilitado, quando roda) e o menu da linha (Editar, Duplicar, Mover para cima/baixo, Remover). Com uma ferramenta exclusiva aberta, "Iniciar" das outras fica desabilitado com o motivo na dica.
- Abaixo, "Ferramentas conhecidas de {jogo}" (procuradas na pasta do jogo; nada é adicionado sem pedir): cartões em três colunas com o nome e "Na pasta do jogo" (botão "Adicionar") ou "Opcional. Aponte onde está instalada" (botão "Localizar…"). Some quando todas estão registradas.
- Painel da ferramenta escolhida (340 px): ícone, nome, "Em execução há {tempo}"; Executável, Argumentos, Pasta de trabalho, Ambiente, Exclusiva, Implantar antes; aviso do que acontece enquanto roda e ao fechar; rodapé com Editar, Duplicar e Remover. A primeira ferramenta abre no painel.

## 3. Executável ausente

Não aparece na lista. Ao clicar em "Iniciar" (aqui ou no menu da barra superior), o backend responde `tool_executable_missing` e a tela mostra um aviso compacto "O executável de {nome} não foi encontrado" com o caminho e "Localizar…", que troca só o executável.

## 4. Diálogos

- **Adicionar / Editar** (prancha `JogoFerramentasEditar`, 640 px): ícone com "Escolher ícone…" e "Usar o do executável"; Nome; Executável com "Procurar…"; Argumentos em mono com "Inserir variável" (menu com cada variável e o valor dela nesta instância); Pasta de trabalho (vazia = pasta do executável) com "Procurar…"; Variáveis de ambiente (nome, valor, remover; "Adicionar variável"); chaves "Exclusiva" e "Implantar antes de iniciar". O formulário não valida: o erro `tool_invalid` do backend vai para baixo do campo (motivo e variável vêm nos parâmetros).
- **Remover**: confirmação; o programa e os arquivos dele não são tocados.
- **Menu da barra superior** (prancha `JogoFerramentasMenu`): botão com chave inglesa à esquerda do sino, com ponto verde enquanto alguma ferramenta roda (`Button badge`, D-043 da lib); itens na ordem da lista, com ícone e uma segunda linha quando preciso ("Em execução" em verde, "Bloqueada enquanto {ferramenta} estiver aberta", "Executável não encontrado" em âmbar), indisponíveis apagados; "Gerenciar ferramentas…". Aparece pela seção `topbar.tools` do workspace; a UI não testa capability.
- **Ao fechar** (prancha `JogoFerramentasFim`): com arquivos novos ou alterados (`tool.exited`), modal "{ferramenta} terminou" com o horário, o resumo e "Agora não" / "Revisar e capturar" (abre o DLG-15); sem mudanças, só um toast.

## 5. Estados

- Jogo sem a capability ou recurso desligado: item e botão não existem.
- Sem ferramentas: EmptyState "Nenhuma ferramenta" com "Adicionar ferramenta"; as sugestões continuam abaixo.
- Ferramenta exclusiva aberta: o cartão do rodapé do menu mostra "{ferramenta} em uso: alterações bloqueadas" e Jogar fica indisponível (lock `tool`).

## 6. Bridge

Consultas: `Tools(instance)` (registro, sugestões, variáveis, em execução, bloqueadora), `ToolIcon` (PNG em data URL). Comandos: `SaveTool`, `AddKnownTool`, `DeleteTool`, `MoveTool`, `RunTool`, `PickToolExecutable`, `PickToolIcon`. Eventos `tool.*` são sinal para reler; `tool.exited` traz as contagens do scan.
