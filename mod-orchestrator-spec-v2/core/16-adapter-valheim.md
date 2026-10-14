# Adapter Valheim

Referências: D011, D112, D113, D114, core/11, core/03 §6. Código: `internal/adapters/valheim`.

Segundo jogo com suporte dedicado. Existe para provar que um jogo sem plugins e sem load order, com outro framework e outro formato de pacote, cabe no núcleo sem mudança nele.

## 1. Identificação

Fatos lidos de uma instalação real em 2026-10-13 (`steamapps/appmanifest_892970.acf`, pasta do jogo e um profile do r2modman).

| Item | Valor |
|---|---|
| GameDefinition | `valheim`, "Valheim", suporte `full` |
| Loja | Steam, app id `892970` |
| Marcador | `valheim.exe` |
| Versão | não declarada: a versão de arquivo do executável é a do motor, não a do jogo |
| Processo em execução | `valheim.exe` |

## 2. Capabilities

`filesystem_mod_target`, `multiple_mod_types`, `installer`, `launch`, `external_change_strategy`, `adapter_installers`, `health_checks`, `running_detection`.

**Não tem** `plugins` nem `load_order`: o BepInEx ordena o que carrega pelas dependências que cada mod declara no próprio código, e não há arquivo de ordem que o usuário edite. O workspace não mostra Plugins nem Load Order. Também não declara `default_categories`.

## 3. Targets e ModTypes

| Target | Caminho |
|---|---|
| `bepinex` | `<root>/BepInEx` |
| `root` | `<root>` |

| ModType | Target | Detecção |
|---|---|---|
| `default` | `bepinex` | padrão |
| `root` | `root` | pasta `root/` no mod |
| `bepinex` | `root` | `winhttp.dll` e `BepInEx/core/` (o pacote do framework) |

O target `bepinex` é **criável** (D118): numa instalação sem o framework a pasta não existe, e o primeiro deploy a cria; o purge a remove se ficar vazia.

Um mod comum tem arquivos em `plugins/`, `patchers/` e `config/`; por isso o target padrão é a pasta `BepInEx` e não `BepInEx/plugins` (um mod tem um ModType, logo um target).

## 4. Instaladores do adapter

Perguntados depois do FOMOD e antes do básico. Só produzem plano.

| Id | Prioridade | Reconhece | Destino |
|---|---|---|---|
| `bepinex-pack` | 20 | pasta do archive com `winhttp.dll` ao lado de `BepInEx/core/` | tudo dessa pasta na raiz do jogo, ModType `bepinex` |
| `bepinex-package` | 30 | `manifest.json` na raiz do archive | `plugins/<pasta>/…`, `patchers/<pasta>/…`, `config/…`; o resto (DLLs na raiz, `manifest.json`, `icon.png`, `README.md`) em `plugins/<pasta>/` |
| `bepinex-loose` | 40 | DLL sem `manifest.json` e sem nenhuma pasta do framework | `plugins/<pasta>/…`, sem a pasta invólucro |

O instalador de pacote também devolve os metadados do `manifest.json` (D118): nome (com `_` trocado por espaço), versão, descrição e site. Desde a D125 devolve ainda o pacote: o `name` como identidade e as `dependencies` (`Autor-Nome-versão`) como pacotes exigidos, menos o `BepInExPack_Valheim`, que é o framework. Eles viram `DependencyRule` de `source=metadata` ao instalar e, enquanto nenhum mod declara o pacote, `mod_requirement_missing`.

`<pasta>` é o `name` do `manifest.json` (aceita BOM); sem ele, o nome da primeira DLL. Fica gravada em `Installation.options["folder"]`, então a reinstalação cai no mesmo lugar. Um `BepInEx/` no começo do caminho é removido. Archive já no layout do framework (`BepInEx/plugins/...`) fica com o instalador básico, pelas dicas de root `plugins`, `patchers`, `config`, `core`.

Diferença conhecida para o r2modman: ele nomeia a pasta `Autor-Nome`, com o autor vindo do nome do arquivo baixado; o instalador não recebe o nome do archive, então usa só `Nome` (verificar se vale levar o nome do archive ao contexto do instalador).

## 5. Flags de conteúdo

`bepinex_plugin` (DLL em `plugins/`), `bepinex_patcher` (DLL em `patchers/`), `bepinex_config` (`config/`), `bepinex_runtime` (`core/` ou `winhttp.dll` na raiz).

## 6. Health check

`framework_missing` (o mesmo código do SKSE, com `framework = BepInEx`): há mod habilitado com plugin ou patcher, nenhum mod habilitado do tipo `bepinex`, e a raiz não tem `winhttp.dll` **e** `BepInEx/core/BepInEx.Preloader.dll`. Os dois são exigidos: o proxy sozinho, deixado por outro gerenciador, não carrega nada. Erro, ação "Importar"; não bloqueia deploy.

## 7. Launch e alterações externas

- Uma opção de launch, `game` (`valheim.exe`): quem inicia o framework é o proxy na raiz, não outro executável.
- `BepInEx/config` é saída conhecida (o jogo cria um `.cfg` por mod na primeira execução); `config/*.cfg` e `*.log` são sugeridos como "não gerenciar".

## 8. Fora desta versão

- Dependências do `manifest.json` (`Autor-Nome-versão`) como `DependencyRule` de `source=metadata`: `Plan.Requirements` hoje carrega arquivos, não pacotes.
- Importar profiles do r2modman e provider da Thunderstore (core/15).
- Implantação fora da pasta do jogo, como o r2modman faz: o Mod Orchestrator implanta na pasta do jogo. Os dois gerenciadores não devem gerenciar a mesma instalação ao mesmo tempo.

- Autor do mod: o `manifest.json` não o informa (ele está só no nome do arquivo baixado) e o instalador não recebe esse nome (D125, item 7).

## 9. Critérios de aceite

- O registro aceita o adapter ao lado de `generic` e `skyrimse` (D112) e o workspace não tem Plugins nem Load Order.
- Pacote com `manifest.json`, pacote do framework, DLL solta e archive no layout do framework caem nos destinos da tabela (`valheim_test.go`).
- Dependências do manifesto viram regra ao instalar o pacote exigido, aparecem como requisito ausente antes disso e não se repetem ao reinstalar; no `generic` nada nasce (`integration/packages_test.go`, D125).
- Proxy sem preloader gera `framework_missing`; framework presente ou gerenciado, não.
