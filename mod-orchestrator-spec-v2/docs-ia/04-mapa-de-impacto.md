# Mapa de impacto

Use antes de alterar uma regra, contrato ou entidade. Encontre a linha, leia todos os documentos citados e verifique os invariantes listados. Se a mudança não se encaixa em nenhuma linha, investigue antes de implementar e acrescente a linha.

| Se mudar... | Documentos afetados | Invariantes | Telas afetadas |
|---|---|---|---|
| Normalização de caminho / Location | core/01, core/02, core/04, core/05, core/09 | INV-ID-01..04 | Mods (arquivos), Conflicts |
| GameInstance / targets / staging | core/11, core/04, core/13, core/14 | INV-LIB-03, INV-DEP-08 | Games, Settings › Mods |
| Contrato do adapter / capabilities | core/11, core/12, ui/00 (navegação), ui/01, `ports.GameAdapter`, teste de arquitetura (literais de jogo) | — | todas do workspace |
| Marcadores das pastas / detecção de implantação estrangeira | core/04 §10–11, core/11 §4, D058/D059, diagnóstico `foreign_deployment` (F9) | INV-LIB-03, INV-DEP-08 | Games, Overview, assistente (DLG-01) |
| Estado de app (instância ativa, jogos ocultos) | docs-ia/03, D060, `ports.AppState` | — | barra de título, Games |
| Descoberta (StoreScanner, busca completa) | core/11 §1 e §3, D057, D113, `Definition.Discovery` de cada adapter | — | Games |
| Recurso ligado/desligado numa instância | core/11 §1 (Recursos por instância), `game.Definition.Effective`, `ports.InstanceDefinition`, `games.SetFeature`, tabela `instance_features`, bridge `InstanceFeatures`/`SetInstanceFeature`, D115 | INV-FEAT-01..03 | navegação do workspace, Games (detalhes), Settings por jogo |
| Manifesto de jogo ou entrada do usuário | core/11 §1 (Jogos descritos por dados), `game.Manifest`, `ports.GameEntries`/`EntryHost`, adapter `generic`, `games.Registry.SetEntries`, tabela `game_entries`, bridge `GameEntries`/`ExportGameEntry`/`ImportGameEntry`/`DeleteGameEntry`, D116, D117 | INV-ENT-01..04 | Games, assistente de jogo genérico |
| Nível de suporte ou classe de um recurso | core/11 §1 (Registro de jogos), `game.Describe`, `Registry.Support()`, bridge `GamesSupport()`, D113 | — | Games, Extensions |
| Capability nova ou interface opcional de adapter | core/11 §1 (catálogo e tabela de contratos), `game.Catalog()`, `games.contracts`, core/12 §2, `capability.*` no i18n, D112; se traz tela, `games.FeatureScreen`; se muda parte de tela ou área de Problemas, `games.Sections`/`games.DiagnosticAreas` (D132) | — | Extensions, Games (detalhes), menu do jogo, Ajustes da instância |
| Recurso opcional novo (módulo N1: saves, settings do jogo) | pontos de contribuição dos serviços (`deployment.PostDeploy`/`PostPurge`, `diagnostics.Module`, `profiles.Copier`, `overview.FigureSource`, `profiles.Section`, `library.FileStates`), seção própria no perfil (`profile.Section`), lista no bootstrap, `TestCoreDoesNotImportThePluginsModule` estendido ao módulo novo, D133 | INV-OPS-06 | menu do jogo, Visão geral, Perfis, Diagnóstico |
| Saves por perfil / chave de settings do jogo | core/07 §3, §4, §7, core/12 §10, D142, `ports.SaveGamesSupport`, `sdk/savegame`, módulo `saves`, `domain/gameini`, `domain/gamesettings` (tabela `applied_game_settings`), diagnóstico `save_path_external`, ui/telas/saves.md | INV-ID-03, INV-OPS-01, INV-FEAT-03 | Saves, Perfis (clonar), Diagnóstico |
| ModType | core/11, core/12, core/03, core/04 | INV-CON-01 | Mods (coluna/inspector) |
| Modelo de Mod / atributos | core/01, core/02, ui/telas/mods | INV-LIB-01, INV-LIB-05 | Mods |
| Installation / installers | core/02, core/03, core/15 (downloads) | INV-LIB-02, INV-LIB-04 | Mods, diálogo FOMOD (DLG-06), fixtures `integration/testdata/fomod` |
| Archive store / retenção | core/02, core/13, core/14 | — | Settings › Mods, Mods |
| ModOrder / motor de ordenação | core/05, core/07, core/08 (motor compartilhado), core/04 | INV-ORD-* | Mods, Conflicts, Profiles |
| OrderRule / Dependency / Incompatibility | core/05, core/06, core/10 | INV-ORD-03/04, INV-CON-02 | Mods, Conflicts, Diagnostics |
| FileOverride / FileExclusion | core/05, core/04 | INV-CON-01/03 | Conflicts, Mods (arquivos) |
| Profile (conteúdo, clone, troca) | core/07, core/04, core/08, ui/telas/profiles | INV-ORD-01/02 | Profiles, topbar |
| Deploy (plano, métodos, journal, manifesto) | core/04, core/09, core/10, core/14, D078/D079 | INV-DEP-*, INV-EXT-01 | topbar, Mods, Overview, Settings › Mods, DLG-14/16/17/18 |
| External changes / arquivos gerados | core/09, core/04, core/10, core/12 §9 (saídas conhecidas), D080/D081 | INV-EXT-*, INV-DEP-01 | DLG-14/15, topbar, Overview, Diagnostics |
| Plugins / LoadOrder / sorter / provedor LOOT (D141) | core/08, core/12, core/09 (load_order change) | INV-PLG-*, INV-ORD-05/06 | Plugins, Load Order |
| HealthCheck / Diagnostic | core/10 e o core do módulo que emite; ação nova = comando em `diagnostics.Commands()` ou lugar em `diagnostics.Places()` + `PLACES` da UI; texto `diag.*` no catálogo i18n; código de um só jogo vai no catálogo do adapter (`ports.CatalogProvider`, D131); D082/D083 | INV-OPS-06 | Diagnostics, Dashboard, Overview, Mods (faixas), topbar, sidebar, sino |
| Notification (geração, agregação, desktop) | core/10 §2, `ui.desktopNotifications`, D082/D083 | INV-OPS-01 | sino, desktop do Windows |
| Operation / Event | core/00, core/10, bridge; evento reversível precisa carregar o inverso no payload (D082) | INV-OPS-01/03 | operation center, histórico |
| Histórico (projeção, filtros, reversão) | core/10 §3, `history.retentionDays`, D070/D082 | — | Diagnostics › Histórico, Mods (toolbar) |
| Lock de instância / concorrência | core/00, todas as operações | INV-OPS-02 | todas as ações mutantes |
| Settings (novo setting ou default) | core/13 e o core do módulo dono | — | Settings |
| Backups do banco / restauração | core/14 §3–4, D090 | INV-OPS-01 | Settings › Soluções, DLG-27, diagnóstico `backup_failed` |
| Launch (Play) | core/11 §6, core/04 §9, core/10 (coluna "launch (aviso)"), D045, D090 | INV-DEP-06 | barra de título, DLG-26, Overview, Dashboard |
| Persistência / schema | core/14, migrations | — | — |
| Integração dettmann-ui / tema | ui/03, ui/04, todos ui/telas | — | todas |
| Distribuição de tela (design v1) | D119; artboard no canvas e `propostas/redesign-telas-v1-fechamento.md`; ui/01 (artboard e fase), o `ui/telas/*.md` da tela; mudança de layout começa pelo artboard aprovado | — | a tela |
| Shell: níveis, barra superior, menu do jogo, sino, "Jogar" | ui/00 §2, D120, D045, core/11 §5–6 (navegação e launch), core/10 §2 (notificações), consulta `Workspace()` do bridge | — | todas |
| Texto de UI / idioma | catálogo i18n (`frontend/src/i18n/catalog/`); rótulo de id de um jogo (flag de conteúdo, instalador, opção de launch) e texto de diagnóstico do adapter no catálogo do adapter (`Catalog()`, servido por `AdapterMessages`, D131) | INV-OPS-05 | todas |
| Código de erro do bridge | core/00 §6, `internal/bridge/errors.go`, catálogo i18n (`error.<code>`) | INV-OPS-05 | todas |
| Log técnico (formato, rotação, filtros) | core/10 §4, core/13 (`app.logLevel`), ui/telas/diagnostics | — | Diagnostics › Log |
| Escopo de release | 00-visao-e-escopo, plano, core/15 | — | — |
| Licença, dependência nova, empacotamento, assinatura, atualização do app | D076, D077, D096, D103–D105, `plano-de-publicacao.md`, `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`, workflows em `.github/`, `build/windows/installer/project.nsi`, `tools/release` | INV-LIB-04 | Settings › Aplicação › Atualizações (DLG-30) |

## Perguntas obrigatórias antes da mudança

1. Qual estado muda e quem é o dono? (`03-fontes-de-verdade.md`)
2. Algum invariante deixa de valer? Se sim, é decisão nova, não ajuste.
3. Algum dado derivado vai passar a ser persistido?
4. Operações longas existentes mudam de steps, erros ou eventos?
5. A UI de alguma tela precisa de dado novo do bridge?
6. Algum diagnóstico passa a existir ou deixa de existir?
7. Algum setting novo é necessário, e qual o escopo (app/instância/profile)?
