# Proposta: núcleo agnóstico de jogo, capacidades por jogo e extensões

Status: **estado desta frente na seção 0** (fase A em 2026-10-13, C1, A2, C2 e C3 em 2026-10-20). As seções 1 a 9 são o diagnóstico e a proposta originais e descrevem o código de **antes** da fase A; as seções 10 e 11 registram o Valheim e o teste real.

## 0. Estado final (para o plano de implementação)

### Feito

| Decisão | Commit | O que entrou |
|---|---|---|
| D112 | `4aa3757` | Regra de escopo de jogo no protocolo e no `AGENTS.md`. Capability e interface opcional em relação 1:1, validada no registro. Quatro capabilities novas. `Registry.Support()`. Teste de literais vigia nomes de arquivo e extensões de jogo. `plugins.txt` fora do núcleo. Teste do caminho "sem capability" com o `generic`. |
| D114 | `4e5fe99` | Adapter do Valheim (`internal/adapters/valheim`, core/16): sem plugins nem load order, três instaladores próprios, `framework_missing` para o BepInEx, launch e detecção de execução. Sem mudança no núcleo. |
| — | `e5b17f0` | Teste de ponta a ponta opcional contra a instalação real (`MO_E2E_VALHEIM_PACKAGE`). |
| D118 | `155afac` | `Definition.CreatableTargets` (o deploy cria a pasta do target declarado e a remove, vazia, no purge) e `Plan.Metadata` (o instalador informa nome, versão, descrição e site). |
| D131 | fase C1 | Catálogo do adapter (`ports.CatalogProvider`): códigos de diagnóstico próprios entram no catálogo em vigor (`diagnostic.Catalog`) e os rótulos de flags, instaladores e opções de launch, mais os textos dos diagnósticos, vêm do adapter por idioma (`AdapterMessages`). Os 23 rótulos do Skyrim e do BepInEx saíram do catálogo do app. |
| D132 | fase A2 | A UI só renderiza o que o backend lista: o `Workspace()` traz `sections` e `areas` (chips de Problemas) da instância ativa; cada recurso diz a tela que traz ao menu (`screen`) e vem na ordem da prancha. Saíram da UI os testes de `plugins` nos itens do menu e as listas fixas de recursos; um teste do frontend impede que voltem. |
| D133 | fase C2 | Pontos de contribuição no lugar da fiação por nome: `PostDeploy`, `diagnostics.Module`, `overview.FigureSource`, `profiles.Section`, `library.FileStates`. O perfil guarda seções opacas; o estado de plugins é a seção `plugins` do módulo. `AppliedLoadOrder` foi para `domain/loadorder` e os checks de plugin para `domain/pluginhealth`. Perfis gravados antes são lidos e convertidos. Teste de arquitetura impede o núcleo de importar o módulo. |
| D134 | fase C3 | SDK do adapter em `modorchestrator/sdk` (fora de `internal/`, `APIVersion` 1.0), por aliases dos tipos do core, com subpacotes de mesmo nome. Os adapters embutidos só importam o SDK; um teste de arquitetura vigia. |

Da frente de registro de jogos, que fechou pontos deste diagnóstico: D113 (`6c75748`, descoberta como dado; resolve o item 12), D115 (`c7aabfe`, recursos ligáveis por instância), D116 (`6d5626b`, manifesto de jogo), D117 (`5b7b665`, jogo personalizado como entrada; o manifesto aceita target criável).

### Situação de cada acoplamento

| # | Acoplamento | Situação |
|---|---|---|
| 1 | Plugin com forma Bethesda | **Aberto.** O Valheim não tem ordem de carga, então não guiou a generalização. |
| 2 | Núcleo desejado/aplicado importa `domain/plugin` | Resolvido (D133): o perfil guarda seções opacas e o registro aplicado da load order mora em `domain/loadorder`. |
| 3 | Fiação manual do serviço de plugins | Resolvido (D133): o núcleo recebe listas de contribuição; o bootstrap passa o módulo. |
| 4 | Catálogo fechado de diagnósticos | Resolvido (D131): o adapter declara código, módulo e textos. Os códigos `plugin_*` e `bsa_without_plugin` seguem no núcleo porque o módulo de plugins do núcleo os emite (fase C2). |
| 5 | `plugins.txt` no núcleo | Resolvido (D112). |
| 6 | Capability sem validação | Resolvido (D112). |
| 7 | Adapters importam `internal/` | Resolvido (D134): os adapters embutidos só importam o SDK. Os testes deles ainda usam o core. |
| 8 | Texto de jogo no catálogo i18n do app | Resolvido (D131): rótulos de flags, instaladores e opções de launch vêm do adapter; um teste do frontend impede que voltem. Nome de mod type continua texto único do adapter, sem idioma. |
| 9 | UI decide por capability | Resolvido (D132): seções, áreas de Problemas e tela de cada recurso vêm do backend; Configurações, Workarounds, Visão geral e Perfis renderizam o que recebem. `WorkspaceItemId` segue como união: é o mapa id → ícone/rótulo, e id desconhecido é ignorado. |
| 10 | Settings `plugins.*` para toda instância | Aberto (baixo). |
| 11 | FOMOD e padrão de nome do Nexus no domínio | Aberto (baixo); `Plan.Metadata` já dá ao adapter o caminho próprio. |
| 12 | `RegistryHints`/`VersionFile` obrigatórios | Resolvido (D113). |
| 13 | Teste de literais sem vocabulário de formato | Resolvido (D112). |
| 14 | Deploy exige target existente | Resolvido (D118). |
| 15 | Adapter não informa metadados do mod | Resolvido (D118), exceto o autor, que o `manifest.json` não traz. |

### Adiado, com dono

| Item | Depende de |
|---|---|
| Dependências do `manifest.json` como `DependencyRule` (core/16 §8) | Contrato novo: `Plan.Requirements` hoje carrega arquivos, não pacotes. |
| Autor do mod no Valheim | Levar o nome do archive ao contexto do instalador. |
| Importar profiles do r2modman; provider da Thunderstore | core/15 (V1.x/V2). |
| Possível instabilidade em `TestDeployPurgeDeploy` com a máquina carregada | Observada duas vezes pela outra frente; não reproduzida aqui. |

### Próximas fases propostas

| Fase | Conteúdo | Tamanho | Pré-requisito |
|---|---|---|---|
| A2 | Item 9: o backend passa a dizer quais abas e seções existem; a UI só renderiza. | Pequeno | **Feita (D132).** |
| B | Ordem de carga genérica (`ordered_units` + `unit_headers`, §5), guiada por um jogo que **tenha** ordem de carga editável. | Médio a grande | Escolher esse jogo. Sem ele, não fazer. |
| C1 | Textos e diagnósticos do adapter vêm com o adapter (itens 4 e 8): catálogo de códigos e rótulos extensível por adapter. | Médio | **Feita (D131).** |
| C2 | Pontos de contribuição no lugar da fiação manual (itens 2 e 3): N0 deixa de importar `plugin`. | Médio | **Feita (D133).** |
| C3 | Pacote `sdk/` fora de `internal/`; adapters embutidos passam a importar só ele (item 7), com teste de arquitetura. | Médio | **Feita (D134).** Da R6 ficou feita a parte de contrato; `provider` por recurso e o módulo de prova seguem com a fase D. |
| D | Host de extensões: manifesto, carregador, isolamento, permissões, tela Extensions. | Grande | C3. V2 (D012). |

Ordem sugerida: **C1 → A2 → C2 → C3/R6 → D** (C1, A2, C2 e C3 feitas), com a fase B entrando quando houver o jogo que a justifique.

O que os dois jogos já provaram: um adapter novo, sem os processos do Skyrim, entrou sem mudar o núcleo (D114); as duas suposições do núcleo que o teste real achou foram corrigidas com um campo declarativo cada (D118). O que ainda **não** está provado é a ordem de carga genérica e a fronteira pública do SDK.

Pergunta que este documento responde: o Mod Orchestrator começa pelo Skyrim, mas não será só dele. O código segmenta o que é de um jogo e o que é de todos? Se um processo não existe em outro jogo, isso gera problema? E o que falta para um SDK de plugins no estilo do VS Code?

## 1. Veredito

A base está correta e melhor do que o comum para um projeto que nasceu com um jogo só. O que falta é de segunda ordem, e nada exige reescrita.

- **Jogo sem plugins, sem load order e sem launch já funciona hoje.** O adapter `generic` prova isso de ponta a ponta, com teste.
- **Jogo com uma ordem de carga de formato diferente do Bethesda ainda não cabe.** O conceito "plugin" que mora no núcleo tem a forma do Bethesda.
- **Um adapter novo não consegue se descrever sozinho.** Diagnósticos, rótulos, telas e settings são catálogos fechados dentro do núcleo e do frontend.
- **Não existe fronteira pública.** Adapters importam `internal/...`, então nada fora deste repositório consegue implementar um.

## 2. O que já está abstraído

| Mecanismo | Onde | Efeito |
|---|---|---|
| Capabilities declaradas pelo adapter | `internal/core/domain/game/game.go:26-41` | O núcleo pergunta, não testa o id do jogo (D011). |
| Contrato `GameAdapter` só de leitura | `internal/core/application/ports/system.go:227` | O adapter declara e responde; não escreve no disco (anti-pattern 24 virou regra de tipos). |
| Interfaces opcionais por recurso | `ports/system.go`: `PluginSupport`, `LoadOrderSupport`, `LaunchSupport`, `InstallerProvider`, `CategoryProvider`, `HealthCheckProvider`, `ProcessDeclarer`, `PluginArchives` | Recurso ausente é interface ausente, não erro. |
| Registro único de adapters | `internal/bootstrap/bootstrap.go:197`, `application/games/registry.go` | O núcleo só conhece jogos por ali. |
| Navegação derivada no backend | `application/games/nav.go:27` | Plugins e Load Order só aparecem com a capability; a UI ignora ids que não conhece. |
| Serviço de plugins recusa jogo sem a capability | `application/plugins/state.go:71-89` (`CodeNoPlugins`), `file.go:246-254` | Deploy de jogo sem plugins pula o passo de load order sem falhar. |
| Teste de arquitetura contra nomes de jogo | `internal/architecture_test.go:157-194` | Literal "skyrim", "skse", "enbseries" etc. fora de `internal/adapters` quebra `go test ./internal`. |
| Todo fato de Skyrim num pacote só | `internal/adapters/skyrimse/` (cerca de 1.270 linhas com testes) | IDs de loja, executável, `Data/`, tipos ENB/SKSE, flags de conteúdo, limites, `plugins.txt`. |

## 3. Acoplamentos encontrados

Severidade: **A** impede um jogo diferente ou um adapter externo; **M** funciona, mas vaza Bethesda para o núcleo; **B** cosmético.

| # | Onde | O que está acoplado | Sev. |
|---|---|---|---|
| 1 | `ports/system.go:332-349` (`PluginSupport`) e `application/plugins/state.go:143-344` | Plugin = arquivo solto no topo de **um** target, com cabeçalho binário e masters. Jogos cuja unidade ordenável é uma pasta de mod, um pacote ou uma entrada de manifesto não cabem. | A |
| 2 | `domain/profile/profile.go:74-76`, `domain/deployment/manifest.go:268-276`, `domain/externalchange/externalchange.go:36`, `domain/dependency/dependency.go:26` | O núcleo desejado e o aplicado importam `domain/plugin`. Profile, manifesto, alteração externa e dependência carregam campos de plugin para todo jogo (ficam vazios quando não se aplicam). | M |
| 3 | `application/deployment/service.go:106`, `diagnostics/service.go:87`, `overview/service.go:53`, `bootstrap.go:279-386` | Deploy, diagnósticos e overview conhecem o serviço de plugins pelo nome. Um segundo recurso opcional (saves, settings do jogo) repetiria esse padrão de fiação manual. | M |
| 4 | `domain/diagnostic/catalog.go:17-43,66-85` | Catálogo fechado de códigos no núcleo, com `bsa_without_plugin` e os `plugin_*master*`. Um adapter novo não consegue declarar um diagnóstico próprio sem editar o núcleo e os dois catálogos de i18n. | A |
| 5 | `application/plugins/file.go:161,348` | Nome `plugins.txt` fixo no núcleo para o backup do arquivo de load order. | B |
| 6 | `domain/game/game.go:30-41` contra o uso real | Só `plugins`, `load_order` e `launch` são consultadas (`nav.go`, `plugins/state.go`, `launch/service.go`). As outras sete são declaradas e nunca lidas; as interfaces opcionais são resolvidas só por type assertion. Capability declarada e interface implementada são duas fontes de verdade sem validação no registro. | M |
| 7 | `internal/adapters/*` importam `internal/core/domain/*` e `internal/core/application/ports` | Não há pacote público nem versão de contrato. A palavra `internal` do Go impede qualquer módulo externo de implementar um adapter. | A (para SDK) |
| 8 | `frontend/src/i18n/catalog/*.ts` | Textos de Skyrim no catálogo do app: `launch.option.skse`, `mods.content.skse_plugin`, `mods.content.enb`, `plugins.emptyDescription` cita `.esp/.esm/.esl`. Rótulo de flag, opção de launch e instalador vêm de chave fixa; adapter novo mostra o id cru (`mod-labels.tsx:42-51`, `PlayButton.tsx:13`). | M |
| 9 | `frontend/src/pages/SettingsPage.tsx:50`, `WorkspacePages.tsx:206`, `features/settings/WorkaroundsTab.tsx:28` | A UI decide por `capabilities.includes("plugins")`, o que a regra "a UI não decide" (core/11 §5) proíbe. `WorkspaceItemId` e as abas de settings são uniões fechadas. | M |
| 10 | `domain/settings/settings.go:130-133` | Settings `plugins.*` (incluindo `plugins.lootProvider`) no catálogo do núcleo, para toda instância. | B |
| 11 | `application/library/service.go:166`, `domain/fomod`, `domain/installer/metadata.go:39` | FOMOD é o primeiro instalador de todo jogo e mora no domínio; o padrão de nome de arquivo do Nexus também. São formatos, não regras de jogo, e só disparam quando o arquivo existe. Entram aqui porque um SDK precisa decidir se instalador é ponto de extensão. | B |
| 12 | `ports/system.go:238-241` | `RegistryHints` e `VersionFile` (recurso de versão de executável) são obrigatórios no contrato. São formas do Windows; o `generic` devolve vazio. Só pesa quando houver Linux/Proton. | B |
| 13 | `architecture_test.go:157` | A lista vigia nomes de jogo, mas não vocabulário de formato (`plugins.txt`, `.esp`, `bsa`, `master`). O item 5 passou por isso. | B |

## 4. O que acontece com um jogo sem esses processos

| Cenário | Hoje |
|---|---|
| Jogo só de arquivos soltos (um ou mais targets), sem ordem de carga | Funciona: é o `generic`. Sem tela Plugins, sem Load Order, Play só com executável declarado. |
| Jogo com ordem de carga de **mods** (pasta ou pacote por mod, ordem num XML/JSON) | Não cabe. `LoadOrderSupport.Serialize` recebe `[]plugin.Entry` e o inventário vem de `IsPlugin(nome de arquivo)` num único target. |
| Jogo com plugins sem masters nem limites | Cabe: o adapter devolve cabeçalho vazio e nenhuma restrição. As telas ainda mostram colunas de master e índice. |
| Jogo com diagnóstico próprio (ex.: loader ausente de outro framework) | Só reaproveitando `framework_missing`. Código novo exige editar núcleo e i18n. |
| Jogo com tipo de conteúdo, opção de launch ou instalador próprios | Funciona, mas a UI mostra o id técnico em vez do nome. |
| Jogo com saves ou INIs por profile | Capabilities reservadas (`save_games`, `game_settings`), sem contrato ainda. Previsto em core/15. |
| Adapter escrito por terceiro | Impossível: sem pacote público, sem manifesto, sem carregador. |

Nenhum desses casos corrompe dados nem derruba o app: a falha é "não dá para expressar", não "quebra em produção".

## 5. Arquitetura proposta

```
┌──────────────────────────────────────────────────────────────┐
│ UI (frontend/ + dettmann-ui)                                 │
│ renderiza o que o backend descreve: telas, colunas, rótulos  │
├──────────────────────────────────────────────────────────────┤
│ bridge  (transporte)                                         │
├──────────────────────────────────────────────────────────────┤
│ N3  Host de extensões                                        │
│     manifesto, ciclo de vida, permissões, isolamento         │
├──────────────────────────────────────────────────────────────┤
│ N2  Adapters de jogo  (skyrimse, generic, futuros)           │
│     importam SOMENTE o SDK                                   │
├──────────────────────────────────────────────────────────────┤
│ SDK público e versionado  (contratos + tipos de dados)       │
├──────────────────────────────────────────────────────────────┤
│ N1  Módulos de recurso  (opcionais, um por capability)       │
│     ordem de carga, plugins com cabeçalho, launch, saves,    │
│     settings do jogo, ferramentas, instaladores de formato   │
├──────────────────────────────────────────────────────────────┤
│ N0  Núcleo  (vale para todo jogo)                            │
│     jogo/instância/targets, biblioteca, profile e ModOrder,  │
│     regras, conflitos, deploy/purge, alterações externas,    │
│     motor de diagnóstico, operações, ordenação, relpath      │
└──────────────────────────────────────────────────────────────┘
```

Regras de dependência (todas verificáveis em `architecture_test.go`):

1. **N0 não importa N1.** O núcleo não conhece plugins, saves nem launch. Hoje `profile`, `deployment`, `externalchange` e `dependency` importam `plugin`.
2. **N1 entra no núcleo por pontos de contribuição**, não por campo com nome. Um módulo de recurso registra: item de navegação, seção do profile (documento opaco versionado), passo `post` do deploy, tipo de alteração externa, checks e códigos de diagnóstico com seus textos, settings, seção do overview e do pacote de suporte. O bootstrap deixa de fiar cada recurso à mão.
3. **Adapters importam só o SDK.** O SDK reexporta os tipos de dados que o adapter precisa (`Definition`, `ModType`, `Location`, `Spec` de diagnóstico, `LaunchOption`) e as interfaces de capability. Os adapters embutidos passam a ser os primeiros clientes do SDK.
4. **Capability e contrato são a mesma coisa.** Cada capability tem exatamente uma interface. O registro recusa adapter que declara sem implementar ou implementa sem declarar.
5. **Tudo que o adapter mostra ao usuário vem com o adapter**: rótulos de flags de conteúdo, opções de launch, tipos de mod, instaladores e mensagens de diagnóstico, por idioma. O catálogo do app fica só com texto do app.

### Ordem de carga genérica (resolve o item 1)

Separar em dois contratos o que hoje é um:

- `ordered_units`: o adapter enumera as **unidades ordenáveis** da instância a partir do estado desejado (cada uma com id, nome, origem, mod dono e atributos livres), declara restrições rígidas, posições fixas e limites, e serializa/lê o arquivo do jogo. O motor de ordenação (D029), regras, grupos, locks, triagem de alteração externa e as telas continuam os mesmos.
- `unit_headers` (opcional): unidades com cabeçalho legível, de onde saem dependências entre unidades ("masters") e flags. É o caso Bethesda.

O que hoje se chama Plugin vira um caso de unidade ordenável; o glossário mantém "plugin" como nome de tela para jogos que usam o termo, fornecido pelo adapter.

### Ponto de extensão para o SDK

| Peça | Proposta | Quando decidir |
|---|---|---|
| Pacote | `sdk/` na raiz do módulo, fora de `internal/`, com versão de contrato (`sdk.APIVersion`) | Fase C |
| Manifesto | Já esboçado em core/11 §7: id, versão, autor, capabilities fornecidas, versão mínima do app, permissões | Fase D |
| Tipos de contribuição | `game` (adapter), `installer`, `provider` (downloads/metadados, V2), `tool`, `diagnostic check`, `ordering data` (ex.: LOOT) | Fase C define a lista |
| Isolamento | Processo separado falando JSON-RPC pelo stdin/stdout (mesmo modelo do host de extensões do VS Code e do LSP) ou WASM | Fase D; recomendo processo separado, por permitir qualquer linguagem e matar extensão travada |
| Garantia | A extensão só **declara e responde**, como o adapter hoje. Nunca escreve no jogo: toda escrita continua sendo plano + journal do núcleo. | Vale desde já |

A regra "adapter não escreve" que o projeto já tem é o que torna um SDK seguro: uma extensão de terceiro não consegue corromper a pasta do jogo, porque só o motor de deploy escreve.

## 6. Modelo de capacidades por jogo

Fonte única para a lista de jogos com suporte e recursos por jogo. A matriz é **derivada do registro de adapters**, nunca mantida à mão.

| Capability | Contrato | O que habilita | `skyrimse` | `generic` |
|---|---|---|---|---|
| (base) | `GameAdapter` | Descoberta, validação de pasta, targets, biblioteca, conflitos, profiles, deploy, diagnósticos | sim | sim (pasta e targets informados pelo usuário) |
| `multiple_mod_types` | `Definition.ModTypes` | Tipos de mod com target e métodos próprios | sim (Root, ENB, SKSE) | sim (um por target) |
| `installer` | `InstallerProvider` | Instaladores próprios do jogo | sim | não (só os de formato) |
| `plugins` | `PluginSupport` | Tela Plugins, checks de plugin | sim | não |
| `load_order` | `LoadOrderSupport` | Tela Load Order, escrita do arquivo de ordem | sim | não |
| `launch` | `LaunchSupport` | Play com opções | sim (SKSE ou jogo) | só executável declarado |
| `external_change_strategy` | `Definition.ToolOutputs`, `UnmanagedHints` | Pastas de saída de ferramentas vigiadas | sim | não |
| (sem id hoje) | `HealthCheckProvider` | Checks próprios | sim | não |
| (sem id hoje) | `CategoryProvider` | Categorias iniciais | sim | não |
| (sem id hoje) | `ProcessDeclarer` | Detecção de jogo em execução | sim | não |
| `save_games`, `game_settings`, `tools` | a definir (V1.x) | Saves, INIs por profile, hotbar | reservado | reservado |

Proposta de forma para a consulta (uma por definição de jogo, servida pelo bridge):

```
GameSupport {
  game, name, adapter, adapterVersion, origin: built_in | extension
  features: [ { id, status: available | not_applicable | planned, note? } ]
}
```

- `available` e `not_applicable` saem do adapter registrado. `not_applicable` significa "este jogo não tem esse processo", não "falta implementar".
- `planned` existe só para recurso que o jogo tem e o adapter ainda não cobre; o adapter declara.
- Jogos **sem adapter** (lista de "em breve") são outro dado: um catálogo declarativo separado, que não passa pelo registro. A frente de lista de jogos decide onde ele mora.

Ajustes necessários no catálogo atual: dar id às três interfaces sem capability, e remover ou marcar como reservadas as capabilities que nada lê (`filesystem_mod_target` é sempre verdadeira hoje).

## 7. Regra para o protocolo

Texto proposto para `prompts/00-protocolo.md`, no bloco "ANTES DE IMPLEMENTAR", como quinto item do resumo:

```text
- escopo de jogo: a mudança vale para todo jogo ou depende de uma capability?
  Se depende, diga qual, e o que acontece numa instância sem ela (adapter generic).
```

E no bloco "REGRAS":

```text
- Multi-jogo (D011): nada no núcleo, no bridge ou no frontend supõe um processo
  que só alguns jogos têm. Comportamento opcional entra por capability + contrato
  do adapter, com teste do caminho "sem a capability". Nome de jogo, de ferramenta,
  de arquivo ou extensão de um jogo só existe em internal/adapters. Catálogo novo
  (códigos, rótulos, telas, settings) nasce extensível pelo adapter ou registra
  por que não.
```

E em "AO FINAL", item 4: "Conferir anti-patterns, critérios de aceite **e o escopo de jogo declarado no resumo**."

Linha equivalente para `AGENTS.md`, em "Regras de código":

```text
- Todo recurso que não vale para qualquer jogo entra por capability do adapter e
  tem teste com o adapter generic (sem a capability). Fatos de um jogo só em
  internal/adapters.
```

A regra só se sustenta com verificação automática. Três testes baratos em `internal/architecture_test.go`:

1. Ampliar a lista de literais vigiados com vocabulário de formato: `plugins.txt`, `.esp`, `.esm`, `.esl`, `.bsa`, `loadorder.txt`.
2. Registro recusa capability sem interface e interface sem capability.
3. Um teste de integração "instância generic percorre todos os comandos do bridge": cada comando devolve resultado ou um erro com código de capability ausente, nunca `internal`.

## 8. Plano sugerido

| Fase | Conteúdo | Custo | Quando |
|---|---|---|---|
| A. Travar | Regra no protocolo e no `AGENTS.md`; os três testes; validação capability↔interface; consulta `GameSupport`; mover as decisões de UI por capability para o backend; tirar `plugins.txt` do núcleo | Pequeno, sem mudança de comportamento | Agora, antes de mais features |
| B. Segundo jogo | Adapter de um jogo **não Bethesda** como prova. Generalizar a ordem de carga (§5) guiado por ele, não por suposição | Médio a grande | Antes da V1.0 se a V1 promete mais de um jogo; depois, se não |
| C. SDK interno | Extrair `sdk/`; adapters embutidos passam a importar só ele; textos e diagnósticos do adapter vêm com o adapter; pontos de contribuição no lugar da fiação manual | Médio | Depois de B (dois adapters reais definem o contrato melhor que um) |
| D. Host | Manifesto, carregador, isolamento, permissões, tela Extensions com instalar/remover | Grande | V2, como já está em D012 e core/15 |

Recomendo **não** generalizar o modelo de plugin agora, no abstrato. Com um jogo só, a abstração seria um chute; o segundo adapter é o que revela a forma certa. A fase A basta para impedir que o acoplamento cresça até lá.

Decisões a registrar se aprovado (próximos ids livres em `decisoes.md`):

- Regra de escopo de jogo no protocolo e testes de arquitetura da fase A.
- Capability e interface opcional em relação 1:1, validada no registro.
- Camadas N0/N1 e pontos de contribuição como direção; adapters só importam o SDK (a partir da fase C).
- Matriz de suporte derivada do registro (`GameSupport`).

## 9. Perguntas em aberto

1. ~~Qual é o segundo jogo?~~ Respondida em 2026-10-13: **Valheim** (§10).
2. A V1.0 promete mais de um jogo com suporte dedicado, ou Skyrim + genérico?
3. Extensões de terceiros poderão trazer instaladores e providers, ou só jogos?

## 10. Segundo jogo: Valheim (escolha do Leonardo, 2026-10-13)

Lido da instalação desta máquina (somente leitura), não de memória:

| Fato | Onde foi visto |
|---|---|
| Steam, app id `892970`, pasta `Valheim`, executável `valheim.exe` | `steamapps/appmanifest_892970.acf` e a pasta do jogo |
| Mods carregam pelo BepInEx, iniciado pelo Doorstop (`winhttp.dll` + `doorstop_config.ini` na raiz do jogo) | raiz do jogo; `target_assembly=BepInEx\core\BepInEx.Preloader.dll` |
| A raiz do jogo tem os arquivos do Doorstop, mas **não** tem a pasta `BepInEx` | pasta do jogo |
| O r2modman guarda cada profile fora do jogo, com a árvore `BepInEx/{core,plugins,patchers,config}` inteira | `%APPDATA%/r2modmanPlus-local/Valheim/profiles/<profile>/` |
| Cada mod é uma pasta `Autor-Nome` em `BepInEx/plugins`, com `manifest.json` (nome, versão, `dependencies` no formato `Autor-Nome-versão`) | profile `Modded_v2`: 69 pastas de mod, 96 arquivos em `config` |
| O estado do profile (habilitado, dependências, incompatibilidades) fica em `mods.yml` | raiz de cada profile |

### O que o Valheim valida e o que não valida

| Assunto do diagnóstico | Valida? | Como |
|---|---|---|
| Jogo sem plugins e sem load order, com suporte dedicado | Sim | Nenhuma tela de Plugins/Load Order; tudo o mais funciona. |
| Vários targets e tipos de mod | Sim | `BepInEx/plugins`, `BepInEx/patchers`, `BepInEx/config` e a raiz (pacote do BepInEx). |
| Framework obrigatório (item 4) | Sim | BepInEx ausente é o mesmo caso do SKSE: obriga o check do adapter a não depender de código Bethesda. |
| Instalador como ponto de extensão (item 11) | Sim | Pacote da Thunderstore tem layout e `manifest.json` próprios; não é FOMOD. |
| Dependências vindas de metadado do pacote | Sim | `dependencies` do `manifest.json` viram `DependencyRule` com `source=metadata`. |
| Arquivos gerados pelo jogo | Sim | `BepInEx/config/*.cfg` nasce na primeira execução: saídas conhecidas e "não gerenciar". |
| Rótulos e textos que vêm do adapter (item 8) | Sim | Tipos de conteúdo e opções de launch novos, sem tradução no catálogo do app. |
| Outro gerenciador no mesmo jogo | Sim | Os arquivos do Doorstop na raiz foram postos pelo r2modman: caso real de implantação estrangeira (D035). |
| **Ordem de carga genérica (item 1)** | **Não** | O BepInEx ordena sozinho pelas dependências declaradas no código; não existe arquivo de ordem que o usuário edite. |

Consequência: o Valheim é uma boa prova de "segundo jogo" para quase tudo, mas **não** guia a generalização do modelo de plugin. Ela continua adiada, com o limite registrado (item 1), até existir um jogo com ordem de carga editável.

### Como entra

1. **Como jogo declarado, na R3 do registro de jogos**: lojas, marcador, targets, tipos de mod, launch. Só dados.
2. **Código específico, depois da R1** (fase B desta proposta, agora menor): instalador de pacote Thunderstore, leitura de `manifest.json` para nome, versão e dependências, check de BepInEx ausente, saídas conhecidas em `BepInEx/config`.
3. **Mais tarde** (core/15): importar profiles do r2modman e provider da Thunderstore para downloads.

Ponto a decidir antes do item 2: o Mod Orchestrator implanta **dentro da pasta do jogo** (como faz hoje), enquanto o r2modman mantém o profile fora e aponta o Doorstop para ele. Manter o modelo atual é o caminho sem mudança de motor; os dois gerenciadores não devem gerenciar a mesma instalação ao mesmo tempo.

## 11. Teste de ponta a ponta na instalação real (2026-10-13)

`TestE2EValheimRealInstallation` (`internal/integration/e2e_valheim_test.go`) roda só com `MO_E2E_VALHEIM_PACKAGE` definido. Usa banco e pastas do gerenciador temporários; o banco do app não é tocado. Rodado com autorização do Leonardo, com o pacote `ASharpPen-Custom_Raids 1.8.1` do cache do r2modman.

| Passo | Resultado |
|---|---|
| Descoberta | Encontrado pela Steam em `C:\Program Files (x86)\Steam\steamapps\common\Valheim`. |
| Gerenciar | Instância criada, método `hardlink`; a pasta do jogo não mudou. Workspace: Overview, Mods, Conflicts, Profiles, Diagnostics. |
| Importar | Instalador `bepinex-package`, tipo `default`, 4 arquivos, conteúdo `bepinex_plugin`. |
| Deploy | 4 arquivos em `BepInEx/plugins/Custom_Raids/` mais o marcador de implantação em `BepInEx/`. |
| Diagnóstico | `framework_missing` (falta `BepInEx/core/BepInEx.Preloader.dll`), correto para esta instalação. |
| Purge | Pasta do jogo com as mesmas 1025 entradas, mesmos tamanhos e datas. Só a data de modificação da própria pasta raiz mudou. |

O teste revelou dois acoplamentos que a leitura do código não tinha mostrado:

| # | Onde | Problema | Sev. |
|---|---|---|---|
| 14 | `domain/deployplan/deployplan.go:268` (`target_unavailable`) | O motor de deploy exige que a pasta do target **já exista**. No Skyrim, `Data/` sempre existe. No Valheim, `BepInEx/` só existe depois de instalar o framework, então o primeiro deploy de qualquer mod fica bloqueado. O teste criou a pasta vazia à mão para seguir. | A |
| 15 | detecção de nome do mod (core/02; `domain/installer/metadata.go`) | O mod ficou com o nome `1.8.1`, o nome da pasta importada. O núcleo só conhece `fomod/info.xml` e o padrão de nome do Nexus; o adapter não tem como informar nome, versão e autor a partir do `manifest.json`. | M |

Propostas:

- **Item 14.** A definição declara quais targets o app pode criar (por exemplo `Definition.CreatableTargets`, sempre abaixo da raiz do jogo). O deploy cria a pasta dentro do plano, com journal, e o purge a remove se ficar vazia. Um target ausente que **não** é declarado criável continua `target_unavailable`, que é a proteção contra unidade desconectada. Alternativa sem mexer no núcleo: o adapter usar um target só, a raiz, com todos os caminhos prefixados por `BepInEx/`; funciona, mas esconde o limite em vez de resolvê-lo, e o jogo personalizado com pasta `Mods` ainda inexistente cai no mesmo caso.
- **Item 15.** O plano do instalador passa a poder devolver metadados do mod (nome, versão, autor), com a mesma prioridade que o `info.xml` tem hoje. Isso também abre o caminho para as dependências do `manifest.json` (core/16 §8).

Os dois foram aprovados e corrigidos em 2026-10-13 (D118): `Definition.CreatableTargets` e `Plan.Metadata`. O teste real passou de novo sem criar pasta à mão, e o mod ficou com o nome do `manifest.json`.
