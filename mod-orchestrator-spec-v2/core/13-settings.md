# Catálogo de settings

Referências: D036, D037, D042, D044. Vortex: `settings_interface` (SettingsInterface), `settings_application` (SettingsVortex), `mod_management/views/Settings` e `Workarounds`, `gamebryo_plugin_management/views/Settings`, `recovery/Workarounds`, `theme-switcher`, `download_management` (Download).

Regras:
- Todo setting tem chave estável, escopo, tipo, default, release e dono (módulo). Setting novo exige linha aqui.
- Escopos: `app` (global), `instance` (por jogo gerenciado), `profile`.
- Settings **por jogo** aparecem na mesma aba do Vortex, com o seletor do jogo ativo no topo ("A maioria das opções aqui pode ser configurada por jogo", paridade Vortex).
- Mudança que exige reinício mostra aviso com "Reiniciar agora".
- Settings avançados/perigosos ficam sob "Modo avançado" (setting `ui.advancedMode`, paridade Vortex "Enable Advanced Mode").

A organização das abas segue o Vortex (D042): **Interface · Aplicação · Mods · Plugins · Download (reservada) · Workarounds · Tema**.

## Interface

| Chave | Escopo | Tipo | Default | Release | Nota |
|---|---|---|---|---|---|
| `ui.language` | app | en / pt-BR | idioma do SO se suportado, senão en | V1 | D044 |
| `ui.customTitleBar` | app | bool | true | V1 | reinício |
| `ui.desktopNotifications` | app | bool | false | V1 | core/10 |
| `ui.hideTopLevelCategory` | app | bool | false | V1 | |
| `ui.relativeTimes` | app | bool | true | V1 | "há 5 min" |
| `ui.reduceMotion` | app | bool | segue o SO | V1 | |
| `ui.compactHeaders` | app | bool | false | V1 | |
| `ui.advancedMode` | app | bool | false | V1 | revela opções avançadas |
| `ui.dashboard.dashlets` | app | lista (id, visível, ordem) | todos visíveis | V1 | |
| `automation.deployOnChange` | instance | bool | true | V1 | "Implantar mods ao habilitar" (D036) |
| `automation.enableOnInstall` | instance | bool | true | V1 | "Habilitar mods ao instalar (no profile ativo)" |
| `automation.deployDelayMs` | app | int | 1500 | V1 | avançado |
| `notifications.resetSuppressed` | app | ação | — | V1 | com contagem de suprimidos |
| `diagnostics.showUnreviewedConflicts` | instance | bool | true | V1 | core/05 §5.4 |
| `app.runAtStartup` | app | bool | false | V1.x | |
| `app.startMinimized` | app | bool | false | V1.x | |
| `automation.installOnDownload` | app | bool | — | V2 | reservado (downloads) |

Não existe `profiles.enabled` (D037).

## Aplicação

| Chave | Escopo | Tipo | Default | Release | Nota |
|---|---|---|---|---|---|
| `app.dataDir` | app | caminho (somente leitura + abrir) | `%APPDATA%\ModOrchestrator` | V1 | D018; mudar = mover dados (V1.x) |
| `app.logLevel` | app | error/warn/info/debug | info | V1 | |
| `app.gpuAcceleration` | app | bool | true | V1 | reinício |
| `app.updateCheck` | app | bool | false | V1 | única chamada de rede V1 |
| `app.updateChannel` | app | stable/beta | stable | V1 | |
| `app.anonymizeSupportBundle` | app | bool | true | V1 | core/10 §4 |
| `history.retentionDays` | app | int | 180 | V1 | |
| `snapshots.autoRetention` | app | int | 20 | V1 | por profile |
| `snapshots.bulkThreshold` | app | int | 10 | V1 | core/07 §6 |
| `app.multiUser` | app | per-user/shared | per-user | fora | Vortex tem; não previsto |

## Mods (por jogo)

| Chave | Escopo | Tipo | Default | Release | Nota |
|---|---|---|---|---|---|
| `mods.stagingPath` | instance | caminho | sugerido (core/11 §4) | V1 | mudar = operação `move_staging` |
| `mods.useSuggestedStaging` | app | bool | true | V1 | |
| `mods.archiveStorePath` | instance | caminho | sugerido | V1 | mudar = mover archives |
| `mods.importRetention` | app | copy/move/none | copy | V1 | D032 |
| `deploy.method` | instance | hardlink/symlink/copy | hardlink se disponível | V1 | mostra disponibilidade e motivo; mudar exige purge |
| `deploy.cleanEmptyDirs` | instance | bool | true | V1 | Vortex "Clean up empty directories during deployment" |
| `deploy.autoRestoreMissing` | instance | bool | false | V1 | core/09 §4 |
| `deploy.verifyOnFocus` | app | bool | true | V1 | core/04 §7 |
| `library.verifyStagingOnStartup` | app | bool | false | V1 | core/02 §5 |
| `import.maxExtractedSizeGB` | app | int | 64 | V1 | avançado |
| `import.maxEntries` | app | int | 500000 | V1 | avançado |
| `order.snapshotMoveThreshold` | app | int | 20 | V1 | core/05 §4 |

## Plugins (aparece se algum jogo gerenciado tem `plugins`)

| Chave | Escopo | Tipo | Default | Release |
|---|---|---|---|---|
| `plugins.autoSort` | instance | bool | true | V1 |
| `plugins.enableOnModEnable` | instance | bool | true | V1 |
| `plugins.enableExternallyAdded` | instance | bool | false | V1 |
| `plugins.lootProvider` | instance | bool | false | V1.x |

## Download (reservada)

A aba não aparece na V1 (anti-pattern 18). Chaves previstas V2: pasta de downloads, threads, limite de banda, lidar com links de provider, "trazer app para frente ao iniciar download".

## Workarounds

| Chave / ação | Escopo | Release | Nota |
|---|---|---|---|
| Backup do banco: último automático, último manual, "Criar backup", "Restaurar…", "Restaurar de arquivo (perigoso)" | app | V1 | core/14; paridade `recovery` |
| "Verificar implantação agora" | instance | V1 | core/04 |
| "Reconciliar deploy" | instance | V1 | aparece se `deploy_interrupted` |
| "Limpar arquivos temporários" | app | V1 | `.tmp` de operações |
| "Reconstruir cache de cabeçalhos de plugins" | instance | V1 | |
| `workarounds.longPathSupport` | app | V1 | informativo: estado do suporte a caminhos longos do SO |

## Tema

| Chave | Escopo | Tipo | Default | Release |
|---|---|---|---|---|
| `theme.mode` | app | dark/light/system | dark | V1 |
| `theme.id` | app | temas registrados | `orchestrator` | V1 |
| `theme.fontScale` | app | 90–125% | 100% | V1 |
| `theme.density` | app | comfortable/compact | comfortable | V1 |
| Editor de cores/fontes (Vortex permite clonar tema) | app | — | — | V1.x |

## Implementação (F12, D090/D091)

- `app.dataDir` é só exibido (com "Abrir"); `mods.stagingPath`, `mods.archiveStorePath` e `deploy.method` vivem na instância e mudam por operação com prévia (mover staging, mover arquivos, trocar método), nunca como valor gravado.
- `ui.dashboard.dashlets` é uma lista ordenada (`-id` oculto, `+id` fixado); a ordem muda em Dashboard › Personalizar.
- Limites usam o stepper `Input.Number` (D092); avançados só com `ui.advancedMode`.
- `app.updateCheck`/`app.updateChannel` ficam ocultos até a F15 (D091 item 1).
- Reinício: aviso persistente com "Reiniciar agora" enquanto um setting `RestartRequired` difere do valor da inicialização ou uma restauração aguarda.

## Critérios de aceite

- Todo setting V1 desta tabela existe, com o default indicado, e aparece na aba indicada.
- Nenhuma aba reservada aparece.
- Settings por jogo mudam de valor ao trocar o jogo selecionado no topo da aba.
