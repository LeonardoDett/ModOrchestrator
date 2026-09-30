# Tela: Games

Core: 11, 12. Vortex: página Games (`gamemode_management`: GamePicker com seções Managed / Discovered / Supported, busca, alternância grade/lista, "Scan" rápido/completo, GameThumbnail com ações ao passar o mouse, GameInfoPopover, HideGameIcon, PathSelection, ProgressFooter).

## 1. Objetivo

Ver os jogos gerenciados, descobrir novos, começar a gerenciar e manter a localização/instâncias.

## 2. Layout (paridade Vortex)

```
Toolbar: [Buscar jogos ▾ (Rápida | Completa)] [Adicionar jogo genérico] | Visualização: [Grade|Lista] | [Mostrar ocultos ☐]  [busca]
▼ Gerenciados (2)
  [card Skyrim SE  ● ativo]  [card Skyrim SE — Teste]
▼ Descobertos (1)          ← instalados e suportados, ainda não gerenciados
  [card Fallout 4 (sem adapter: não aparece)] …
▼ Suportados (n)           ← suportados pelo app, instalação não encontrada
  [card Skyrim SE]  "Instalação não encontrada · Localizar manualmente"
Rodapé de progresso durante a busca completa (paridade ProgressFooter), com Cancelar.
```

## 3. Card (grade) / linha (lista)

Arte do jogo, nome/nome da instância, loja, versão, contagem de mods (gerenciados), status de deploy.
Ações (hover e menu ⋯):
- Gerenciados: **Ativar** (primário se não ativo), Abrir workspace, Abrir pasta ▸ (jogo, staging, arquivos), Detalhes (popover: caminhos, versão, mod types, capabilities), Alterar localização…, Renomear instância, Adicionar outra instância…, Ocultar, **Parar de gerenciar…**.
- Descobertos: **Gerenciar** (abre assistente), Detalhes, Ocultar.
- Suportados: **Localizar manualmente…**, Ocultar.

## 4. Diálogos

- **Gerenciar jogo** (assistente, core/11 §4): Instalação → Pastas (staging, arquivos; aviso de volume para hardlink) → Verificação (métodos disponíveis, implantação estrangeira) → Concluir.
- **Jogo genérico**: nome, pasta raiz, targets (lista editável: id, pasta relativa), executável (opcional), depois o mesmo assistente.
- **Parar de gerenciar**: confirmação destrutiva: "Fazer purge agora" (obrigatório se implantado) + opções "Manter staging e arquivos" (padrão) / "Apagar staging e arquivos" (requer digitar o nome do jogo).
- **Alterar localização**: seletor + validação; se a antiga ainda é acessível e implantada, oferece purge nela antes.

## 5. Estados

- Primeira execução, nada encontrado: EmptyState com "Buscar jogos" e "Adicionar jogo genérico".
- Busca em andamento: seções atualizam ao vivo; nada é gerenciado sem ação.

## 6. Bridge

Consultas: `GamesView()` (gerenciados, descobertos, suportados), `GameInstanceDetails(id)`.
Comandos: `ScanGames(mode)`, `ManageGame(wizardData)`, `ValidateGameRoot(path)`, `SetActiveInstance`, `UpdateInstanceLocation`, `RenameInstance`, `HideGame`, `UnmanageGame(options)`.

## 7. Critérios de aceite

- Do app recém-instalado até o workspace do Skyrim em no máximo 4 passos do assistente.
- Nenhum jogo passa a ser gerenciado sem clique em Gerenciar.
- Parar de gerenciar nunca deixa arquivos implantados no jogo.
