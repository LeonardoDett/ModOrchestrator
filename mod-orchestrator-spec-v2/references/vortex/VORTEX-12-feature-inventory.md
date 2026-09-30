# VORTEX-12 — Inventário funcional

Matriz de cobertura: toda funcionalidade do Vortex, o que ela resolve e o que o Mod Orchestrator faz com ela. Âncora: lista real de extensões internas do repositório (`src/renderer/src/extensions/*` e `extensions/*` em `Nexus-Mods/Vortex`, consultada em 2026-09-30), mais os textos das telas de Settings.

Legenda de decisão: **ADOPT** (reproduzir), **ADAPT** (reproduzir com mudança documentada), **DEFER** (release posterior, contrato preparado), **REJECT** (não fazer), **N/A** (não se aplica sem provider).

## 1. Extensões internas do núcleo do Vortex

| Extensão Vortex | Para que serve | Decisão | Onde |
|---|---|---|---|
| `mod_management` | Biblioteca, instalação, ativação, deploy (LinkingDeployment), external changes, duplicados, staging, settings de mods | ADOPT/ADAPT | core/02, 04, 09 |
| `hardlink_activator` | Deploy por hardlink | ADOPT | core/04 §3 |
| `symlink_activator` | Deploy por symlink (Modo Desenvolvedor) | ADOPT | core/04 §3 |
| `symlink_activator_elevate` | Symlink via processo elevado | REJECT (V1) | core/04 §15 |
| `move_activator` | Deploy movendo arquivos | REJECT (V1) | core/04 §15 |
| `null_activator` | Placeholder quando não há método | ADAPT: `method_unavailable` | core/04 |
| `installer_fomod_native`, `installer_fomod_shared`, `installer_fomod_ipc` | FOMOD XML | ADOPT (D030) | core/03 |
| `installer_nested_fomod` | FOMOD dentro de archive | DEFER | core/03 §1 |
| `installer_dotnet` | FOMOD com script C# | REJECT | core/03 §7 |
| `category_management` | Categorias (árvore, diálogo) | ADOPT | core/02 §10 |
| `profile_management` | Profiles, transferência | ADAPT (sempre ligado, D037) | core/07 |
| `gamemode_management` | Jogos, descoberta, seleção, mod types | ADOPT | core/11 |
| `gamebryo_plugin_management` | Plugins, LOOT, grupos, regras, lock de índice, sync | ADAPT (sort nativo, D041) | core/08, 12 |
| `file_based_loadorder`, `mod_load_order` | Load order por lista para jogos não Bethesda | ADOPT contrato; adapters V1.x | core/08 |
| `health_check` | Checagens de requisitos de mods/arquivos | ADAPT (modelo único) | core/10 |
| `history_management` | Histórico de ações (com reversão) | ADOPT | core/10 §3 |
| `recovery` | Backups do estado, restaurar | ADOPT | core/14 |
| `sticky_mods` | Mods "fixos" em profiles | REJECT (sem uso claro; revisar se aparecer necessidade) | — |
| `file_preview` | Prévia de arquivos (imagens/texto) | DEFER (V1.x, Inspector de arquivos) | — |
| `ini_prep` | Preparar INIs do jogo (tweaks) | DEFER (V1.x com `game_settings`) | core/15 |
| `diagnostics_files`, `support_bundle` | Logs e pacote de suporte | ADOPT | core/10 §4 |
| `dashboard`, `starter_dashlet`, `onboarding_dashlet`, `firststeps_dashlet`, `news_dashlet` | Dashboard e dashlets | ADAPT (dashlets locais; ferramentas DEFER; notícias N/A) | ui/telas/dashboard |
| `settings_interface`, `settings_application`, `settings_metaserver` | Settings | ADOPT / metaserver N/A | core/13 |
| `extension_manager` | Extensões de terceiros | DEFER (V2) | core/11 §7 |
| `download_management` | Downloads | DEFER (V2) | core/15 |
| `nexus_integration`, `browse_nexus`, `browser` | Conta Nexus, navegação, NXM | N/A (V2) | core/15 |
| `collections` | Coleções | DEFER (V2) | core/15 |
| `updater` | Atualização do app | ADOPT (opt-in) | core/13 |
| `analytics` | Telemetria | REJECT (V1) | 00-visao |
| `about_dialog` | Sobre | ADOPT | ui/00 §2.3 |
| `instructions_overlay` | Instruções de mods de coleção | DEFER (V2) | — |
| `tool_variables_base` | Variáveis em argumentos de ferramentas | DEFER (V1.x) | core/15 |
| `test_runner` | Executor de testes (health) | ADAPT (HealthChecks) | core/10 |
| `design_system_dev` | Ferramenta interna de UI | N/A (dettmann-ui) | — |

## 2. Extensões empacotadas (pasta `extensions/`)

| Extensão | Para que serve | Decisão | Onde |
|---|---|---|---|
| `games` | Suporte por jogo | ADAPT: adapters compilados (D031) | core/11, 12 |
| `modtype-bepinex`, `modtype-dazip`, `modtype-dinput`, `modtype-enb`, `modtype-gedosato`, `modtype-umm` | Tipos de mod com destino próprio | ADOPT contrato; ENB no Skyrim V1 | core/11 §2, 12 §3 |
| `mod-content` | Coluna de conteúdo do mod | ADOPT | core/02 §9 |
| `mod-highlight` | Cor/ícone e notas por mod | ADOPT | core/02 §9 |
| `meta-editor` | Editar metadados | ADOPT | core/02 §9 |
| `mod-dependency-manager` | Regras entre mods, conflitos, overrides, ciclos | ADAPT (modelo híbrido, D025–D028) | core/05, 06 |
| `mod-report` | Relatório de um mod (arquivos, estado de deploy) | ADAPT (Inspector › Arquivos/Instalação) | ui/telas/mods |
| `new-file-monitor` | Detectar arquivos novos no jogo | ADOPT | core/09 |
| `local-gamesettings` | INIs por profile | DEFER (V1.x) | core/07 §7 |
| `gamebryo-savegame-management` | Saves | DEFER (V1.x) | core/15 |
| `gamebryo-archive-support`, `gamebryo-archive-invalidation` | BSA; invalidação (jogos antigos) | DEFER (V1.x); invalidação N/A para SE | core/12 |
| `gamebryo-test-settings` | Checagens de INI | DEFER | — |
| `script-extender-installer` | Instalar SKSE corretamente | ADOPT (skse-runtime) | core/12 §6 |
| `script-extender-error-check` | Avisar SKSE ausente/erro | ADOPT (`framework_missing`) | core/12 §7 |
| `test-gameversion` | Versão do jogo | ADOPT | core/12 §7 |
| `test-setup` | Checagens de setup | ADAPT | core/10 |
| `titlebar-launcher` | Lançar jogo pela barra de título | ADOPT (D045) | core/11 §6 |
| `open-directory` | Abrir pastas | ADOPT | telas |
| `theme-switcher` | Temas | ADAPT (temas da lib) | core/13 › Tema |
| `mo-import`, `nmm-import-tool` | Importar de MO2/NMM | DEFER (V1.x, MO2/Vortex) | core/15 |
| `fnis-integration` | Rodar FNIS no deploy | REJECT como integração; coberto por tools + captura | core/09, 15 |
| `changelog-dashlet`, `extension-dashlet` | Dashlets | ADAPT / DEFER | dashboard |
| `common-interpreters` | Executar scripts (.bat/.py) como ferramentas | DEFER (tools) | core/15 |
| `feedback`, `issue-tracker` | Enviar feedback | REJECT (V1) | — |
| `morrowind-plugin-management`, `mtframework-arc-support`, `quickbms-support` | Específicos de jogos | N/A até haver adapter | — |
| `documentation` | Tutoriais/vídeos | REJECT (V1) | — |

## 3. Funcionalidades por área (visão do usuário)

### Mods
Install From File (arquivos múltiplos, dropzone) ADOPT · Importar pasta ADAPT (D048) · Enable/Disable, toggle por linha ADOPT · Multi-seleção com barra ADOPT · Filtros por coluna, busca, ordenação, seletor de colunas ADOPT · Agrupamento ADOPT · Categorias ADOPT · Manage Rules ADOPT · Deploy/Purge ADOPT · History ADOPT · Open (pastas) ADOPT · Reinstall ADOPT · Remove (+archive) ADOPT · Variantes ADOPT · Duplicados ADOPT · Mod type (avançado) ADOPT · Notas/destaque ADOPT · Coluna de conteúdo ADOPT · Indicadores de conflito/dependência/override ADOPT · Check for updates, endorse, changelog N/A (V2) · Tutorials REJECT · Coluna de prioridade + separadores ADAPT (D025).

### Conflitos e regras
Detecção por arquivo ADOPT · Notificação de conflitos ADAPT (informativa, D027) · Editor por mod com select ADOPT · Overrides por arquivo com select ADOPT · Regras before/after ADAPT ("vence", D025) · requires/recommends/conflicts ADOPT · Diálogo de ciclo ADAPT (ciclos recusados na criação, D028) · Tela de conflitos ADAPT (divergência 1).

### Deploy
Hardlink/symlink ADOPT · Deploy automático ao habilitar ADAPT (nunca decide, D036) · Purge ADOPT · External changes com ação por arquivo ADOPT · Backups de originais ADAPT (fora da pasta do jogo, D034) · Manifesto no target ADAPT (D035) · Limpar pastas vazias ADOPT · Deploy antes de lançar ADOPT · Mover staging com cálculo de espaço ADOPT · Troca de profile com purge+deploy REJECT (diff, D033).

### Plugins e load order
Lista, ativar, flags, masters, filtros ADOPT · LOOT autosort ADAPT (nativo V1, LOOT V1.x, D041) · Grupos/regras/lock ADOPT · Sync com `plugins.txt` ADAPT (triagem, D040) · Ativar plugins externos automaticamente (setting) ADOPT · Load order por lista (FBLO) ADOPT contrato · Tela separada ADAPT (divergência 2).

### Profiles
Criar/ativar/clonar/remover ADOPT · Toggle para habilitar profiles REJECT (D037) · Transferir ADOPT · Saves/INIs locais DEFER · Comparar e pontos de restauração ADAPT (novos).

### Games
Managed/Discovered/Supported ADOPT · Busca rápida/completa ADOPT · Grade/lista ADOPT · Ocultar ADOPT · Localizar manualmente ADOPT · Parar de gerenciar ADOPT · Múltiplas instâncias ADAPT · Jogo genérico ADAPT (novo).

### Settings
Abas Interface/Vortex(Aplicação)/Mods/Plugins/Download/Workarounds/Theme ADOPT (Download oculta V1) · Advanced mode ADOPT · Multi-user REJECT · GPU acceleration ADOPT · Run at startup DEFER · Desktop notifications ADOPT · Reset suppressed notifications ADOPT · Relative times ADOPT · Hide top-level category ADOPT · Reduce motion / compact headers ADOPT · Deploy on enable / Enable on install ADOPT · Install on download N/A (V2) · Backups (hourly/manual/restore/from file) ADOPT · Clean up empty directories ADOPT · Enable externally added plugins ADOPT.

### Shell
Sidebar global + jogo ADOPT · Title bar custom com launcher ADOPT · Notificações (sino, ações, suprimir) ADOPT · Help/About ADOPT · Conta Nexus N/A (V2) · Dashboard personalizável ADOPT · Downloads na sidebar DEFER (reservado).
