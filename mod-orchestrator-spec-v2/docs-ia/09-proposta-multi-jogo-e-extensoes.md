# Proposta: núcleo agnóstico de jogo, capacidades por jogo e extensões

Status: **fase A aprovada e aplicada** (2026-10-13, D112); fases B a D continuam proposta. O diagnóstico abaixo descreve o código de antes da fase A: os itens 5, 6 e 13 da tabela de acoplamentos foram resolvidos por ela. Ficaram para depois, da fase A: o item 9 (decisões por capability na UI), que espera o subprojeto de componentes liberar as telas, e a exposição de `GameSupport` no bridge, que entra com a R1 do registro de jogos.

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

1. Qual é o segundo jogo? Ele define a forma da ordem de carga genérica. Um jogo Bethesda (Fallout 4) valida quase nada; um jogo com ordem de mods em manifesto valida o que importa.
2. A V1.0 promete mais de um jogo com suporte dedicado, ou Skyrim + genérico?
3. Extensões de terceiros poderão trazer instaladores e providers, ou só jogos?
