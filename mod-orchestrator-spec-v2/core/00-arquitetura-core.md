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
| `installer` | plano de instalação, FOMOD | core/03 | F4/F10 |
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
- **Decisão pendente**: operações podem parar em `await_decision` (ex.: plano com escolhas). Isso não é falha; a operação fica `running` com step `await_decision` e a UI mostra o diálogo correspondente. Se o app fechar nesse ponto, ela vira `interrupted` e nada foi escrito.

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

## 7. Recalcular vs persistir

Cálculos derivados (conflitos, desejado, diagnósticos, status) são funções puras de domínio sobre dados carregados. A aplicação pode manter **cache em memória** invalidado por evento, nunca como verdade. Meta de desempenho em `00-visao-e-escopo.md`.

## 8. Critérios de aceite da arquitetura

- `go test ./internal` falha se qualquer pacote violar a regra de camadas.
- Nenhum pacote de `core/` importa `os`, `path/filepath` para acesso a disco, `database/sql` ou Wails (normalização de texto de caminho é permitida em `relpath`).
- Todo tipo de operação tem steps, códigos de erro, regras de cancelamento e retomada documentados antes de ser implementado.
