# Arquitetura do core

Referências: D017–D021, D029, D038. Leia com `docs-ia/03-fontes-de-verdade.md`.

## 1. Camadas

```
internal/
  core/domain/        entidades, value objects, invariantes, algoritmos puros
  core/application/   casos de uso + ports (interfaces)
  infrastructure/     implementações de ports: sqlite, filesystem, extração, hashing, processos, relógio, IDs
  adapters/           adapters de jogo (generic, skyrimse) e, no futuro, providers
  bridge/             transporte UI <-> application (DTOs, consultas, comandos, eventos)
  bootstrap/          composition root
```

Regra de dependência: `domain <- application <- infrastructure | adapters`. `bridge` só depende de `application` (e DTOs); `bootstrap` conhece tudo. Verificada por `internal/architecture_test.go`.

Adapters dependem de `domain` e `application` (implementam ports como `GameAdapter`), nunca de `infrastructure` diretamente. Se um adapter precisa ler um arquivo, usa o port de filesystem que recebe.

## 2. Módulos de domínio

Um pacote por módulo em `core/domain`, e um por caso de uso em `core/application` quando crescer. Módulos e seus documentos:

Categoria de estado de cada pacote (D049) entre parênteses; verificada por `internal/architecture_test.go`.

| Pacote | Conteúdo | Documento | Status |
|---|---|---|---|
| `relpath` (puro) | normalização de caminho, nomes reservados | core/01 | F1 ✅ |
| `ordering` (puro) | motor de ordenação por restrições, compartilhado (D029/D050) | core/05, core/08 | F1 ✅ |
| `game` (desejado) | Definition, ModType, Instance, Target, Location, Capability | core/11 | F1 ✅ |
| `mod` (desejado) | Mod, Attributes, Archive, Category/CategoryTree, Installation, File | core/02 | F1 ✅ |
| `profile` (desejado) | Profile, ModState, ModOrder (Entry), Separator, estado de plugins, LoadOrder, IndexLock, Snapshot | core/07 | F1 ✅ |
| `rules` (desejado) | OrderRule, DependencyRule, IncompatibilityRule, Set da instância | core/05, core/06 | F1 ✅ |
| `override` (desejado) | FileOverride, FileExclusion, ConflictReview da instância | core/05 | F1 ✅ |
| `plugin` (desejado) | Plugin (inventário), Name, Header, Rule, Group, Rules da instância | core/08 | F1 ✅ |
| `settings` (desejado) | catálogo de core/13, escopos, validação | core/13 | F1 ✅ |
| `deployment` (aplicado) | Manifest, Entry (link/backup/dir), Evidence, Observation, Action, Journal, AppliedLoadOrder | core/04 | F1 ✅ |
| `conflict` (calculado) | vencedores, conflitos, overrides obsoletos, pares, indicadores | core/05 | F1 ✅ |
| `deployplan` (calculado) | Desired + fingerprint, plano por diff, plano de purge | core/04 | F1 ✅ |
| `deploystate` (calculado) | status de deploy | core/04 §7 | F1 ✅ |
| `externalchange` (calculado) | classificação, ações permitidas, decisões | core/09 | F1 ✅ |
| `dependency` (calculado) | avaliação de requisitos | core/06 | F1 ✅ (avaliador na F9) |
| `diagnostic` (calculado) | Diagnostic, catálogo de códigos, Suppression | core/10 | F1 ✅ |
| `notification` | entrega (lida/dispensada, agregação) | core/10 | F1 ✅ |
| `installer` (calculado) | entradas seguras, limites, resolução de root, plano de instalação, instalador `basic`, metadados (`info.xml`, nome Nexus); FOMOD na F10 | core/03 | F4 ✅ / F10 |
| `history` | HistoryEntry (projeção), ações reversíveis | core/10 | F9 |
| `operation`, `event` | já implementados | D019/D020 | F0 ✅ |

## 3. Ports principais (application)

Ports são interfaces pequenas, definidas pelo consumidor. Lista mínima esperada:

| Port | Responsabilidade | Implementação V1 |
|---|---|---|
| Repositórios (`GameRepo`, `ModRepo`, `ProfileRepo`, `RuleRepo`, `ManifestRepo`, ...) | persistência transacional | SQLite |
| `UnitOfWork` | transação que envolve repositórios + eventos | SQLite |
| `FileSystem` | stat, leitura, listagem, criação de hardlink/symlink, cópia, mover, remover, identidade de arquivo (volume + file index) | Windows |
| `Extractor` | listar e extrair archives para pasta temporária, com limites | biblioteca/binário escolhido na F4 (decisão registrada) |
| `Hasher` | hash de conteúdo (streaming) | xxhash3/sha256 (decisão na F4) |
| `GameAdapter` | contrato de core/11 | `generic`, `skyrimse` |
| `StoreScanner` | descobrir instalações por loja | Steam, GOG, Epic, registro |
| `ProcessLauncher` | lançar jogo | Windows |
| `Clock`, `IDGenerator` | tempo e IDs | já existentes |
| `EventPublisher` | publicar após commit | event bus existente |
| `DiagnosticsStore` | supressões, leituras | SQLite |

## 4. Operações longas

Toda ação que toca filesystem ou pode levar mais de ~200 ms é uma `Operation` (D019): import/install, reinstall, remove, deploy, purge, sort, scan de external changes, mover staging, descoberta completa de jogos, backup/restore.

Contrato de cada tipo de operação (documentado no core do módulo dono):

- **Steps declarados** na criação, com nomes estáveis (ex.: deploy: `inspect`, `plan`, `await_decision`, `journal`, `apply`, `verify`, `commit`).
- **Erros estruturados** com `code` estável (catálogo no documento do módulo), `retryable` e `detail`.
- **Cancelamento**: cada operação declara em quais steps pode ser cancelada e o que significa cancelar (ex.: deploy só entre operações de arquivo; o estado resultante é reconciliável).
- **Retomada**: o que acontece se a operação é encontrada `interrupted` na inicialização.
- **Eventos** emitidos além das transições genéricas.
- **Decisão pendente**: operações podem parar em `await_decision` (ex.: plano com escolhas). Isso não é falha; a operação fica `running` com step `await_decision` e a UI mostra o diálogo correspondente. Se o app fechar nesse ponto, ela vira `interrupted` e nada foi escrito. O import tem dois pontos de decisão e para no próprio step (`dedupe`, `plan_install`), com a decisão exposta pela fila (D064).

## 5. Concorrência (D038)

- Lock por GameInstance para operações mutantes. Adquirido pela camada de aplicação antes de criar a operação; liberado no fim (qualquer status).
- Segunda operação mutante: erro `instance_busy` com a operação em curso como parâmetro.
- Fila de importação: comando explícito "importar N arquivos" cria uma operação por arquivo em uma fila visível, processada sequencialmente sob o lock; a fila pode ser pausada/cancelada item a item.
- Operações globais (backup do banco, settings de app) usam lock global próprio e não bloqueiam leituras.
- Leituras (consultas do bridge) nunca pegam lock; leem o último estado commitado.
- Auto-deploy: mudanças no desejado agendam um deploy com atraso curto (coalescência). Se a instância estiver ocupada, o auto-deploy é reagendado para depois da operação atual. Isso não é fila implícita de ações do usuário, é um único "deploy pendente" que o sistema mantém.

## 6. Comandos, consultas e eventos no bridge

- **Comandos** (mutações) retornam imediatamente um `operationId` quando longos, ou o resultado quando curtos (ex.: renomear mod). Nunca retornam estado de domínio "otimista".
- **Consultas** retornam DTOs de leitura prontos para a tela (ex.: `ModListView` já com prioridade, status de conflito e contagem de diagnósticos por mod). A montagem dessas visões é caso de uso de aplicação, não lógica da UI.
- **Eventos** para a UI (`operation:event` e canais por agregado se necessário) são sinais de invalidação: a UI relê a consulta afetada.
- Paginação/virtualização: consultas de listas grandes (arquivos de um mod, conflitos, plugins) aceitam janela e filtro no backend.
- **Erros** (D053, INV-OPS-05): toda chamada que falha rejeita com o JSON `{code, params, detail}` (`internal/bridge/errors.go`). `code` é estável e traduzido pela UI (`error.<code>` no catálogo i18n), `params` alimenta a mensagem e `detail` é técnico (só em "Detalhes técnicos"). Erros de operação continuam no `OperationError` do DTO, com o código do módulo dono. Toda falha é registrada no log técnico.

| Código | Quando | Parâmetros |
|---|---|---|
| `internal` | erro sem mapeamento (bug ou falha de infraestrutura) | — |
| `not_found` | entidade pedida não existe | depende da chamada (`operation`, ...) |
| `setting_unknown` | chave fora do catálogo disponível ou de escopo errado | `key` |
| `setting_invalid` | valor rejeitado pela validação do catálogo | `key`, `value` |
| `backend_offline` | só na UI: app fora do shell Wails (D021) | — |
| `game_unknown` | jogo sem adapter neste build | `game` |
| `instance_busy` | outra operação mutante na instância (D038) | `instance` |
| `instance_deployed` | parar de gerenciar / mudar de pasta com algo implantado (até o purge existir, F7) | `instance` |
| `name_empty`, `name_taken` | nome da instância vazio / já usado no mesmo jogo | `name` |
| `root_invalid` | pasta não é instalação do jogo | `reason` (`not_found`, `not_directory`, `marker_missing`, `unreadable`, `not_absolute`), `marker` |
| `root_in_use` | pasta já gerenciada por outra instância | `instance` |
| `targets_invalid`, `folders_invalid` | targets do jogo genérico / colocação das pastas inválidos (INV-LIB-03) | `detail` |
| `staging_foreign`, `folder_foreign` | pasta existente não é nossa (core/04 §10) | `reason` (`not_empty`, `other_instance`, `unreadable`), `folder` |
| `method_unavailable` | método de deploy indisponível para esta configuração | `method`, `reason` |
| `executable_invalid` | executável do jogo genérico inválido | `reason` (`invalid_path`, `not_found`) |
| `confirm_name_mismatch` | nome digitado para apagar staging/arquivos não confere | — |
| `folder_unknown`, `folder_missing` | "abrir pasta" com nome de pasta desconhecido / pasta inexistente | `folder` |
| `instance_busy` (também do lock compartilhado, D065) | | `instance`, `holder` |
| códigos da biblioteca (core/02 §11) | import, instalação, remoção, categorias | `name`, `reason`, `folder`, `mod`, `limit`, `entries`... |
| `operation_not_cancellable` | cancelar item da fila depois de `stage` (D065) | `operation` |
| `decision_not_pending` | responder decisão que não está mais pendente | `operation`, `choice` |
| `category_invalid` | categoria inexistente ou árvore inválida | `category` |
| `mod_type_unknown` | tipo de mod que a definição não declara | `type` |
| `import_source_missing` | arquivo/pasta a importar sumiu | `name` |
| `profile_name_taken`, `profile_is_active`, `profile_last`, `profile_not_found`, `snapshot_not_found` | ciclo de vida de profiles (core/07 §8) | `name`, `profile`, `snapshot` |
| `order_violates_rules`, `rule_would_create_cycle`, `rule_duplicate`, `rule_self_reference`, `rule_not_removable`, `rule_not_found`, `mod_not_found`, `separator_not_found` | ordem e regras (core/05 §7, D069) | `cycle` (nomes, "A → B → A"), `count` |
| `order_history_stale`, `order_nothing_to_undo` | reverter/desfazer mudança de ordem (D070) | — |

Erros de operação (`OperationError`) também carregam `params` desde a F4 (D067), para a UI traduzir a mensagem com os mesmos parâmetros.

A UI refina a mensagem quando existe `error.<code>.<reason>` no catálogo (ex.: `error.root_invalid.marker_missing`); sem ele usa `error.<code>`. Avisos do assistente (não bloqueiam) usam `warning.<code>`: `hardlink_unavailable`, `backup_other_volume`.

## 7. Recalcular vs persistir

Cálculos derivados (conflitos, desejado, diagnósticos, status) são funções puras de domínio sobre dados carregados. A aplicação pode manter **cache em memória** invalidado por evento, nunca como verdade. Meta de desempenho em `00-visao-e-escopo.md`.

## 8. Critérios de aceite da arquitetura

- `go test ./internal` falha se qualquer pacote violar a regra de camadas.
- Nenhum pacote de `core/` importa `os`, `path/filepath` para acesso a disco, `database/sql` ou Wails (normalização de texto de caminho é permitida em `relpath`).
- Todo tipo de operação tem steps, códigos de erro, regras de cancelamento e retomada documentados antes de ser implementado.
