# Fontes de verdade

Antes de alterar qualquer estado, localize-o nesta tabela. Se um dado **derivado** estiver sendo persistido como verdade, é anti-pattern 13.

## Tabela principal

| Estado | Dono (módulo) | Fonte de verdade | Persistido? | Derivado de | Invalida quando |
|---|---|---|---|---|---|
| GameDefinitions | adapters | código do adapter | não | — | versão do app |
| GameInstance | games | `state.db` | sim | — | usuário edita/descobre |
| Capabilities efetivas | games | adapter + instância | não | adapter | adapter/instância mudam |
| Instância ativa, jogos ocultos (descobertos/suportados) | games | `state.db` (`app_state`) | sim | — | usuário (D060) |
| Candidatos descobertos | games | **cálculo** (busca nas lojas/unidades, em memória da sessão) | não | lojas, registro, unidades | nova busca |
| Implantação estrangeira (achados) | games | **cálculo** (topo dos targets e da raiz) | não | filesystem | qualquer leitura (D059) |
| Marcadores de staging/arquivos/backups | games | filesystem (evidência); banco é primário | no disco | instância | criar/apagar instância (D058) |
| Archive | library | ArchiveStore + `state.db` (hash, nome) | sim | — | import/remoção |
| Mod + atributos | library | `state.db` | sim | — | import, edição, remoção |
| Installation | library | `state.db` (lista de arquivos) + staging (conteúdo) | sim | — | install/reinstall |
| Integridade da staging | library | observação do filesystem | não | Installation vs staging | scan |
| Profile, ModEntry, ModOrder | profiles | `state.db` | sim | — | ações do usuário, motor de ordenação |
| OrderRule, Dependency/IncompatibilityRule | rules | `state.db` | sim | — | ações do usuário, metadados |
| FileOverride, FileExclusion | conflicts | `state.db` | sim | — | ações do usuário |
| FileConflict | conflicts | **cálculo** | não (cache opcional, descartável) | Installations + profile + overrides | qualquer mudança nos insumos |
| ConflictReview | conflicts | `state.db` | sim | — | usuário revisa; invalida quando o conjunto de Locations em disputa muda |
| DesiredState | deployment | **cálculo** | não | profile ativo + conflitos + mod types | qualquer insumo |
| DeploymentManifest | deployment | `state.db` + marcador no target | sim | — | deploy/purge verificados |
| DeploymentJournal | deployment | `state.db` | sim (temporário) | — | início/fim de deploy |
| Movimento de staging em curso | deployment | `state.db` (`app_state`, D078) | sim (temporário) | — | início/fim de `move_staging` |
| Estado observado | deployment | filesystem | não | — | a qualquer momento |
| DeploymentStatus | deployment | **cálculo** | não | desejado × aplicado × observado + journal | qualquer insumo |
| ExternalChange | deployment | **cálculo** + decisões pendentes | decisões sim; divergência não | aplicado × observado | scan |
| Plugins (inventário) | plugins | **cálculo** | não (cache de cabeçalho por hash, descartável) | arquivos implantados + base + não gerenciados | deploy, scan |
| PluginState, LoadOrder desejada | plugins | `state.db` | sim | — | usuário, sort |
| PluginRule, PluginGroup | plugins | `state.db` | sim | — | usuário, provedores |
| LoadOrder aplicada | plugins | arquivo do jogo (`plugins.txt`) | no jogo | — | deploy, ferramentas externas |
| Diagnostic | diagnostics | **cálculo** (health checks) | não; supressões sim | fatos atuais | qualquer fato |
| Supressão de diagnóstico | diagnostics | `state.db` | sim | — | usuário |
| Notification (lida/dispensada) | diagnostics | `state.db` | sim | — | usuário |
| Operation, Event | operations | `state.db` | sim | — | execução |
| HistoryEntry | history | **projeção** de Events | não (pode ter índice) | Events | novos eventos |
| Snapshot | profiles | `state.db` | sim | — | antes de operações em massa, manual |
| Settings | settings | `state.db` (escopo app/instância/profile) | sim | — | usuário |
| Tema/idioma da UI | settings | `state.db` | sim | — | usuário |

## Regras de uso

1. A UI nunca é fonte de verdade (INV-OPS-04). Estado de apresentação (filtro, ordenação de coluna, painel aberto) pode ficar na UI ou em setting de interface, nunca em entidade de domínio.
2. Cache de cálculo é permitido se: (a) tiver chave de invalidação explícita, (b) puder ser apagado sem perda, (c) nunca for lido como verdade por outro módulo.
3. Quando dois lugares guardam o mesmo fato (ex.: manifesto no banco e marcador no target), um é declarado **primário** (banco) e o outro é **evidência de recuperação**. Divergência entre eles vira diagnóstico, nunca correção silenciosa.
4. O filesystem do jogo nunca é fonte de verdade do estado **desejado**; é a fonte do estado **observado**.
