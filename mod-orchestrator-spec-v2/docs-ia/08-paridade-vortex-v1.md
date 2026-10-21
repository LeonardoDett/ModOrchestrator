# Checklist de paridade com o Vortex (F15)

> Desde a D119 (2026-10-14) a paridade com o Vortex é de **recurso**, não de layout: as menções a "divergência N" abaixo se referem à tabela que existia em `ui/00` §6 pela D042.

Conferência item a item de `references/vortex/VORTEX-12-feature-inventory.md`: todo item **ADOPT** ou **ADAPT** da V1 está presente? Feita em 2026-10-09 sobre o código do `master` (depois da F14) e os testes das fases. "Onde" aponta o código e o teste que comprovam; "fase" é a fase que entregou.

Legenda: ✓ presente · ✓* presente, com demonstração manual ainda pendente (registrada no `plano-de-desenvolvimento.md` da fase) · — fora da V1 por decisão (DEFER, REJECT, N/A).

**Revisão de 2026-10-20 (RD18, depois do redesign):** os itens continuam presentes nas telas novas; o detalhe do mod virou modal com abas (D121), os menus de Mods, Perfis, Diagnóstico, Notificações e Configurações seguem as pranchas (RD17) e a importação do MO2 e do Vortex saiu do DEFER (D128). Os testes citados abaixo foram reescritos junto com cada tela e continuam valendo.

**Resultado: todos os itens ADOPT/ADAPT da V1 estão presentes.** Nenhum ficou de fora. As pendências são demonstrações manuais em jogo real (F10–F12) e as lacunas já registradas (D100: redescoberta/adoção depois de perder o banco; D106: variante GOG/Epic de instalação localizada manualmente).

## 1. Extensões internas do núcleo

| Extensão Vortex | Decisão | Estado | Onde (código · teste) | Fase |
|---|---|---|---|---|
| `mod_management` | ADOPT/ADAPT | ✓ | `application/library`, `application/deployment` · `integration/library_test.go`, `deploy_test.go` | F4, F7 |
| `hardlink_activator` | ADOPT | ✓ | `deployment/apply.go` (`MethodHardlink`) · `integration/deploy_test.go` | F7 |
| `symlink_activator` | ADOPT | ✓ | `deployment/apply.go` (`MethodSymlink`), disponível só com privilégio de symlink · `deploy_test.go` | F7 |
| `null_activator` | ADAPT (`method_unavailable`) | ✓ | `deployment/desired.go`, `errors.go` | F7 |
| `installer_fomod_*` | ADOPT (D030) | ✓* | `domain/fomod`, `library/fomod.go` · `integration/fomod_fixtures_test.go` (14 FOMODs reais) | F10 |
| `category_management` | ADOPT | ✓ | `library/categories.go` · `OrganizationDialog.tsx` (árvore, cor e ícone, D123) | F4, RD5 |
| `profile_management` | ADAPT (sempre ligado, D037) | ✓ | `application/profiles` · `ProfilesAndOrder.test.tsx` | F5 |
| `gamemode_management` | ADOPT | ✓ | `application/games`, adapters · `adapters/gamesflow/flow_test.go`, `GamesPage.test.tsx` | F3 |
| `gamebryo_plugin_management` | ADAPT (sort nativo, D041) | ✓* | `application/plugins`, `adapters/skyrimse/plugins.go` · `integration/plugins_test.go` | F11 |
| `file_based_loadorder`, `mod_load_order` | ADOPT contrato | ✓ | port `LoadOrderFile`/`Serialize`/`ManualOrder` do adapter (core/08); adapters de jogos sem plugins são V1.x | F11 |
| `health_check` | ADAPT (modelo único) | ✓ | `application/diagnostics`, `domain/health` · `Diagnostics.test.tsx` | F9 |
| `history_management` | ADOPT | ✓ | `application/history` (desfazer quando possível) · `HistoryPanel.tsx` | F9 |
| `recovery` | ADOPT | ✓ | `application/backups`, tela de recuperação (D100) · `sqlite/backup_test.go`, `bootstrap/recovery_test.go` | F12, F14 |
| `diagnostics_files`, `support_bundle` | ADOPT | ✓ | log técnico (`infrastructure/logging`), `diagnostics/support.go`, `infrastructure/supportbundle` | F9 |
| `dashboard` e dashlets | ADAPT (locais) | ✓ | `application/overview`, `DashboardPage.tsx` · `F12.test.tsx` | F12 |
| `settings_interface`, `settings_application` | ADOPT | ✓ | catálogo `domain/settings`, `SettingsPage.tsx` · `F12.test.tsx` | F12 |
| `updater` | ADOPT (opt-in) | ✓ | `domain/appupdate`, `application/appupdate`, `infrastructure/updates`, `UpdateSection.tsx` · testes dos três pacotes e `F12.test.tsx` (F15) (D104) | F15 |
| `about_dialog` | ADOPT | ✓ | `shell/HelpDialogs.tsx` (versão, pasta de dados, versão do schema) | F2, F13 |
| `test_runner` | ADAPT (HealthChecks) | ✓ | idem `health_check` | F9 |
| `symlink_activator_elevate`, `move_activator`, `installer_dotnet`, `sticky_mods`, `analytics` | REJECT | — | | |
| `installer_nested_fomod`, `file_preview`, `ini_prep`, `extension_manager`, `download_management`, `collections`, `instructions_overlay`, `tool_variables_base` | DEFER | — | | |
| `nexus_integration`, `browse_nexus`, `browser`, `settings_metaserver`, `design_system_dev` | N/A | — | | |

## 2. Extensões empacotadas

| Extensão | Decisão | Estado | Onde | Fase |
|---|---|---|---|---|
| `games` | ADAPT (adapters compilados, D031) | ✓ | `adapters/generic`, `adapters/skyrimse` | F3 |
| `modtype-*` | ADOPT contrato; ENB no Skyrim | ✓ | `game.DetectRule`, `skyrimse` (`root`, `skse`, `enb`) · `skyrimse/installers_test.go` | F4 |
| `mod-content` | ADOPT | ✓ | `ContentFlags` (core/12 §4), coluna Conteúdo em `ModsTable.tsx` | F4 |
| `mod-highlight` | ADOPT | ✓ | `library/commands.go` (cor/ícone, notas), `ModInspector.tsx` | F4 |
| `meta-editor` | ADOPT | ✓ | atributos editáveis no Inspector de Mods | F4 |
| `mod-dependency-manager` | ADAPT (D025–D028) | ✓ | `application/profiles` (regras), `application/conflicts` (overrides, exclusões), ciclo recusado na criação · `ConflictsPage.test.tsx` | F5, F6 |
| `mod-report` | ADAPT (Inspector) | ✓ | Inspector › Arquivos/Instalação | F4 |
| `new-file-monitor` | ADOPT | ✓ | `deployment/scan.go`, `external.go` (arquivos novos, captura) · `integration/external_test.go` | F8 |
| `script-extender-installer` | ADOPT (`skse-runtime`) | ✓ | `skyrimse/installers.go` | F4 |
| `script-extender-error-check` | ADOPT (`framework_missing`) | ✓ | `skyrimse/health.go` | F9 |
| `gamebryo-archive-check` | ADOPT (`archive_wrong_game`, D141) | ✓ | `skyrimse/archives.go`, `plugins/diagnostics.go` · `integration/archives_test.go` | LV1 |
| `test-gameversion` | ADOPT (`game_version_changed`) | ✓ | `games/health.go` | F9 |
| `test-setup` | ADAPT | ✓ | health checks de setup (staging, métodos, marcadores) | F9 |
| `titlebar-launcher` | ADOPT (D045) | ✓ | `shell/TitleBar.tsx`, `application/launch` · `integration/launch_test.go` | F12 |
| `open-directory` | ADOPT | ✓ | `OpenFolder` (bridge) nas telas Games, Mods e Settings | F3+ |
| `theme-switcher` | ADAPT (temas da lib) | ✓ | `theme.mode`, `theme.id` (Settings › Tema) | F12 |
| `changelog-dashlet` | ADAPT | ✓ | dashlet Novidades (`whats_new`, D091 item 8); notas por versão no `CHANGELOG.md` e no atualizador (D105) | F12, F15 |
| `extension-dashlet` | DEFER | — | | |
| `mo-import` (e importação do Vortex) | ADOPT (D128) | ✓* | `application/imports`, `infrastructure/managers/{mo2,vortex}` · `integration/imports_test.go`, `ImportDialogs.test.tsx`; falta a demonstração com instalações reais | RD15, RD16 |
| `local-gamesettings`, `gamebryo-savegame-management`, `gamebryo-archive-support`, `gamebryo-test-settings`, `nmm-import-tool`, `common-interpreters` | DEFER | — | | |
| `fnis-integration`, `feedback`, `issue-tracker`, `documentation` | REJECT | — | | |
| `gamebryo-archive-invalidation`, `morrowind-plugin-management`, `mtframework-arc-support`, `quickbms-support` | N/A | — | | |

## 3. Funcionalidades por área

### Mods
| Item | Estado | Onde |
|---|---|---|
| Install From File (vários, dropzone) | ✓ | `Importar arquivo`, arrastar e soltar (`OnFileDrop`), fila de instalação |
| Importar pasta (ADAPT, D048) | ✓ | `Importar pasta…` |
| Enable/Disable, toggle por linha | ✓ | `ModsTable.tsx` |
| Multi-seleção com barra | ✓ | `ModsTable.tsx` (barra de seleção) |
| Filtros, busca, ordenação, seletor de colunas | ✓ | `ModsWorkspace.tsx` |
| Agrupamento | ✓ | `groupBy` em `ModsTable.tsx` |
| Categorias | ✓ | árvore de categorias |
| Manage Rules | ✓ | `OrderDialogs.tsx` |
| Deploy/Purge | ✓ | barra de status do deploy |
| History | ✓ | Mods › Histórico (Diagnóstico › Histórico filtrado) |
| Open (pastas) | ✓ | menu Abrir |
| Reinstall | ✓ | com as escolhas anteriores do FOMOD |
| Remove (+archive) | ✓ | INV-LIB-05 |
| Variantes, duplicados | ✓ | `library` (`Variant`, `Duplicate`) |
| Mod type (avançado) | ✓ | Inspector, modo avançado |
| Notas/destaque, coluna de conteúdo | ✓ | Inspector, `ModsTable.tsx` |
| Indicadores de conflito/dependência/override | ✓ | colunas e ícones (ícone + rótulo, D043) |
| Coluna de prioridade + separadores (ADAPT, D025) | ✓ | ModOrder com separadores |

### Conflitos e regras
| Item | Estado |
|---|---|
| Detecção por arquivo | ✓ |
| Notificação de conflitos (informativa, D027) | ✓ (`diagnostics.showUnreviewedConflicts`) |
| Editor por mod, overrides por arquivo | ✓ |
| Regras "vence" (D025), requires/recommends/conflicts | ✓ |
| Ciclos recusados na criação (D028) | ✓ |
| Tela de conflitos (divergência 1) | ✓ |

### Deploy
| Item | Estado |
|---|---|
| Hardlink/symlink | ✓ |
| Deploy automático que nunca decide (D036) | ✓ (`automation.deployOnChange`, INV-DEP-06) |
| Purge | ✓ |
| External changes por arquivo | ✓ |
| Backups de originais fora da pasta do jogo (D034) | ✓ |
| Manifesto (D035) | ✓ |
| Limpar pastas vazias | ✓ (`deploy.cleanEmptyDirs`) |
| Deploy antes de lançar | ✓ |
| Mover staging com cálculo de espaço | ✓ |
| Troca de profile por diff (purge+deploy REJECT) | ✓ (D033) |

### Plugins e load order
| Item | Estado |
|---|---|
| Lista, ativar, flags, masters, filtros | ✓* |
| Sort nativo (D041) | ✓ |
| Dados do LOOT: grupos, load-after, mensagens, plugins sujos, userlist (D141) | ✓ |
| Grupos, regras, lock | ✓ |
| Sync com `plugins.txt` por triagem (D040) | ✓ |
| Ativar plugins externos automaticamente | ✓ (`plugins.enableExternallyAdded`) |
| Contrato FBLO | ✓ |
| Tela separada de Load Order (divergência 2) | ✓ |

### Profiles
| Item | Estado |
|---|---|
| Criar/ativar/clonar/remover | ✓ |
| Transferir | ✓ |
| Comparar e pontos de restauração (ADAPT) | ✓ |
| Toggle para habilitar profiles | — REJECT (D037) |
| Saves locais (por perfil, D142) | ✓ (`save_games`; tela Saves com plugins faltando, copiar/mover, excluir, clonar com saves) |
| INIs locais | — DEFER (LV8) |

### Games
| Item | Estado |
|---|---|
| Managed/Discovered/Supported | ✓ |
| Busca rápida/completa | ✓ (`ScanGames` quick/full) |
| Grade/lista | ✓ |
| Ocultar | ✓ |
| Localizar manualmente | ✓ |
| Parar de gerenciar | ✓ (com purge) |
| Múltiplas instâncias, jogo genérico (ADAPT) | ✓ |
| Um processo do app; a segunda abertura traz a janela à frente (D141) | ✓ |

### Settings
| Item | Estado |
|---|---|
| Abas Interface, Aplicação, Mods, Plugins, Workarounds, Tema (Download oculta) | ✓ |
| Advanced mode | ✓ |
| GPU acceleration | ✓ |
| Desktop notifications | ✓ |
| Reset suppressed notifications | ✓ |
| Relative times, hide top-level category, reduce motion, compact headers | ✓ |
| Deploy on enable, enable on install | ✓ |
| Backups (automático, manual, restaurar, de arquivo) | ✓ |
| Clean up empty directories, enable externally added plugins | ✓ |
| Atualização do app (`app.updateCheck`, `app.updateChannel`) | ✓ (F15, D104; deixam de ficar ocultos, D091 item 1) |
| Multi-user | — REJECT |
| Run at startup | — DEFER |
| Install on download | — N/A (V2) |

### Shell
| Item | Estado |
|---|---|
| Sidebar global + jogo | ✓ |
| Title bar custom com launcher | ✓ |
| Notificações (sino, ações, suprimir) | ✓ |
| Help/About | ✓ |
| Dashboard personalizável | ✓ |
| Conta Nexus | — N/A (V2) |
| Downloads na sidebar | — DEFER (reservado sem botão, anti-pattern 18) |
