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
| `catalog()` | Códigos de diagnóstico próprios e textos, por idioma, dos ids que o adapter define (D131). |
| `launch()` | Executável, argumentos, pasta de trabalho, e como detectar "jogo em execução". |
| `plugins` (capability) | Reconhecer plugins, ler cabeçalho, flags, implícitos, limites, restrições rígidas, formato de índice. |
| `loadOrder` (capability) | Serializar/ler o arquivo de load order; se ordem manual é permitida. |
| `gameSettings`, `saveGames` (V1.x) | Arquivos de configuração locais; redirecionamento de saves. |
| `toolOutputs()` | Pastas onde ferramentas conhecidas geram arquivos (core/09 §3). |
| `defaultCategories()` | Categorias iniciais. |
| `version(root)` | Versão do jogo instalada. |

### Forma do port na F3 (D057)

O port `ports.GameAdapter` implementa as linhas acima assim: `Definitions()`, `InstanceDefinition(id, targets)` (definição efetiva de **uma instância**: estática nos jogos fixos, montada dos targets do usuário no `generic`; capabilities efetivas = adapter + instância), `ValidateRoot(fs, id, root)` (devolve `*game.RootError` com `reason` e, se for o caso, o marcador esperado), `Targets(id, root, custom)`, `RootHints(id)` e `ContentFlags(id, footprint)`. O adapter só recebe um `FileReader` (leitura): não escreve no disco, nem no do jogo (anti-pattern 24). ModTypes são dados (`game.ModType` com `Priority` e `Detect []DetectRule`) e `Definition.DetectModType(paths)` escolhe o de maior prioridade. `healthChecks`, `launch`, `plugins`, `loadOrder`, `installers`, `toolOutputs` e `defaultCategories` entram como interfaces opcionais nas fases que os usam (F4, F9, F11, F12).

Desde a D113 a descoberta não é mais método do port: `Markers`, `RegistryHints`, `VersionFile` e `Detect` viraram o dado `Definition.Discovery` (ver "Registro de jogos" abaixo).

### Registro de jogos (D113)

Cada `GameDefinition` é uma entrada do registro e carrega, além de targets e mod types:

| Campo | Conteúdo |
|---|---|
| `Support` | `full` (adapter dedicado), `declared` (só dados) ou `custom` (definido pelo usuário). |
| `Discovery.Stores` | Id do jogo em cada loja (`steam`, `gog`, `epic`). |
| `Discovery.Registry` | Valores do registro que apontam a instalação. |
| `Discovery.Markers` | Arquivos, relativos à raiz, que identificam a pasta do jogo (busca completa). |
| `Discovery.VersionFile` | Executável cuja versão é a do jogo. |

Cada capability é também um **recurso** com classe (`game.Describe`): `base` (sempre ligado) ou `optional` (o usuário poderá ligar e desligar por instância), e dependências (`load_order` exige `plugins`). Definição que declara um recurso sem o que ele exige não registra.

### Jogos descritos por dados (D116, D117)

Um **manifesto** (`game.Manifest`, JSON com `schema`) descreve um jogo sem código: descoberta, targets relativos à raiz (com `creatable`, D118), mod types, dicas de root, saídas de ferramenta e opções de lançamento. As capabilities são derivadas do conteúdo; o arquivo não as declara. Todo jogo que o usuário adiciona é uma **entrada**: um manifesto com id `user.<nome>` guardado em `game_entries` e servido pelo adapter `generic`, que é o único `ports.EntryHost`. `games.Registry.SetEntries` troca as entradas com o app rodando. O jogo `generic` restante é só o modelo de onde o assistente parte: gerenciá-lo cria a entrada e a instância pertence a ela. Entradas podem ser exportadas, importadas (nunca substituindo um id existente) e excluídas quando nenhuma instância as usa.

### Recursos por instância (D115)

Um recurso é **oferecido** pela definição, **ligado** pelo usuário em cada instância e **efetivo** quando as duas coisas valem e o que ele exige também está efetivo. O core pede a definição de uma instância só por `ports.InstanceDefinition`, que já devolve as capabilities efetivas; recurso desligado é tratado como recurso que o jogo não tem. Desligar nunca apaga nem reverte arquivos do jogo. `games.Features` lista os três estados e `games.SetFeature` muda a escolha (`feature_unavailable`, `feature_locked`, `feature_requires`).

### Catálogo de capabilities (já em `game.go`)

`filesystem_mod_target`, `multiple_mod_types`, `installer`, `plugins`, `load_order`, `save_games`, `game_settings`, `tools`, `launch`, `external_change_strategy`, `adapter_installers`, `health_checks`, `default_categories`, `running_detection` (as quatro últimas pela D112). Extensível: capabilities novas entram no catálogo (`game.Catalog()`) com decisão registrada.

### Capability e contrato (D112)

Cada capability servida por código do adapter tem **uma** interface opcional, e cada interface opcional tem **uma** capability. O registro (`games.NewRegistry`) recusa o adapter que declara sem implementar ou implementa sem declarar.

| Capability | Interface (`ports`) |
|---|---|
| `plugins` | `PluginSupport` (sub-contratos opcionais: `PluginArchives`, `ArchiveChecker`, `ArchiveIndex` — índice dos archives e ordem em que carregam, D147) |
| `load_order` | `LoadOrderSupport` |
| `launch` | `LaunchSupport` |
| `adapter_installers` | `InstallerProvider` |
| `health_checks` | `HealthCheckProvider` |
| `default_categories` | `CategoryProvider` |
| `running_detection` | `ProcessDeclarer` |
| `save_games` | `SaveGamesSupport` (D142) |
| `tools` | `ToolSupport` (D146) |

As demais são respondidas pela própria definição (`filesystem_mod_target`, `multiple_mod_types`, `installer`, `external_change_strategy`) ou estão reservadas (`game_settings`). O registro valida o que o adapter **oferece**; o que vale para uma instância continua vindo de `InstanceDefinition`.

`Registry.Support()` devolve a matriz de suporte: para cada jogo, cada capability do catálogo como `available` ou `not_applicable`. `not_applicable` é "este jogo não tem esse processo", o caso normal, nunca um erro. Desde a D113 a mesma consulta traz o nível de suporte, as lojas onde o jogo é procurado e, por recurso, classe, dependências e padrão; o bridge a expõe em `GamesSupport()`.

### Catálogo do adapter (D131)

O que o adapter mostra ao usuário vem com ele, por `ports.CatalogProvider` (`Catalog()`): os códigos de diagnóstico que só ele emite (`diagnostic.CodeSpec`: código, módulo, aviso antes do launch) e os textos por idioma das chaves `mods.content.<flag>`, `mods.installer.<id>`, `launch.option.<id>` e `diag.{code,impact,evidence,action}.*`. Não é capability: descreve o adapter e não liga processo nenhum; sem ela a UI mostra os textos do app e, para id que não conhece, o id. O registro recusa catálogo sem `en`, idioma sem as chaves do `en`, texto vazio, chave fora desses prefixos, código sem `diag.code.<código>`, código repetido (do core ou de outro adapter) e chave de dois adapters com textos diferentes. O bridge serve os textos em `AdapterMessages(idioma)`, com `en` para o idioma que o adapter não traduz; a UI os lê **depois** do catálogo do app, então um adapter nunca troca texto do app. O catálogo do app fica só com texto do app: `launch.option.game`, `mods.installer.basic` e `mods.installer.imported` são ids do core.

### SDK do adapter (D134)

O contrato do adapter é público em `modorchestrator/sdk` (fora de `internal/`, com `sdk.APIVersion`): as interfaces opcionais, uma por capability, e, nos subpacotes `sdk/game`, `sdk/mod`, `sdk/plugin`, `sdk/installer`, `sdk/diagnostic`, `sdk/event`, `sdk/health`, `sdk/ordering` e `sdk/relpath`, o vocabulário que elas usam. Os nomes são aliases dos tipos do core: o SDK não tem comportamento nem cópia a sincronizar. Os adapters embutidos importam só o SDK, a biblioteca padrão e outros adapters (`TestAdaptersImportOnlyTheSDK`; os testes podem usar o core). Um nome entra no SDK quando um adapter precisa dele; nome novo sobe o número menor, nome removido ou tipo mudado de um jeito que o adapter percebe sobe o maior.

### Regras
- O core decide por capability (D011). Se uma tela depende de capability ausente, ela não aparece na navegação do workspace (core/11 §5).
- Todo dado do adapter entra no core como **dado declarativo**; o core não chama o adapter dentro de loops quentes (conflitos, desejado).
- Adapter é versionado; a instância guarda a versão do adapter que a criou para migrações.

## 2. ModTypes

- Um target pode ser declarado **criável** (`Definition.CreatableTargets`, D118): a pasta pode não existir numa instalação nova, e o deploy a cria (core/04 §4). Só vale para target abaixo da raiz do jogo.

- Cada mod tem um ModType (padrão do adapter). Tipo define target e métodos permitidos.
- Detecção automática no install por regra do adapter (ex.: ENB, SKSE → `root`). O usuário pode trocar em "Avançado" (paridade `ModTypeWidget`).
- Location = target do tipo + caminho relativo do arquivo no mod.

## 3. Descoberta de jogos

Fontes V1 (port `StoreScanner`): Steam (`libraryfolders.vdf` + `appmanifest_*.acf`), GOG (registro `GOG.com\Games`), Epic (manifests em `ProgramData\Epic\EpicGamesLauncher\Data\Manifests`), registro do Windows declarado pelo adapter, e caminho manual. Xbox/Game Pass: fora da V1 (pastas protegidas).

Modos (paridade Vortex "Scan: quick/full"):
- **Rápida** (na inicialização, sem bloquear): lojas + registro.
- **Completa** (sob demanda): percorre unidades procurando arquivos marcadores dos adapters; operação cancelável.

Resultado: lista de **candidatos** (não gerencia nada sozinho). Instalação nunca encontrada ⇒ "Localizar manualmente" com validação.

Como ficou (F3, D057; D113): o `StoreScanner` devolve toda instalação que encontra (`Scan(ctx, registryHints)`) e o serviço de jogos fica com as que alguma definição declara em `Discovery` e cuja pasta o adapter aceita em `ValidateRoot`. Steam lê `SteamPath`/`InstallPath` do registro, `steamapps\libraryfolders.vdf` (formato atual e antigo) e `appmanifest_*.acf`; GOG lê `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\*` (`path`, `gameID`); Epic lê `*.item` (JSON: `AppName`, `InstallLocation`); um launcher ausente ou um arquivo corrompido contribui com nada e não é erro. Candidatos são deduplicados por pasta (sem diferenciar maiúsculas nem barra final), com a loja vencendo o registro e este a busca nas unidades. A busca completa é a operação cancelável `games.scan` (passos `stores` e `drives`, progresso = pastas verificadas), percorre as unidades fixas até 6 níveis, ignora áreas de sistema (`Windows`, `$Recycle.Bin`, `System Volume Information`, `AppData`, `ProgramData`, `node_modules`, `.git`…) e não desce dentro de uma pasta de jogo encontrada. Os candidatos vivem na memória da sessão (são calculados, nunca persistidos); a busca rápida roda na abertura da janela, fora do caminho da UI.

## 4. Gerenciar um jogo (assistente)

`escolher jogo → escolher/confirmar instalação → validar raiz → escolher staging (sugestão no mesmo volume) → escolher pasta de arquivos (ArchiveStore) → verificar métodos de deploy disponíveis → verificar implantação estrangeira (D035) → criar instância + profile Default → abrir workspace`

- Staging sugerida: `<volume do jogo>:\ModOrchestrator\<instância>\staging`; ArchiveStore: `…\archives`; BackupStore: `…\backups` (mesmo volume do target).
- Se o jogo tem implantação de outro gerenciador: o assistente conclui, mas a instância nasce com `foreign_deployment` bloqueante (core/04 §11) e explicação.
- **Jogo genérico** (adapter `generic`): usuário informa nome, pasta raiz, um ou mais targets (ex.: `Mods`, `BepInEx/plugins`), executável opcional. Sem plugins.

Como ficou (F3): o assistente é `Verify` (somente leitura: raiz, nome único por jogo, targets, pastas, marcadores, métodos, implantação estrangeira) seguido de `Manage` (operação `games.manage`: `validate` → `folders` → `register`). Métodos oferecidos: `hardlink` (só se staging e todos os targets estão no mesmo volume; senão `different_volume`) e `copy`, **nunca escolhida por padrão**; `symlink` só aparece quando o motor de deploy (F7) puder provar que funciona. Nada é gravado no jogo: o assistente só cria/marca as três pastas do gerenciador (core/04 §10), grava a instância e o profile `Default` e torna a instância ativa. Se algo falha depois de criar as pastas, os marcadores e as pastas criadas (vazias) são desfeitos.

Outras ações na tela Games: parar de gerenciar (exige purge; mantém ou apaga staging/archives, com escolha explícita; **até a F7, recusa a instância com algo implantado** com `instance_deployed`, e a apagar exige digitar o nome e só apaga pastas cujo marcador prova que são da instância), esconder/mostrar, alterar localização (revalida; se o jogo mudou de pasta, oferece purge na antiga se acessível), abrir pastas (jogo, staging, archives), ver detalhes (caminhos, versão, mod types, capabilities), múltiplas instâncias do mesmo jogo (nome distinto).

Importar de outro gerenciador (D128, tela na RD16): depois de gerenciar o jogo, o app procura MO2 e Vortex que apontem para a mesma pasta e oferece trazer mods, ordem, regras e perfis. O adapter não declara nada novo: a lista de plugins de cada perfil é lida com `LoadOrderFile` e `Parse` quando o jogo tem `plugins`; sem a capability, a importação traz só o que vale para todo jogo.

## 5. Navegação por capability

O workspace mostra: Overview, Mods, Conflicts, Profiles, Diagnostics sempre; Plugins se `plugins`; Load Order se `load_order`; Saves se `save_games` (D142, grupo Setup, depois de Perfis). A lista é consulta do bridge (a UI não decide, anti-pattern 1).

Como ficou (RD4, D120): o mesmo `Workspace()` devolve também `groups`, os itens arrumados como o menu do jogo (`entry`: Visão geral; `content`: Mods, Plugins, Ordem de carga, Conflitos; `setup`: Perfis; `health`: Diagnóstico) por `games.WorkspaceGroups`; grupo vazio não vem. `MenuBadges(instância)` (serviço `overview`) devolve contagem e atenção por item: Diagnóstico com `blocking` + `error` (atenção quando algo bloqueia) e Conflitos com os pares não revisados quando `diagnostics.showUnreviewedConflicts` está ligada (atenção enquanto houver). Fonte que não pôde ser lida não dá selo, nunca zero. A instância ativa traz `accent`, a cor do jogo (D122), declarada pela definição (`Definition.Accent`; Skyrim e Valheim declaram; jogo personalizado fica com a cor do app). Partes de telas compartilhadas que dependem de capability vêm como `sections` no jogo gerenciado e no `Workspace()` da instância ativa (`games.Sections`: aba Plugins de Configurações, cache de cabeçalhos de plugin, número de plugins da Visão geral e do cartão do perfil); a UI renderiza as que recebe e não testa capability. O `Workspace()` traz também `areas`, as áreas de Diagnóstico › Problemas da instância (`games.DiagnosticAreas`), e cada recurso de `InstanceFeatures`/`GamesSupport` diz a tela que traz ao menu (`screen`, `games.FeatureScreen`), na ordem da prancha (D132).

Como ficou (F3): `Workspace()` devolve a instância ativa, as instâncias para troca e os ids das telas (`overview`, `mods`, `plugins`, `load_order`, `conflicts`, `profiles`, `diagnostics`) derivados por `games.WorkspaceItems(capabilities)`. A UI só mapeia cada id para ícone e rótulo e ignora ids que não conhece. Sem instância ativa não há seção de workspace. Telas cuja fase ainda não chegou mostram uma página honesta, sem ações.

## 6. Launch (D045)

Botão Play no rodapé do menu do jogo desde a D120 (antes, na barra de título): executa `launch()` do adapter pelo `ProcessLauncher`, após a checagem pré-lançamento (core/04 §9). Enquanto o jogo roda (detecção por processo), deploy/purge ficam bloqueados (`game_running`). Ferramentas adicionais (hotbar) V1.x.

Ferramentas externas (LV4, D146): com a capability `tools`, o serviço de lançamento também inicia as ferramentas que o usuário registrou (`launch_tool`: `check`, `deploy`, `start`), pela porta `ProcessRunner`, que segue a ferramenta e os processos que ela abre (job object no Windows) até o fim. Uma ferramenta com "implantar antes" implanta o que está pendente; diagnóstico bloqueante não impede ferramenta (ela costuma ser a correção). Ferramenta exclusiva segura o lock da instância enquanto roda (`instance_busy`, holder `tool`). Ao fechar, o app roda "Verificar implantação" (core/09 §3) e grava `tool.exited` com o número de alterações e de arquivos novos, que a UI usa para oferecer a captura.

Como ficou (F12, D090): interface opcional `ports.LaunchSupport` (opções de lançamento; Skyrim: SKSE se o loader está na raiz, senão o executável); jogo genérico usa o executável declarado; sem opção, Play fica indisponível com o motivo. Operação `launch` (`check`, `deploy`, `start`) e monitor de processo (`game.running_changed`).

## 7. Extensões (V2)

Contrato previsto: manifesto (id, versão, autor, capabilities fornecidas, versão mínima do app, permissões: filesystem de quais pastas, rede, processos), ciclo de vida (instalar, habilitar, desabilitar, atualizar, remover, reinício necessário), isolamento (processo separado ou WASM, a decidir). Na V1, a tela Extensions lista os adapters embutidos (`generic`, `skyrimse`, `valheim`) (nome, versão, jogos, capabilities, "embutido") e explica que extensões de terceiros virão; sem botões falsos (anti-pattern 18).

## 8. Critérios de aceite

- Nenhum `if gameId == …` fora de `internal/adapters`; nenhum literal com nome de jogo, de ferramenta, de arquivo ou extensão de um jogo fora dali (`TestNoGameSpecificLiteralsOutsideAdapters`).
- Adapter que declara capability sem a interface, ou o contrário, não registra (D112).
- Adapter embutido não importa nada do módulo além do SDK (`TestAdaptersImportOnlyTheSDK`, D134).
- Numa instância sem `plugins`, todo comando de plugins responde `plugins_unsupported` e o deploy conclui sem escrever arquivo de load order (`TestGameWithoutPluginsWorksAndAnswersUnsupported`).
- Skyrim SE instalado pela Steam é encontrado na busca rápida.
- Pasta errada no "localizar manualmente" é recusada com motivo.
- Jogo genérico com dois targets funciona de ponta a ponta (import, conflito, deploy).
- Tela Plugins não aparece para jogo genérico.
