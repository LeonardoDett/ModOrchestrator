# Jogos, adapters e extensões

Referências: D011, D012, D031, D039. Vortex: `gamemode_management` (GamePicker, discovery, PathSelection, ModTypeWidget, hide game, RecentlyManagedDashlet), `games/*` (extensões de jogo), `modtype-*`, `test-gameversion`, `titlebar-launcher`, `vortex-api` (registerGame, registerModType, registerInstaller, registerLoadOrder, registerTest).

## 1. Contrato do adapter

Um adapter é registrado no bootstrap e implementa o port `GameAdapter`. Ele **declara** e **responde perguntas**; não executa deploy (anti-pattern 24).

| Responsabilidade | Descrição |
|---|---|
| `definitions()` | GameDefinitions que fornece. |
| `detect(storeScanner)` | Candidatos de instalação encontrados (loja, caminho, versão). |
| `validateRoot(path)` | Se uma pasta é uma instalação válida (arquivos marcadores); motivo se não. |
| `targets(root)` | Targets resolvidos a partir da raiz (ex.: `data` = `<root>/Data`, `root` = `<root>`). |
| `modTypes()` | ModTypes: id, nome, target, métodos permitidos, prioridade de detecção, regra de detecção por footprint. |
| `installers()` | Instaladores do adapter (core/03 §6). |
| `rootHints()` | Nomes de pastas/extensões que indicam a raiz do target padrão (core/02 §4). |
| `contentFlags(footprint)` | Classificação do conteúdo do mod. |
| `healthChecks()` | Checks próprios (ex.: framework ausente, versão do jogo). |
| `launch()` | Executável, argumentos, pasta de trabalho, e como detectar "jogo em execução". |
| `plugins` (capability) | Reconhecer plugins, ler cabeçalho, flags, implícitos, limites, restrições rígidas, formato de índice. |
| `loadOrder` (capability) | Serializar/ler o arquivo de load order; se ordem manual é permitida. |
| `gameSettings`, `saveGames` (V1.x) | Arquivos de configuração locais; redirecionamento de saves. |
| `toolOutputs()` | Pastas onde ferramentas conhecidas geram arquivos (core/09 §3). |
| `defaultCategories()` | Categorias iniciais. |
| `version(root)` | Versão do jogo instalada. |

### Catálogo de capabilities (já em `game.go`)

`filesystem_mod_target`, `multiple_mod_types`, `installer`, `plugins`, `load_order`, `save_games`, `game_settings`, `tools`, `launch`, `external_change_strategy`. Extensível: capabilities novas entram no catálogo com decisão registrada.

### Regras
- O core decide por capability (D011). Se uma tela depende de capability ausente, ela não aparece na navegação do workspace (core/11 §5).
- Todo dado do adapter entra no core como **dado declarativo**; o core não chama o adapter dentro de loops quentes (conflitos, desejado).
- Adapter é versionado; a instância guarda a versão do adapter que a criou para migrações.

## 2. ModTypes

- Cada mod tem um ModType (padrão do adapter). Tipo define target e métodos permitidos.
- Detecção automática no install por regra do adapter (ex.: ENB, SKSE → `root`). O usuário pode trocar em "Avançado" (paridade `ModTypeWidget`).
- Location = target do tipo + caminho relativo do arquivo no mod.

## 3. Descoberta de jogos

Fontes V1 (port `StoreScanner`): Steam (`libraryfolders.vdf` + `appmanifest_*.acf`), GOG (registro `GOG.com\Games`), Epic (manifests em `ProgramData\Epic\EpicGamesLauncher\Data\Manifests`), registro do Windows declarado pelo adapter, e caminho manual. Xbox/Game Pass: fora da V1 (pastas protegidas).

Modos (paridade Vortex "Scan: quick/full"):
- **Rápida** (na inicialização, sem bloquear): lojas + registro.
- **Completa** (sob demanda): percorre unidades procurando arquivos marcadores dos adapters; operação cancelável.

Resultado: lista de **candidatos** (não gerencia nada sozinho). Instalação nunca encontrada ⇒ "Localizar manualmente" com validação.

## 4. Gerenciar um jogo (assistente)

`escolher jogo → escolher/confirmar instalação → validar raiz → escolher staging (sugestão no mesmo volume) → escolher pasta de arquivos (ArchiveStore) → verificar métodos de deploy disponíveis → verificar implantação estrangeira (D035) → criar instância + profile Default → abrir workspace`

- Staging sugerida: `<volume do jogo>:\ModOrchestrator\<instância>\staging`; ArchiveStore: `…\archives`; BackupStore: `…\backups` (mesmo volume do target).
- Se o jogo tem implantação de outro gerenciador: o assistente conclui, mas a instância nasce com `foreign_deployment` bloqueante (core/04 §11) e explicação.
- **Jogo genérico** (adapter `generic`): usuário informa nome, pasta raiz, um ou mais targets (ex.: `Mods`, `BepInEx/plugins`), executável opcional. Sem plugins.

Outras ações na tela Games: parar de gerenciar (exige purge; mantém ou apaga staging/archives, com escolha explícita), esconder/mostrar, alterar localização (revalida; se o jogo mudou de pasta, oferece purge na antiga se acessível), abrir pastas (jogo, staging, archives), ver detalhes (caminhos, versão, mod types, capabilities), múltiplas instâncias do mesmo jogo (nome distinto).

## 5. Navegação por capability

O workspace mostra: Overview, Mods, Conflicts, Profiles, Diagnostics sempre; Plugins se `plugins`; Load Order se `load_order`; Saves se `save_games` (V1.x). A lista é consulta do bridge (a UI não decide, anti-pattern 1).

## 6. Launch (D045)

Botão Play na barra de título: executa `launch()` do adapter pelo `ProcessLauncher`, após a checagem pré-lançamento (core/04 §9). Enquanto o jogo roda (detecção por processo), deploy/purge ficam bloqueados (`game_running`). Ferramentas adicionais (hotbar) V1.x.

## 7. Extensões (V2)

Contrato previsto: manifesto (id, versão, autor, capabilities fornecidas, versão mínima do app, permissões: filesystem de quais pastas, rede, processos), ciclo de vida (instalar, habilitar, desabilitar, atualizar, remover, reinício necessário), isolamento (processo separado ou WASM, a decidir). Na V1, a tela Extensions lista os adapters embutidos (nome, versão, jogos, capabilities, "embutido") e explica que extensões de terceiros virão; sem botões falsos (anti-pattern 18).

## 8. Critérios de aceite

- Nenhum `if gameId == …` fora de `internal/adapters`.
- Skyrim SE instalado pela Steam é encontrado na busca rápida.
- Pasta errada no "localizar manualmente" é recusada com motivo.
- Jogo genérico com dois targets funciona de ponta a ponta (import, conflito, deploy).
- Tela Plugins não aparece para jogo genérico.
