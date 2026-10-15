# Tela: Games

Core: 11, 12. Vortex: página Games (`gamemode_management`: GamePicker com seções Managed / Discovered / Supported, busca, alternância grade/lista, "Scan" rápido/completo, GameThumbnail com ações ao passar o mouse, GameInfoPopover, HideGameIcon, PathSelection, ProgressFooter).

## 1. Objetivo

Ver os jogos gerenciados, descobrir novos, começar a gerenciar e manter a localização/instâncias.

## 2. Layout (prancha `Biblioteca`, D127)

- Cabeçalho: "Biblioteca", "N jogos gerenciados · M detectados neste PC"; à direita o filtro Todos / Com problema / Ocultos, "Procurar jogos no PC" (busca rápida; a completa segue na barra de progresso) e "Adicionar jogo".
- "Continuar de onde parou": o jogo usado por último, com o quadrado de iniciais na cor do jogo (D122), loja, versão, perfil e "usado há X", "Entrar" e Jogar (só no jogo ativo), e quatro números: mods ativos, implantação, conflitos a revisar e problemas (B14: `LibraryGames`, lido sem entrar no jogo).
- Cards dos jogos gerenciados em quatro colunas: faixa na cor do jogo com as iniciais e o estado (Pronto, Implantar, N problemas; outro gerenciador e pasta ausente contam como problema), nome, loja e versão, "N mods ativos", "Entrar" e o menu (pastas, alterar localização, renomear, outra instância, ocultar, parar de gerenciar).
- "Detectados neste PC, ainda não gerenciados": linhas tracejadas com "Gerenciar". Nada é gerenciado sem esse clique.

## 3. Adicionar jogo (prancha `JogosSuportados`)

Modal de 1080 × 780: busca, filtro por nível (Todos, Completo, Declarado, Personalizado) e a lista dos jogos que o app atende e dos que o usuário criou (D117), cada um com lojas e recursos, instâncias e nível; à direita, o escolhido com lojas, suporte, instâncias e "Recursos deste jogo", e "Gerenciar". Jogo personalizado: "Exportar" (salva o arquivo, R5c), "Excluir" (só sem instância). Rodapé: "Importar jogo de arquivo" e "Criar jogo personalizado". O reconhecimento de pasta ("Reconhecemos X nesta pasta", R5d) fica para a RD14b.

## 4. Diálogos

- **Gerenciar jogo** (assistente, core/11 §4): Instalação → Pastas (staging, arquivos; aviso de volume para hardlink) → Verificação (métodos disponíveis, implantação estrangeira) → Concluir.
- **Jogo genérico**: nome, pasta raiz, targets (lista editável: id, pasta relativa), executável (opcional), depois o mesmo assistente.
- **Parar de gerenciar**: confirmação destrutiva: "Fazer purge agora" (obrigatório se implantado) + opções "Manter staging e arquivos" (padrão) / "Apagar staging e arquivos" (requer digitar o nome do jogo).
- **Alterar localização** (DLG-29): seletor + validação; se a antiga ainda é acessível e implantada, oferece purge nela antes.
- **Renomear instância** (DLG-28): nome único por jogo.

## 5. Estados

- Primeira execução, nada encontrado: EmptyState com "Buscar jogos" e "Adicionar jogo genérico".
- Busca em andamento: seções atualizam ao vivo; nada é gerenciado sem ação.

## 6. Bridge

Consultas: `GamesView(showHidden)` (gerenciados, descobertos, suportados), `GameInstanceDetails(id)`, `Workspace()` (instância ativa, troca e telas por capability), `ValidateGameRoot(gameId, path)`, `SuggestGameFolders(gameId, root, name)`, `VerifyGameSetup(setup)`.
Comandos: `ScanGames(mode)` (rápida síncrona; completa devolve o id da operação `games.scan`), `CancelOperation(id)`, `ManageGame(setup)`, `SetActiveInstance`, `UpdateInstanceLocation`, `RenameInstance`, `HideInstance`, `HideGame`, `UnmanageGame(id, options)`, `OpenInstanceFolder(id, folder)` (o caminho nunca vem da UI), `PickFolder(title)` (seletor nativo).

**Na F3**: o contador de mods dos cards espera a F4; o status de deploy do card espera a F7 (o card mostra só "Ativo", "Outro gerenciador", "Pasta ausente", "Oculto"). "Parar de gerenciar" e "Alterar localização" recusam instância implantada até o purge existir. Preferência de grade/lista fica no navegador (estado de apresentação).

## 7. Critérios de aceite

- Do app recém-instalado até o workspace do Skyrim em no máximo 4 passos do assistente.
- Nenhum jogo passa a ser gerenciado sem clique em Gerenciar.
- Parar de gerenciar nunca deixa arquivos implantados no jogo.
