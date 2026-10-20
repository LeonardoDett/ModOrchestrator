# Proposta: registro de jogos suportados, recursos por jogo e jogo personalizado

Status: **R1 a R4 concluídas em 2026-10-13** (backend e bridge); **R5a a R5e entregues pelo redesign** (RD13, RD14, RD14b e A2, conferido em 2026-10-20); **R6** com a parte de contrato feita (D134) e o resto na fase D do SDK. Estado final na seção 0. As seções 2 e 3 descrevem o desenho como foi aprovado; onde a implementação divergiu, vale a decisão citada.

Referências: D011, D012, D031, D040, D057, core/11, core/13, core/15, anti-patterns 1, 3, 18, 24.

## 0. Estado final (2026-10-14)

### Feito

| Fase | Commit | Decisão | O que entregou |
|---|---|---|---|
| R1. Registro como dado | `6c75748` | D113 | `Definition.Discovery` e `Support`; detecção por loja genérica; classe e dependências dos recursos (`game.Describe`); `Registry.Support()` e bridge `GamesSupport()`. |
| R2. Recursos ligáveis | `c7aabfe` | D115 | `Instance.Features` (tabela `instance_features`, migração 0009); `Definition.Effective`; `ports.InstanceDefinition` como único ponto de consulta; `games.SetFeature`/`Features`; bridge `InstanceFeatures`/`SetInstanceFeature`. |
| R3. Manifesto | `6d5626b`, `5b7b665` | D116, D117 | `game.Manifest` (JSON, `schema: 1`, com `creatable` da D118); adapter `generic` v2 servindo manifestos. |
| R4. Jogo personalizado como entrada | `5b7b665` | D117 | Tabela `game_entries` (migração 0010); registro composto (`Registry.SetEntries`); o assistente atual cria a entrada; migração das instâncias `generic` na inicialização; bridge `GameEntries`/`ExportGameEntry`/`ImportGameEntry`/`DeleteGameEntry`. |

Nenhum push foi feito. Validação em cada fase: `go vet ./...`, `go test ./...`, typecheck, testes do frontend e `wails build`.

### O que o usuário já percebe sem tela nova

- Adicionar um jogo pelo assistente de jogo genérico cria um jogo com id próprio (`user.<nome>`), que continua na lista de suportados depois de parar de gerenciar.
- Instâncias de jogo genérico existentes são migradas ao abrir o app.
- Um jogo importado com id de loja e marcador é encontrado pela busca.

### R5: entregue pelas fases do redesign (conferido em 2026-10-20)

| Fase | Onde entrou | Decisão | Como ficou |
|---|---|---|---|
| **R5a. Recursos por jogo** | RD13 (`9bc6619`) | D130, D132 | Ajustes da instância › Recursos: opcionais com chave e estado (ligado, desligado, bloqueado, não se aplica), "Sempre ligados" sem chave, prévia do menu e "Ligar X" no recurso bloqueado. Tudo de `InstanceFeatures`, na ordem da prancha. |
| **R5b. Lista de suportados** | RD14 (`08a55f5`) | D127 | Adicionar jogo lista nível de suporte, lojas e recursos de cada jogo (`GamesSupport`); o resumo do jogo sai dos recursos que trazem tela (D132). |
| **R5c. Jogo personalizado** | RD14 (`08a55f5`) | D127 | Exportar, importar e excluir pela tela, com diálogos de arquivo (`SaveGameEntryFile`, `OpenGameEntryFile`). |
| **R5d. Assistente** | RD14b (`c34458c`) | D129 | Reconhecimento da pasta escolhida (`RecognizeGameFolder`), modelos "Pasta Mods" e "BepInEx" do `generic` e a opção de pasta criável, desligada por padrão. |
| **R5e. UI deixa de decidir por capability** | A2 (`96f163c`) e item 10 (`39ff58d`) | D132, D135 | Seções, áreas de Problemas, tela de cada recurso e as abas de Configurações vêm do backend; um teste do frontend recusa tela que teste capability. |
| **R6. Extensão por jogo** | C3 (`2e64203`) | D134 | Contrato público do adapter feito. `provider` por recurso e o módulo de prova seguem com a fase D do SDK (`docs-ia/09-proposta-multi-jogo-e-extensoes.md`). |

### Pontos em aberto para o plano

1. ~~Entradas criadas pelo assistente não marcam target como criável.~~ Decidido na D129: o assistente oferece a opção, desligada por padrão.
2. **Nenhum jogo `declared` embutido existe.** Skyrim e Valheim têm adapter próprio. O nível existe e está testado pelo caminho do jogo importado; o primeiro jogo embutido só de dados fica para quando houver um candidato.
3. **`Instance.Executable` ficou redundante** para entradas (o lançamento vem do manifesto). Remover exige mexer no DTO e na tela de detalhes; não entrou na RD14 e segue aberto.
4. **Instância `generic` com target fora da raiz não é migrada** e segue pelo caminho antigo. Não há caso conhecido; o código do caminho antigo pode sair quando isso for confirmado.
5. **Falha intermitente na suíte Go.** Duas execuções com a máquina carregada falharam (uma em `TestDeployPurgeDeploy`) e não se repetiram em quatro execuções seguidas. Não é desta frente, mas o plano deveria prever investigar antes de fechar a V1.

## 1. Resumo

O app já tem a base certa: adapters registrados por contrato, capabilities como conjunto aberto e navegação derivada delas. Faltam três coisas para virar a "lista de jogos com suporte" pedida:

1. **O registro não é dado.** O que o app sabe de um jogo (ids de loja, marcadores, targets) está espalhado em métodos Go de cada adapter. Adicionar um jogo simples exige escrever um adapter.
2. **Capability é só "o adapter declara".** Não existe o lado do usuário: ligar ou desligar um recurso num jogo.
3. **O jogo personalizado é um caso à parte.** Todo jogo fora da lista é o mesmo `generic`, definido instância por instância, sem identidade própria, sem detecção, sem como compartilhar nem como receber extensões.

A proposta: **um formato único de entrada de jogo (manifesto)**, usado pelos jogos embutidos e pelos que o usuário cria; **recursos em três camadas** (oferecido, ligado, efetivo); e **o id da entrada como âncora** para extensões por jogo no futuro.

## 2. Como é hoje

| Assunto | Como funciona | Onde |
|---|---|---|
| Registro | `games.NewRegistry(generic.Adapter{}, skyrimse.Adapter{})`, imutável, montado no bootstrap. | `internal/bootstrap/bootstrap.go:197`, `internal/core/application/games/registry.go` |
| Identidade | `game.Definition{ID, Name, Capabilities, Targets, ModTypes, CustomTargets, ToolOutputs, UnmanagedHints}`. | `internal/core/domain/game/game.go:101` |
| Detecção | O `StoreScanner` devolve tudo que acha (Steam, GOG, Epic, registro); cada adapter filtra em `Detect` com ids de loja em constantes privadas. `Markers`, `RegistryHints` e `VersionFile` são métodos obrigatórios. | `internal/adapters/skyrimse/skyrimse.go:37-153`, `ports/system.go:227` |
| Capabilities | Conjunto aberto de 10 ids. O core pergunta `Capabilities.Has(...)` e faz type assertion na interface opcional (`PluginSupport`, `LoadOrderSupport`, `LaunchSupport`, `HealthCheckProvider`, `InstallerProvider`, `CategoryProvider`, `ProcessDeclarer`, `PluginArchives`). | `game.go:30-41`, `plugins/state.go:80`, `launch/service.go:201` |
| Navegação | `WorkspaceItems(caps)`: Plugins e Load Order só aparecem com a capability. | `games/nav.go:27` |
| Jogo genérico | Um único `game.ID = "generic"`. O usuário informa nome, raiz, targets e executável; isso fica **na instância**. Sem detecção, sem dicas de root, sem content flags. | `internal/adapters/generic/generic.go`, `games/manage.go:129` |
| Lista "suportados" | Só `gameId`, `gameName`, `hidden`. | `internal/bridge/dto_games.go:77` |
| Liga/desliga | Não existe. Settings têm escopos `app`, `instance`, `profile` com chaves estáticas; nenhuma controla capability. | `internal/core/domain/settings/settings.go:22` |
| Extensões | Tela lista os adapters embutidos. Runtime de terceiros é V2 (D031, core/11 §7). | `internal/bridge/settings.go:242` |

O que **não** precisa mudar: o motor de deploy, conflitos, ordenação, perfis e o teste `TestNoGameSpecificLiteralsOutsideAdapters`. A auditoria fina de acoplamento é da frente "Desacoplamento por jogo e SDK"; aqui só uso o que afeta o registro.

## 3. Modelo proposto

### 3.1 Três níveis de suporte

| Nível | O que é | Quem serve | Exemplo |
|---|---|---|---|
| `full` | Jogo com comportamento que exige código (ler cabeçalho de plugin, serializar load order). | Adapter dedicado em Go. | Skyrim SE |
| `declared` | Jogo descrito só por dados: onde está, para onde vão os mods, como lançar. | Um adapter declarativo único, que interpreta manifestos. | Jogos de "pasta Mods" |
| `custom` | Mesma coisa que `declared`, mas a entrada foi criada pelo usuário. | O mesmo adapter declarativo. | Qualquer jogo fora da lista |

O ponto central: **`declared` e `custom` usam o mesmo formato e o mesmo código**. A diferença é só a origem da entrada. Um jogo personalizado que funciona bem pode ser exportado e virar entrada embutida sem reescrita.

O adapter `generic` de hoje vira esse adapter declarativo (mesmo nome registrado, versão 2), então as instâncias existentes não mudam de adapter.

### 3.2 Formato da entrada (manifesto de jogo)

Não é um conceito novo no glossário: é a forma serializada de `GameDefinition`, que ganha os campos de registro. Exemplo de um jogo declarado (valores ilustrativos):

```json
{
  "schema": 1,
  "id": "exemplo-jogo",
  "name": "Exemplo: O Jogo",
  "version": "1",
  "origin": "builtin",
  "support": "declared",
  "adapter": "generic",

  "discovery": {
    "stores": [
      { "store": "steam", "appId": "000000" },
      { "store": "gog", "appId": "0000000000" }
    ],
    "registry": [{ "id": "exemplo", "key": "HKLM\\SOFTWARE\\...", "value": "InstallPath" }],
    "markers": ["Exemplo.exe"],
    "versionFile": "Exemplo.exe",
    "processes": ["Exemplo.exe"]
  },

  "layout": {
    "targets": [
      { "id": "mods", "path": "Mods" },
      { "id": "root", "path": "" }
    ],
    "modTypes": [
      { "id": "default", "name": "Default", "target": "mods" },
      { "id": "root", "name": "Root", "target": "root", "methods": ["hardlink", "copy"],
        "priority": 10, "detect": [{ "all": ["root/"] }] }
    ],
    "rootHints": { "dirs": ["mods"], "extensions": [".pak"] },
    "toolOutputs": [],
    "unmanagedHints": [{ "target": "mods", "glob": "*.log" }]
  },

  "launch": [{ "id": "game", "exe": "Exemplo.exe", "default": true }],

  "features": [
    { "id": "filesystem_mod_target", "class": "base" },
    { "id": "installer", "class": "base" },
    { "id": "multiple_mod_types", "class": "base" },
    { "id": "launch", "class": "optional", "default": true }
  ]
}
```

| Bloco | Conteúdo | De onde vem hoje |
|---|---|---|
| Identificação | `id` estável, `name`, `version` da entrada, `origin` (`builtin`, `user`, `extension`), `support`, `adapter`. | `Definition.ID/Name`, `Adapter.Name/Version` |
| `discovery` | Ids por loja, dicas de registro, marcadores, arquivo de versão, processos. | Métodos `Markers`, `RegistryHints`, `VersionFile`, `Detect`, `Processes` |
| `layout` | Targets relativos à raiz, mod types com regra de detecção, dicas de root, saídas de ferramenta. | `Targets()`, `Definition.ModTypes`, `RootHints`, `ToolOutputs` |
| `launch` | Opções de lançamento estáticas. | `Instance.Executable` no genérico; `LaunchSupport` no Skyrim |
| `features` | Recursos oferecidos, com classe, padrão e dependências (3.3). | `Definition.Capabilities` |

Regras do formato:

- **Só dados.** O manifesto não carrega código nem caminho absoluto; `path` é sempre relativo à raiz e passa pela mesma validação de `game.ResolveCustomTargets` (INV-LIB-03, INV-ID-01).
- **Um adapter `full` também publica a sua entrada** nesse formato (o Skyrim declara `discovery`, `layout` e `features` como dado). O que continua em código é só o que é comportamento: cabeçalho de plugin, restrições, serialização, checks.
- **Detecção vira genérica.** Com os ids de loja no dado, o casamento "esta instalação da Steam é este jogo" sai de cada adapter e passa a ser uma função só. `Detect` vira interface opcional, para quem precisa de algo além disso.
- Ids de jogo: embutidos usam slug simples (`skyrimse`); os do usuário usam prefixo (`user.<slug>`), para nunca colidir com uma entrada embutida futura.
- `schema` versiona o formato; entrada com `schema` desconhecido é recusada com motivo, nunca interpretada pela metade.

### 3.3 Recursos (features) em três camadas

Hoje capability responde uma pergunta só ("o jogo suporta?"). O pedido de "ativo ou não por jogo" precisa de três:

| Camada | Pergunta | Quem define | Onde fica |
|---|---|---|---|
| **Oferecido** | O jogo sabe fazer isso? | Adapter, manifesto ou (futuro) extensão. | Entrada do registro |
| **Ligado** | O usuário quer isso neste jogo? | Usuário, com padrão vindo da entrada. | Banco, por instância |
| **Efetivo** | Está valendo agora? | Calculado: oferecido **e** ligado **e** dependências efetivas. | Não é persistido |

**O core só enxerga o efetivo.** O gancho já existe: `InstanceDefinition` devolve "capabilities efetivas = adapter + instância" (D057). Hoje a parte "instância" é vazia; ela passa a ser o que o usuário ligou. Nenhum `Capabilities.Has(...)` do core muda, e "processo X não existe neste jogo" continua sendo o caso normal: capability ausente, tela ausente, check ausente.

Descritor de cada recurso:

| Campo | Significado |
|---|---|
| `id` | Id da capability (`plugins`, `load_order`, `launch`...). Conjunto aberto; ids de extensão levam prefixo (`skyrimse.loot`). |
| `class` | `base` (sempre ligado, não aparece como chave) ou `optional` (o usuário liga/desliga). |
| `default` | Valor inicial numa instância nova. |
| `requires` | Outros recursos que precisam estar efetivos. |
| `maturity` | `stable` ou `experimental`. |
| `provider` | Quem oferece: o adapter, ou o id da extensão. |

Classificação proposta do catálogo atual:

| Capability | Classe | Observação |
|---|---|---|
| `filesystem_mod_target`, `installer`, `multiple_mod_types` | `base` | Sem isso não há gerenciador. |
| `external_change_strategy` | `base` | É proteção; não pode ser desligada. |
| `plugins` | `optional` | Desligado: sem tela Plugins, sem diagnósticos de plugin. |
| `load_order` | `optional`, `requires: [plugins]` | Desligado: o app para de ler e escrever o arquivo de load order. |
| `launch` | `optional` | Desligado: sem Play. A detecção de "jogo em execução" continua, porque é proteção do deploy. |
| `save_games`, `game_settings`, `tools` | `optional` | Entram quando existirem (V1.x). |

Desligar um recurso é uma **operação**, não um flag solto, porque pode haver estado aplicado. Regra proposta: desligar nunca apaga nem reverte nada no jogo; o app só para de gerenciar aquilo. Religar trata o que encontrar como mudança externa, com a triagem que já existe (D040). Assim nenhum invariante de deploy é tocado.

### 3.4 Jogo personalizado

Fluxo "Adicionar jogo fora da lista":

1. O usuário escolhe a pasta.
2. O app tenta reconhecer, só lendo: se os marcadores batem com uma entrada do registro, oferece essa entrada; se a pasta é uma instalação que o `StoreScanner` já conhece, pré-preenche nome, loja e id.
3. O usuário confirma nome, targets (um ou mais), executável opcional. Modelos prontos preenchem os targets dos arranjos mais comuns (pasta `Mods`, carregadores de mods conhecidos); os modelos são dados do adapter declarativo.
4. O app grava uma **entrada** `user.<slug>` no formato de 3.2 e cria a instância apontando para ela.

O que muda em relação a hoje:

| Hoje | Proposto |
|---|---|
| Todo jogo personalizado é `generic`. | Cada um tem `id` próprio. |
| Targets e executável vivem na instância. | Vivem na entrada; a instância guarda só o que é da instalação (raiz, pastas, método). |
| Não é detectável. | Com marcador ou id de loja, a busca rápida e a completa o encontram. |
| Sem dicas de root nem padrões de "não gerenciar". | O usuário pode declarar (opcional, em "Avançado"). |
| Não sai do PC. | Exportar e importar a entrada como arquivo `.json`. |
| Não recebe extensão. | Tem `id`, então pode. |

Entradas do usuário ficam no banco (uma linha por entrada, manifesto em JSON), não em arquivo solto, para seguir a mesma regra de backup e recuperação do resto do estado (core/14). Importar um arquivo é validar e gravar no banco.

Migração: cada instância `generic` existente ganha uma entrada `user.*` gerada a partir dos seus targets e executável. A coluna `adapter` não muda; `adapter_version` passa de 1 para 2, que é para o que ela existe (core/11 §1).

Isso **emenda a D057**, que rejeitou "um adapter `generic` por instância" para não quebrar o registro estático. Aqui não é um adapter por instância: é um adapter só, com definições vindas de uma fonte que pode crescer. O registro passa a ser composto de adapters fixos mais um repositório de entradas.

### 3.5 Extensões por jogo (previsão)

O runtime de extensões continua V2 (D031). O que o registro precisa deixar pronto agora é pouco:

- **O id da entrada é a âncora.** Uma extensão declara a que se aplica: ids de jogo, `*`, ou "qualquer jogo com a capability X".
- **Uma extensão contribui recursos**, com `provider` igual ao seu id. Para o usuário, um recurso de extensão aparece na mesma lista de recursos do jogo, com a origem indicada, e liga/desliga do mesmo jeito.
- **Estado por instância:** a mesma tabela de "ligado" serve, porque a chave é o id do recurso.
- Contribuições previstas, espelhando as interfaces opcionais que já existem: mod types, instaladores, checks de saúde, ferramentas, categorias, e entradas de jogo.

Primeiro caso de teste natural, ainda embutido: o provedor LOOT (`plugins.lootProvider`, hoje uma setting reservada para V1.x) é exatamente "extensão que se aplica a jogos com `plugins`".

### 3.6 Camadas e fontes de verdade

| Estado | Dono | Fonte de verdade |
|---|---|---|
| Entrada embutida | Adapter | Código/arquivo embutido no binário (`internal/adapters/...`; literais de jogo continuam só ali) |
| Entrada do usuário | Serviço de jogos | Banco (tabela nova) |
| Recurso ligado/desligado | Serviço de jogos | Banco, por instância (tabela nova) |
| Capabilities efetivas | Serviço de jogos | Calculado a cada leitura |
| Instalação | Como hoje | `game_instances` |

- `domain/game`: tipos de discovery e de descritor de recurso, validação do manifesto, cálculo do efetivo (função pura).
- `application/games`: registro composto, casamento genérico de lojas, operações de ligar/desligar e de criar/importar entrada.
- `adapters`: manifestos embutidos, adapter declarativo, modelos de jogo personalizado.
- `bridge`: só transporta. A lista de suportados ganha nível de suporte, lojas e recursos; a UI não decide nada (anti-pattern 1).

### 3.7 UI (só depois; não toca a lib nem as telas agora)

- **Games › Suportados:** cada jogo mostra nível de suporte e recursos oferecidos. Sem entradas "em breve" (anti-pattern 18).
- **Detalhes do jogo / Settings por jogo:** seção "Recursos" com as chaves dos opcionais; recurso bloqueado por dependência mostra o motivo.
- **Assistente:** o passo de jogo personalizado ganha reconhecimento, modelos, exportar/importar.

Como o subprojeto de componentes está mexendo nas telas, as fases abaixo entregam backend e bridge primeiro e deixam a UI para quando ele liberar.

## 4. Decisões que a proposta gera

Entram em `decisoes.md` com número só após o ok (a outra frente também vai registrar decisões; numerar agora geraria colisão).

1. O registro de jogos é dado: `GameDefinition` ganha `support`, `discovery` e descritores de recurso; detecção por loja vira genérica; `Detect` vira opcional. Emenda D057.
2. Recursos em três camadas; o core só vê o efetivo; classes `base`/`optional`; dependências. Detalha D011.
3. Ligar/desligar é por instância, é operação, e nunca apaga nem reverte arquivos do jogo.
4. Manifesto de jogo com `schema`; `declared` e `custom` usam o mesmo formato e o mesmo adapter. Emenda D031 (o `generic` vira o adapter declarativo).
5. Entradas do usuário no banco, com exportar/importar; ids `user.*`; migração das instâncias `generic`.
6. Extensões se ancoram no id da entrada e contribuem recursos com `provider`. Detalha D012 e core/11 §7.

## 5. Plano por fases

Cada fase fecha com `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, decisão registrada, `core/11` e glossário atualizados, e um commit no master.

| Fase | Entrega | Mexe em | Visível ao usuário |
|---|---|---|---|
| **R1. Registro como dado** | Tipos de `discovery` e descritor de recurso no domínio; Skyrim e genérico publicam entrada completa; casamento de loja genérico; `Detect` opcional; bridge de "suportados" enriquecido. | `domain/game`, `ports`, `application/games`, os dois adapters, `bridge` | Não (mesmo comportamento) |
| **R2. Recursos ligáveis** | Tabela de recursos por instância; capabilities efetivas; operações de ligar/desligar com dependências; navegação e diagnósticos seguindo o efetivo; bridge. | migração SQL, `application/games`, `plugins`, `launch`, `diagnostics`, `bridge` | Sim, quando a UI entrar |
| **R3. Manifesto e adapter declarativo** | Formato com `schema` e validação; `generic` v2 interpreta manifestos; um ou dois jogos declarados reais como prova. | `domain/game`, `adapters/generic`, testes em `adapters/gamesflow` | Sim (jogos novos na lista) |
| **R4. Jogo personalizado como entrada** | Repositório de entradas do usuário; registro composto; reconhecimento de pasta; modelos; exportar/importar; migração das instâncias `generic`. | migração SQL, `application/games`, `adapters/generic`, `bridge` | Sim |
| **R5. UI** | Telas de 3.7, com as skills `dettmann-ui-use` e `dettmann-ui-improve`. | `frontend/` | Sim |
| **R6. Contrato de extensão por jogo** | Só contrato e um módulo embutido como prova (candidato: LOOT). Runtime de terceiros continua V2. | `ports`, `application`, `core/11 §7` | Parcial |

Como a R1 ficou (D113): a descoberta virou `Definition.Discovery`; `Markers`, `RegistryHints`, `VersionFile` e `Detect` saíram do port (`Detect` não ficou nem como opcional, porque nenhum adapter precisa); classe e dependências são do recurso (`game.Describe`), não de cada jogo; a consulta é a `Registry.Support()` da D112, exposta em `GamesSupport()`. O formato serializado (JSON com `schema`) fica para a R3.

Como a R2 ficou (D115): a escolha mora em `game.Instance.Features` (tabela `instance_features`); o efetivo sai de `Definition.Effective` e chega ao core só por `ports.InstanceDefinition`; `games.SetFeature` recusa recurso não oferecido, `base` ou com requisito não efetivo. A tela de recursos fica para a R5.

Como a R3 e a R4 ficaram (D116, D117): o manifesto não carrega `features`, `support`, `origin` nem `adapter` (são derivados ou decididos por quem carrega); nenhum jogo `declared` embutido existe ainda, porque Skyrim e Valheim têm adapter próprio; o `generic` v2 serve as entradas; o assistente atual já cria entrada sem mudança na UI; a migração roda na inicialização. Reconhecimento de pasta e modelos prontos ficaram para a R5, junto com as telas.

Ordem e dependências: R1 primeiro (tudo depende dela). R2 e R3 são independentes entre si. R4 depende de R3. R5 depende do subprojeto de componentes liberar as telas. R6 depende de R2.

Invariantes novos a testar (ids a atribuir): capability efetiva nunca excede a oferecida; recurso com dependência não efetiva nunca fica efetivo; desligar recurso não gera escrita em target; manifesto inválido ou de `schema` desconhecido nunca vira definição; id `user.*` nunca colide com embutido; entrada em uso por instância não pode ser apagada.

Riscos:

- **R4 muda onde moram targets e executável do genérico.** É a fase com migração de dados; precisa de teste com banco real de versão anterior.
- **R1 mexe no port `GameAdapter`**, que a outra frente também deve propor enxugar. As duas mudanças precisam ser uma só.
- **Desligar `load_order` com arquivo já escrito** é o caso mais delicado de R2; a regra de 3.3 (não reverter) precisa do seu ok explícito.

## 6. Respostas do Leonardo (2026-10-13)

1. Liga/desliga vale **por instância**; o padrão vem da entrada.
2. Desligar um recurso **deixa os arquivos como estão**: o app só para de gerenciar; religar passa pela triagem de mudança externa.
3. O primeiro jogo publicado no formato de entrada é o **Skyrim**. Consequência: a R1 faz o adapter `skyrimse` publicar `discovery`, `layout` e `features` como dado, e a R3 valida o formato com a parte declarativa do Skyrim, sem acrescentar outro jogo por enquanto. O comportamento de plugins e load order continua em código (nível `full`).
4. Jogo personalizado **pode ser exportado e importado** como arquivo.

Início da implementação: a R1 espera a fase A da frente de desacoplamento entrar no master, porque as duas mexem em `registry.go`, `game.go` e no adapter do Skyrim.

## 7. Alinhamento com a frente de desacoplamento

Conferido contra `docs-ia/09-proposta-multi-jogo-e-extensoes.md` (b322b70). Não há conflito de modelo; há sobreposição de trabalho e uma ordem a respeitar.

| Ponto | Lá | Aqui | Como fica |
|---|---|---|---|
| Consulta de suporte por jogo | `GameSupport` com `features[{id, status}]`, na fase A | "Suportados enriquecido", na R1 | **Uma consulta só**, a `GameSupport` da fase A. A R1 só acrescenta `support`, lojas, `class`, `default` e `requires`. |
| Estados de um recurso | `available`, `not_applicable`, `planned` | oferecido, ligado, efetivo | Complementares: o `status` de lá é a camada "oferecido" daqui. `not_applicable` nunca vira chave para o usuário. |
| Capability e interface | Relação 1:1 validada no registro; id para `HealthCheckProvider`, `CategoryProvider`, `ProcessDeclarer`; reservar as que nada lê | Tabela de 3.3 usa o catálogo atual | A tabela de 3.3 é refeita sobre o catálogo que sair da fase A (as `base` que nada lê podem sumir). |
| Port `GameAdapter` | `RegistryHints` e `VersionFile` obrigatórios são o acoplamento 12; SDK só na fase C | R1 tira detecção do contrato obrigatório | A R1 resolve o item 12. Vem **depois** da fase A e é a única mudança do port até a fase C. |
| UI decidindo por capability | Acoplamento 9, corrigido na fase A | R2 depende de a UI só ler o efetivo | R2 só começa com isso corrigido. |
| Módulos de recurso (N1) | Um por capability, com pontos de contribuição | Recurso `optional` ligável por instância | Ligar/desligar um recurso é ligar/desligar o módulo N1 naquela instância. |
| Jogos "em breve" | Deixa para esta frente decidir | Sem entradas "em breve" (anti-pattern 18) | O nível `declared` cobre o caso com suporte real em vez de promessa. |
| Segundo jogo | Fase B: um jogo não Bethesda **com ordem de carga**, para generalizar o modelo de plugin | R3: um ou dois jogos de arquivos soltos | São provas diferentes. Os jogos da R3 não validam a ordem de carga genérica e não substituem a fase B. |

Ordem combinada: **fase A de lá → R1 → R2 e R3 em paralelo → R4**; a fase B de lá é independente de R2 a R4.
