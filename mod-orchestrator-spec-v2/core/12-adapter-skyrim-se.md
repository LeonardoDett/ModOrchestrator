# Adapter Skyrim Special Edition / Anniversary Edition

Referências: D031, D040, D041. Vortex: `games/game-skyrimse`, `gamebryo_plugin_management`, `script-extender-installer`, `script-extender-error-check`, `gamebryo-archive-support`, `local-gamesettings`, `gamebryo-savegame-management`. Todo comportamento específico do Skyrim vive **somente** neste adapter (`internal/adapters/skyrimse`).

> Itens marcados **(verificar)** são fatos externos a confirmar na implementação (IDs de loja, caminhos de variantes). Não inventar: confirmar em fonte primária e atualizar este documento.

## 1. Identidade e descoberta

| Item | Valor |
|---|---|
| GameID | `skyrimse` |
| Nome | The Elder Scrolls V: Skyrim Special Edition |
| Marcador da raiz | `SkyrimSE.exe` |
| Steam | app id `489830` |
| GOG | id do Skyrim AE na GOG **(verificar)**; pastas de usuário usam sufixo `GOG` **(verificar)** |
| Epic | **(verificar se existe distribuição)** |
| Registro | `HKLM\SOFTWARE\WOW6432Node\Bethesda Softworks\Skyrim Special Edition` › `installed path` |
| Versão | versão de arquivo de `SkyrimSE.exe` |
| Processo em execução | `SkyrimSE.exe` (e `skse64_loader.exe` durante o lançamento) |

## 2. Capabilities

`filesystem_mod_target`, `multiple_mod_types`, `installer`, `plugins`, `load_order`, `launch`, `external_change_strategy`. V1.x: `game_settings`, `save_games`.

## 3. Targets e ModTypes

| Target | Caminho |
|---|---|
| `data` | `<root>/Data` |
| `root` | `<root>` |

| ModType | Target | Detecção | Métodos |
|---|---|---|---|
| `default` | `data` | padrão | todos |
| `root` | `root` | usuário, ou archive com pasta `Root/` na raiz (convenção comunitária) | hardlink, copy |
| `skse` | `root` (binários) + `data` (scripts) | `skse64_loader.exe` presente; instalador `skse-runtime` | hardlink, copy |
| `enb` | `root` | `d3d11.dll` + (`enbseries.ini` ou pasta `enbseries/`) | hardlink, copy |

Dicas de root (core/02 §4): pastas `meshes`, `textures`, `scripts`, `interface`, `sound`, `music`, `seq`, `strings`, `skse`, `shadersfx`, `lodsettings`, `grass`, `video`, `calientetools`, `netscriptframework`, `source`; extensões `.esp`, `.esm`, `.esl`, `.bsa`, `.ini` (na raiz do Data).

## 4. Conteúdo (ContentFlags)

`plugin` (.esp/.esm/.esl), `archive` (.bsa), `textures`, `meshes`, `scripts` (.pex), `interface`, `sounds`, `skse_plugin` (`SKSE/Plugins/*.dll`), `skse_runtime`, `enb`, `bodyslide`, `animations` (behaviors/FNIS/Nemesis), `strings`, `ini`.

## 5. Plugins

- Arquivos: `.esp`, `.esm`, `.esl` na raiz do target `data` (não em subpastas).
- Cabeçalho: registro `TES4`; flags: `0x1` master (ESM), `0x200` light (ESL). Extensão `.esm` ⇒ master; `.esl` ⇒ master + light. Subrecords `MAST` = masters; `SNAM` = descrição; `CNAM` = autor.
- Implícitos (sempre ativos, topo, nesta ordem): `Skyrim.esm`, `Update.esm`, `Dawnguard.esm`, `HearthFires.esm`, `Dragonborn.esm`, e então os plugins listados em `<root>/Skyrim.ccc`, na ordem do arquivo, quando existem no Data.
- Restrições rígidas: implícitos fixos no topo; masters antes de dependentes; plugins com flag master (inclui `.esm`/`.esl`) antes de não-masters.
- Limites: até 254 plugins completos ativos (índices `00`–`FD`), até 4096 light (`FE:000`–`FE:FFF`). Índice exibido: `0A` para completos, `FE:003` para light.
- Arquivo de load order: `%LOCALAPPDATA%\Skyrim Special Edition\plugins.txt` (variante GOG em pasta própria **(verificar)**). Formato: uma linha por plugin, na ordem; ativos com prefixo `*`; implícitos não são escritos; codificação Windows-1252; linhas `#` são comentários. Ordem manual permitida.
- `loadorder.txt`: não é escrito na V1 (o jogo não o usa; ferramentas modernas leem `plugins.txt`). Se existir, é ignorado. **(verificar compatibilidade com ferramentas usadas pela comunidade antes do release)**
- BSA: carregado pelo jogo se houver plugin ativo com o mesmo nome base (`Mod.bsa`, `Mod - Textures.bsa`). Diagnóstico info `bsa_without_plugin` quando não houver. Conflitos dentro de BSA: V1.x.

## 6. Instaladores do adapter

- `skse-runtime`: detecta `skse64_loader.exe`; arquivos `*.exe`, `*.dll` da raiz do SKSE → `root`; `Data/*` → `data`. Mod type `skse`.
- ENB é detectado como ModType pelo installer `basic` (regra de detecção), não precisa de instalador próprio.

## 7. Health checks do adapter

| checkId | Condição | Severidade |
|---|---|---|
| `framework_missing` (SKSE) | algum mod habilitado com `skse_plugin` e nenhum mod `skse` habilitado nem `skse64_loader.exe` não gerenciado na raiz | error |
| `game_version_changed` | versão do `SkyrimSE.exe` mudou desde a última execução | warning ("plugins SKSE podem precisar de atualização") |
| `bsa_without_plugin` | BSA sem plugin correspondente ativo | info |
| `skse_plugin_version_mismatch` | V1.x | — |

## 8. Launch

- Se `skse64_loader.exe` existe na raiz (gerenciado ou não): lançar por ele (padrão), com opção "Lançar sem SKSE".
- Senão: `SkyrimSE.exe`. Loja Steam: lançar o executável diretamente funciona; não é necessário passar pela Steam.
- Pasta de trabalho: raiz do jogo.

## 9. Saídas conhecidas de ferramentas (core/09)

`Data/meshes/actors/character/behaviors`, `Data/meshes/actors/character/animations`, `Data/tools/GenerateFNIS_for_Users`, `Data/Nemesis_Engine`, `Data/CalienteTools/BodySlide/ShapeData` (saídas de build em `Data/meshes`), `Data/TexGen_Output`, `Data/DynDOLOD_Output`, `Data/SKSE/Plugins/*.ini` modificados por MCMs. Arquivos `*.log` na raiz do Data são `unexpected` sugeridos como "Deixar não gerenciado".

## 10. V1.x (previsto)

- `game_settings`: `Skyrim.ini`, `SkyrimPrefs.ini`, `SkyrimCustom.ini` em `Documents\My Games\Skyrim Special Edition`.
- `save_games`: `SLocalSavePath=Saves\<profile>\` em `SkyrimCustom.ini` › `[General]`; tela Saves com leitura do cabeçalho `.ess` (personagem, nível, local, data, plugins usados, screenshot) e checagem de plugins faltando.
- Provedor LOOT (D041).
- Conflitos dentro de BSA.

## 11. Critérios de aceite

- Instalação Steam encontrada pela busca rápida; instalação copiada para outra pasta localizável manualmente.
- `plugins.txt` escrito é aceito pelo jogo (teste manual) e lido de volta de forma idêntica (teste automatizado).
- Plugin `.esp` com flag ESL recebe índice `FE:xxx`.
- Load order nunca coloca não-master antes de master nem move implícitos.
- SKSE importado de archive oficial vira mod `skse`, binários na raiz, e Play passa a lançar pelo loader.
