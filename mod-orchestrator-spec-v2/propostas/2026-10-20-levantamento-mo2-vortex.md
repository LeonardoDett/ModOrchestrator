# Levantamento: o que o MO2 e o Vortex fazem e o Mod Orchestrator ainda não

Status: **levantamento** (2026-10-20). Decidido na D140: todos os itens entram antes da v1; plano em `propostas/2026-10-20-plano-lacunas-mo2-vortex.md`.

## Fonte e método

- **Fontes**: código-fonte local em `C:\Programacao\Projetos\ASSETS` (usado só para consulta):
  - `ModOrganizer2/src`: o executável principal do MO2 (sem os plugins de jogo, LOOT e instaladores, que são repositórios separados).
  - `Vortex`: monorepo completo (`src/renderer/src/extensions`, 39 extensões em `extensions/`, 86 extensões de jogo em `extensions/games`).
- **Comparado com**: `master` em 9e6b8b6 (código, `sdk/`, bridge, catálogo de diagnósticos e settings) e a spec (`00-visao-e-escopo.md`, `core/`, `docs-ia/08-paridade-vortex-v1.md`, `core/15-futuro.md`, decisões até D139).
- **O que este documento acrescenta à paridade (docs-ia/08)**: a 08 confere recurso por extensão. Aqui o recorte é mais fino: **regras, checagens e controles dentro do código** (o que dispara aviso, o que bloqueia, o que cada jogo declara) que não aparecem como "recurso" numa lista de extensões.
- **Prioridade**: impacto no uso real (perda de dados, crash sem explicação, ordem errada, atrito diário), com Skyrim SE primeiro e o resto do multi-jogo depois.
- **Escopo de jogo (D112)**: cada item diz se é do núcleo (vale para todo jogo), de uma capability ou só de um adapter.

## Resumo

Os quatro itens que mais podem impactar o uso:

1. **O app pode abrir duas vezes.** MO2 e Vortex impedem a segunda instância; o Mod Orchestrator não tem trava entre processos. Duas janelas podem implantar e escrever no mesmo jogo e no mesmo banco ao mesmo tempo. Correção pequena (núcleo).
2. **BSA de outra versão do jogo derruba o Skyrim sem aviso.** O Vortex lê a versão do cabeçalho de cada BSA ativo e avisa quando ela é de outro jogo (por exemplo, BSA do Skyrim LE no SE). Correção pequena (adapter `skyrimse`).
3. **Ordenar plugins sem a masterlist do LOOT.** Os dois gerenciadores ordenam com o LOOT (masterlist da comunidade, plugins sujos, incompatibilidades conhecidas). O sort nativo só conhece masters, regras do usuário e grupos. Já está previsto para V1.x (D041); vale decidir se entra antes da v1.
4. **Perfis sem saves separados.** Os perfis já existem na V1, mas os saves são compartilhados. Os dois gerenciadores oferecem saves por perfil e mostram plugins faltando no save. Trocar de perfil e carregar um save feito com outro conjunto de plugins é a forma mais comum de corromper um jogo. Previsto para V1.x (`save_games`).

O resto (seções abaixo) é média ou baixa prioridade. Nada encontrado contradiz decisões vigentes.

## Já coberto (conferido no código, para não reabrir)

Alterações externas nos quatro tipos do Vortex (`refchange`, `valchange`, `deleted`, `srcdeleted`) e captura de arquivos gerados (core/09, D046); implantação estrangeira (D035); staging marcada e `staging_foreign`; nomes sem diferença de maiúsculas; arquivos ocultos por mod (equivalente ao `.mohidden`); separadores com cor; pontos de restauração (equivalente a "Create/Restore Backup" do MO2); trava de índice e grupos de plugins; ESL com índice `FE:xxx` e limites por tipo; `plugins.txt` alterado por fora; detecção de jogo em execução; versão do jogo mudou; SKSE ausente ou desatualizado; reinstalar com as escolhas do FOMOD; duplicados, variantes e substituição; importação do MO2 e do Vortex; deploy antes de lançar; mover staging e archives; caminhos longos; pacote de diagnóstico; exportar a lista de mods e a load order.

## Alta prioridade

| # | O que MO2/Vortex fazem | Onde | Situação no Mod Orchestrator | Escopo | Sugestão |
|---|---|---|---|---|---|
| A1 | Uma só instância do app; a segunda abertura repassa argumentos para a primeira e sai. | MO2 `multiprocess.cpp` (QSharedMemory); Vortex `src/main/src/main.ts` (`requestSingleInstanceLock`) | **Ausente.** `main.go` não usa `SingleInstanceLock` e as travas de `application/instancelock` só valem dentro do processo (D065). Duas janelas podem rodar deploy e purge no mesmo jogo, cada uma com o seu journal. | Núcleo | Wails 2.12 já tem `options.SingleInstanceLock` (com `OnSecondInstanceLaunch` para trazer a janela à frente). Teste: segunda instância não abre e foca a primeira. |
| A2 | Ao implantar, lê os 9 primeiros bytes de cada BSA/BA2 carregado por plugin ativo e avisa quando a versão é de outro jogo (Skyrim LE 104, SE 105, FO4 BA2 1/7/8, etc.). | Vortex `gamebryo_plugin_management/archiveCheck.ts` | **Ausente.** Só existe `bsa_without_plugin`. Um BSA do LE no SE fecha o jogo ao carregar, sem mensagem. | Adapter `skyrimse` (health check) | Novo código `archive_wrong_game` (erro), com o mod de origem e a ação "Abrir pasta do mod". |
| A3 | Ordenar plugins com o LOOT: masterlist da comunidade, grupos padrão, mensagens (patch necessário, incompatível), plugins sujos (ITM/UDR), regras do usuário (userlist). | MO2 `loot.cpp`, `lootdialog.cpp`; Vortex `gamebryo_plugin_management/autosort.ts`, `util/masterlist.ts`, `util/metadataLists.ts` | **Previsto V1.x** (D041, setting `plugins.lootProvider`). Hoje o sort nativo só sabe masters, regras e grupos do usuário. Quem vem do Vortex/MO2 espera a ordem do LOOT e os avisos dele. | Capability `plugins` + módulo provedor (fase D, extension host) | Decidir se o provedor LOOT (ou pelo menos ler a masterlist e o `userlist.yaml` como restrições, sem executar o LOOT) entra antes da v1 fechada. |
| A4 | Saves por perfil e, na lista de saves, os plugins que faltam (MO2 ainda oferece "habilitar os mods que têm esses plugins"). | MO2 `profile.cpp` (`enableLocalSaves`), `savestab.cpp`, `transfersavesdialog.cpp`; Vortex `gamebryo-savegame-management`, `local-gamesettings` | **Previsto V1.x** (`save_games`, `features.localSaves`, core/07 §6). Os perfis já existem na V1 e compartilham os saves. | Capability `save_games` | Antes da v1, ao menos avisar ao trocar de perfil que os saves são compartilhados; ou antecipar só o namespace de saves (`SLocalSavePath`), deixando a tela Saves para V1.x. |

## Média prioridade

| # | O que MO2/Vortex fazem | Onde | Situação no Mod Orchestrator | Escopo | Sugestão |
|---|---|---|---|---|---|
| M1 | Lista de executáveis/ferramentas: argumentos, pasta de trabalho, variáveis de ambiente, "exclusivo", "fechar/ocultar o gerenciador ao iniciar"; ao fechar a ferramenta, o gerenciador atualiza o estado. Cada jogo declara as ferramentas conhecidas (xEdit, Wrye Bash, FNIS, Creation Kit...). | MO2 `editexecutablesdialog.cpp`, `executableslist.cpp`, `processrunner.cpp`; Vortex `starter_dashlet`, `types/ITool.ts`, `supportedTools` em 44 dos 86 jogos | **Previsto V1.x** (core/15, capability `tools`). Como os links são reais, as ferramentas já rodam fora do app; falta o atalho e o scan automático de saídas ao fechar. Pesa para quem usa Nemesis/Pandora, BodySlide e DynDOLOD. | Capability `tools` | Manter em V1.x; se possível, o scan de saídas ao fechar entra junto com a v1 (o resto do contrato já existe: `toolOutputs`, D045). |
| M2 | Conflitos dentro de BSA/BA2 e a regra "arquivo solto sempre vence o BSA, seja qual for a prioridade". MO2 mostra flags próprias de conflito de archive. | MO2 `modinfo.h` (`FLAG_ARCHIVE_*`), setting `archive_parsing_experimental`; Vortex `gamebryo-archive-support` | **Previsto V1.x.** Hoje o usuário não vê que um mod empacotado em BSA perde para um arquivo solto de prioridade menor. | Adapter (capability nova ou parte de `plugins`) | Enquanto não houver o cálculo, explicar a regra no detalhe do mod que tem BSA (texto do adapter). |
| M3 | Lançamento robusto: exige elevação (erro 740) e oferece reabrir como administrador; Steam fechado ou rodando como admin; executável ou pasta de trabalho inexistente. Vortex lança pelo launcher da loja quando o jogo exige (Steam, Epic, Xbox, GOG, Ubisoft, EA). | MO2 `spawn.cpp`; Vortex `requiresLauncher` em 54 dos 86 jogos, `util/EpicGamesLauncher.ts`, `util/xbox/XboxLauncher.ts` | **Parcial.** `infrastructure/system/launch.go` usa `exec.Command`: um `SkyrimSE.exe` marcado "executar como administrador" falha sem explicação. Não há lançamento por loja. | Núcleo (740) e contrato do adapter (loja) | 740 → mensagem clara e opção de lançar elevado (ShellExecute `runas`). Lançar por loja como campo opcional do lançamento no contrato do adapter, quando houver jogo que precise. |
| M4 | Depois que o jogo fecha, lê o log do script extender e lista os plugins DLL que falharam ao carregar (versão incompatível). | Vortex `extensions/script-extender-error-check` | **Ausente.** Há `framework_missing`, `framework_outdated` e `game_version_changed`; `skse_plugin_version_mismatch` está como V1.x em core/12 §7. Depois de uma atualização do jogo, é o aviso mais útil. | Adapter `skyrimse` | Health check que lê `Documents\My Games\Skyrim Special Edition\SKSE\skse64.log` ao voltar o foco/fechar o jogo. |
| M5 | Mod sem conteúdo que o jogo carrega ("No valid game data"), com "Ignorar" e "Marcar como funcionando". | MO2 `modinfo.h` (`FLAG_INVALID`), menu do mod ("Ignore missing data", "Mark as converted/working"), feature `ModDataChecker` | **Ausente como diagnóstico.** A resolução de root na instalação evita a maioria; sobra o mod vindo de pasta, da importação do MO2/Vortex ou com o tipo trocado. | Adapter (regra de conteúdo) + núcleo (diagnóstico por mod) | Diagnóstico `mod_content_unrecognized` (aviso) a partir das dicas de root e ContentFlags que o adapter já declara; ação "ignorar neste mod". |
| M6 | Avisa quando o jogo, a staging ou o app estão em local problemático: Program Files, Desktop, Documentos, Downloads, OneDrive; recusa jogo da Microsoft Store (`WindowsApps`). | MO2 `sanitychecks.cpp` (`checkProtected`, `checkMicrosoftStore`) | **Ausente.** OneDrive com arquivos sob demanda quebra hardlinks e o journal; Game Pass não é suportado (core/12 §5) mas nada avisa se o usuário localizar a pasta à mão. | Núcleo (pastas sincronizadas) + adapter (variante não suportada) | Checagem no assistente "Adicionar jogo" e no "Mover staging"; health check se a pasta mudar depois. |
| M7 | Plugin feito para outra edição do jogo (Skyrim LE, cabeçalho `HEDR` 0.94, no SE que espera 1.7/1.71). MO2 marca mods de outro jogo (`FLAG_ALTERNATE_GAME`); o LOOT avisa. | MO2 `modinfo.h`; LOOT | **Ausente**, mas o adapter já lê a versão do `HEDR` (`adapters/skyrimse/plugins.go`). | Adapter `skyrimse` | Diagnóstico `plugin_wrong_game_version` (aviso), barato porque o dado já é lido. |
| M8 | INIs do jogo por perfil e "INI tweaks" que os mods trazem (aplicados sobre o INI do perfil). | MO2 `profile.cpp` (`enableLocalSettings`, `createTweakedIniFile`); Vortex `local-gamesettings`, `ini_prep` | **Previsto V1.x** (`game_settings`). | Capability `game_settings` | Manter em V1.x; ao desenhar, incluir os INI tweaks por mod, que os dois têm. |
| M9 | Metadados de cada mod gravados junto da pasta do mod (`meta.ini`: versão, origem, arquivo de instalação, notas, categoria), o que permite reconstruir a lista a partir da staging. | MO2 `modinforegular.cpp` | **Pendente de decisão do usuário** (D100, recuperação depois de perder o banco; trabalho futuro da F14, item 3). | Núcleo | O formato do MO2 é uma referência concreta para essa decisão. |
| M10 | (multi-jogo) Cada mod numa subpasta própria do destino (`Mods/<nome do mod>/...`) em vez de mesclar tudo. | Vortex `mergeMods: false` ou função em 15 jogos (Mount & Blade II, Cyberpunk 2077, Starfield, Subnautica, Palworld, RE2/RE3, DMC5...) | **Ausente no contrato do adapter.** Hoje um adapter só consegue isso se o archive já trouxer a pasta. | Contrato do adapter (`game.Definition`/`ModType`) | Campo opcional de layout por ModType ("mesclar" ou "pasta por mod"); entra quando o primeiro desses jogos for suportado. |
| M11 | (multi-jogo) INIs obrigatórios do jogo para mods soltos funcionarem (`bInvalidateOlderFiles`, `sResourceDataDirsFinal`) e invalidação de archives por perfil. | MO2 `profile.cpp` (`AutomaticArchiveInvalidation`); Vortex `gamebryo-archive-invalidation`, `gamebryo-test-settings` | **Não se aplica ao Skyrim SE**, mas é obrigatório para Fallout 4, Oblivion, Fallout 3/NV (próximos adapters da V1.x). | Capability `game_settings` | Prever no contrato de `game_settings` uma lista "chaves exigidas" com health check e correção automática. |

## Baixa prioridade

| # | O que MO2/Vortex fazem | Onde | Situação no Mod Orchestrator / sugestão |
|---|---|---|---|
| B1 | Árvore final do jogo ("o que o jogo vê" e qual mod fornece cada arquivo). | MO2 `datatab.cpp`, `filetree*.cpp` | Há arquivos por mod e conflitos por par, mas não a visão consolidada. Útil para suporte. |
| B2 | Abas no detalhe do mod: leia-me e textos, INIs com editor, imagens, plugins opcionais. | MO2 `modinfodialogtextfiles.cpp`, `modinfodialogimages.cpp`, `modinfodialogesps.cpp`; Vortex `file_preview` (DEFER) | O detalhe (D121) tem Arquivos; plugins opcionais já são cobertos por ocultar arquivo. |
| B3 | "Enviar para" primeiro/último conflito; instalar acima, abaixo ou dentro de um separador. | MO2 `modlistcontextmenu.cpp` | Há mover para topo, fundo e posição; os atalhos por conflito são conforto. |
| B4 | Criar mod vazio (para receber saídas de ferramenta à mão). | MO2 menu "Create empty mod" | A captura de arquivos gerados (D046) já cria o mod de destino; baixa necessidade. |
| B5 | Ao instalar por cima de um mod existente: mesclar, substituir ou renomear, com cópia de segurança opcional do mod antigo. | MO2 `queryoverwritedialog.h` (`ACT_MERGE`), setting `backup_install` | Temos variante e substituição; falta "mesclar" (caso do arquivo de hotfix publicado à parte), que hoje vira um mod separado acima, o que também funciona. |
| B6 | Pacotes BAIN (subpacotes numerados escolhidos pelo usuário) e archive dentro de archive. | MO2 plugin `installer_bain` (repositório separado); Vortex `installer_nested_fomod` | Root ambíguo pede decisão, mas só um root por vez. Comum em mods antigos de Skyrim. |
| B7 | Skyrim: fontes citadas no `fontconfig.txt` que não existem (texto some no jogo). | Vortex `gamebryo-test-settings` | Health check pequeno do adapter. |
| B8 | Plugins "fantasmas" (`.esp.ghost`, usados pelo Wrye Bash). | Vortex `gamebryo_plugin_management/util/ghost.ts` | Hoje um `.ghost` não aparece no inventário; só afeta quem usa Wrye Bash. |
| B9 | Flags de plugin além de master/light: medium e blueprint (Starfield), plugin sem registros, plugin com INI de mesmo nome, plugins carregados à força pelo jogo. | MO2 `pluginlist.cpp` | As flags já são definidas pelo adapter e os limites são por tipo; conferir quando vier Starfield. |
| B10 | Load order por data de modificação (Oblivion, Fallout 3/NV). | MO2 `pluginlist.cpp` (`LoadOrderMechanism::FileTime`) | O contrato `LoadOrderFile`/`Serialize` supõe arquivo; conferir quando vier um desses jogos. |
| B11 | Migração dos dados do usuário quando a extensão de um jogo muda. | Vortex `registerMigration` em 11 jogos | Relevante para extensões de terceiros (V2); o SDK já tem versão (D134). |
| B12 | Lojas: Xbox/Game Pass, EA app, Ubisoft. | Vortex `util/xbox`, `OriginStore.ts`, `UplayStore.ts` | Temos Steam, GOG, Epic e registro; Game Pass também não é suportado pelo MO2. |
| B13 | Crash dump do próprio app, com tipo e quantidade configuráveis. | MO2 settings `crash_dumps_type`, `crash_dumps_max` | Temos log rotativo e pacote de diagnóstico; um `panic` registrado com pilha no log já basta. |

## Fora do escopo (conferido e descartado)

- **Online / V2**: Nexus (login, endorse, rastrear, verificar atualização, categorias do Nexus), downloads e `nxm://`, coleções, checagem de requisitos por arquivo do Vortex (`health_check/checks/fileRequirementsCheck.ts`, depende do Nexus).
- **Próprios do VFS do MO2**: lista negra de executáveis, bibliotecas carregadas à força, `spawn_delay`, aviso de overlays (Nahimic, RivaTuner etc. em `sanitychecks.cpp`), arquivos bloqueados pelo Windows nas DLLs do próprio MO2. Com links reais, nada disso se aplica.
- **Já rejeitados por decisão**: symlink com elevação, ativador por mover, instalador .NET, mods "grudados" (sticky), telemetria (08 §1).

## Próximos passos sugeridos

1. A1 e A2: pequenos e sem decisão de produto; podem entrar já, numa fase "pendências antes da v1".
2. A3 e A4: decidir se entram antes da v1 fechada ou ficam em V1.x com aviso (a decisão é de produto).
3. M3 (erro 740), M4, M5, M7: health checks e mensagens pequenos, bons candidatos ao refinamento final.
4. M10 e M11: registrar como requisitos do contrato do adapter para quando os próximos jogos entrarem (D112).
