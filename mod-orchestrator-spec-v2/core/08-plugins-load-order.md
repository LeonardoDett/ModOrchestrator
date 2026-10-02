# Plugins e load order

Referências: D006, D029, D040, D041; INV-PLG-*, INV-ORD-05/06. Vortex: `gamebryo_plugin_management` (PluginList, PluginFlags, MasterList, GroupEditor, UserlistEditor, LockIndex, autosort, pluginSync, deployWatcher, "Enable externally added plugins automatically"), `file_based_loadorder` (jogos com load order por lista), `mod_load_order`. Específico do Skyrim: `core/12-adapter-skyrim-se.md`.

## 1. Regra fundamental

Plugins e load order são capabilities (`plugins`, `load_order`). O core fornece o modelo, o motor de ordenação (D029) e o fluxo; o adapter fornece: reconhecimento de arquivos, leitura de cabeçalho, restrições rígidas, limites, serialização. Nenhuma regra Bethesda no core (anti-pattern 3).

## 2. Inventário de plugins (derivado)

Fontes:
1. Plugins fornecidos pelos mods **vencedores** no desejado do profile (arquivos que vão estar no target).
2. Plugins do jogo base e implícitos (declarados pelo adapter).
3. Plugins **não gerenciados** encontrados no target (instalados à mão, Creation Club, gerados por ferramentas).

Cada plugin: nome, origem (mod / base / implícito / não gerenciado), cabeçalho (lido pelo adapter; cache por hash do arquivo), flags normalizadas pelo adapter (`master`, `light`, `medium`, `blueprint`… conforme jogo), masters[], descrição, autor, versão, problemas.

Plugin fornecido por mod desabilitado ou que perde o conflito de arquivo não aparece como disponível (aparece em "plugins de mods desabilitados" como filtro).

## 3. Estado por profile

- `PluginState.enabled` por plugin (por nome).
- `LoadOrder`: lista completa de plugins conhecidos (ativos e inativos) em ordem.
- `IndexLock`: plugin travado em posição (paridade com LockIndex do Vortex).

Plugin novo (apareceu no inventário):
- de mod recém-habilitado: entra inativo ou ativo conforme setting "Ativar plugins de mods ao habilitar" (padrão ligado, paridade com o comportamento do Vortex para Gamebryo), e é posicionado pelo motor (se auto-sort) ou no fim;
- não gerenciado: ativado automaticamente se "Ativar automaticamente plugins adicionados externamente" estiver ligado (padrão desligado, paridade Vortex);
- plugin que some do inventário: sai da LoadOrder, mas o PluginState é mantido (voltará ao mesmo estado se reaparecer).

## 4. Restrições

| Tipo | Fonte | Rígida? |
|---|---|---|
| Implícitos em posições fixas no topo | adapter | sim |
| Master antes de dependente (cabeçalho) | adapter | sim |
| Flag master antes de não-master | adapter | sim (Skyrim: sim) |
| IndexLock | usuário | sim |
| PluginRule "carrega depois de" | usuário (e V1.x LOOT) | sim para o sort |
| Grupo A depois de grupo B | usuário (e V1.x LOOT) | sim para o sort |

Violação de restrição rígida do adapter na LoadOrder desejada é impossível por construção (INV-PLG-01): toda mudança passa pelo motor.

## 5. Ordenação

- **Ordenar agora** ("Sort now"): motor com todas as restrições, partindo da ordem atual (movimento mínimo). Gera Snapshot se mover mais de N itens.
- **Auto-sort** (setting, padrão ligado, paridade Vortex): roda o sort quando o inventário muda ou regras/grupos mudam.
- **Arrastar manualmente**: permitido quando o adapter declara load order manual permitida. Movimento que viola restrição é recusado com alternativas (mesma UX de core/05 §4). Com auto-sort ligado, arrastar é permitido apenas se respeitar as restrições; a nova posição vira preferência (a ordem atual é a entrada do próximo sort, então ela se mantém).
- Ciclo em regras/grupos: recusado na criação (D028); se vier de provedor, diagnóstico bloqueante do sort (a ordem atual se mantém).

## 6. Regras e grupos

- PluginRule: "P carrega depois de Q" (UI: "Depois de"). Editor de regras por plugin e editor geral (paridade UserlistEditor).
- PluginGroup: nome + grupos que devem vir antes. Grupo `default` sempre existe. Atribuir grupo a plugin pela tabela ou inspector. Editor de grupos em lista na V1 (grafo V1.x, depende de componente na lib).
- Regras e grupos pertencem à instância (D026).

## 7. Serialização e aplicação (D040)

- O adapter serializa a LoadOrder + PluginStates do profile **aplicado** no step `post` do deploy (core/04), e também quando só a load order muda (operação curta `apply_load_order`, que usa o mesmo lock e a mesma disciplina de evidência).
- Antes de escrever, compara o arquivo atual com a evidência da última escrita (hash). Diferente ⇒ ExternalChange `load_order` (core/09) com triagem: "Importar ordem externa para o profile" ou "Restaurar a ordem do profile".
- Backup da última versão do arquivo de load order escrito é mantido (ação "Restaurar load order anterior").
- Monitorar o arquivo enquanto o app está aberto (paridade com `deployWatcher`/pluginSync): mudança externa gera o diagnóstico imediatamente, sem sobrescrever.

## 8. Diagnósticos de plugins

`plugin_missing_master` (error), `plugin_master_order` (error; só pode acontecer com ordem externa importada), `plugin_limit_exceeded` (error; com contagem por tipo), `plugin_disabled_master` (warning: master existe mas está inativo), `plugin_header_unreadable` (warning), `plugin_rule_orphan` (warning), `load_order_external_change` (blocking do deploy até triagem), `plugin_from_losing_file` (info: dois mods fornecem o mesmo plugin, mostra qual vence).

## 9. Consultas para a UI

- Lista de plugins com: ativo, nome, origem, flags, índice de carregamento (formato do adapter, ex.: `0A`, `FE:003`), grupo, número de masters, problemas, mod de origem.
- Detalhe: cabeçalho, masters com estado (presente/ativo/ordem), regras, grupo, dependentes (quem tem este como master).
- Diff desejado × aplicado (para a tela Load Order).

## 10. Erros e eventos

Erros: `plugin_not_found`, `rule_would_create_cycle`, `order_violates_constraints`, `index_lock_conflict`, `load_order_file_locked`.
Eventos: `plugins.inventory_changed`, `plugin.enabled`, `plugin.disabled`, `loadorder.changed`, `loadorder.sorted`, `loadorder.applied`, `plugin_rule.*`, `plugin_group.*`.

## 11. Como ficou (F11)

Mecânica em D088; comportamentos não fixados aqui em D089 (proposta). Resumo: o adapter declara por `ports.PluginSupport`/`LoadOrderSupport`/`PluginArchives`; o motor é `domain/plugin` (`Sort`, `Settle`, `Place`, `Merge`) sobre `domain/ordering`; o serviço `application/plugins` mantém o arranjo persistido no profile, escreve o arquivo com hash pendente + evidência, guarda o substituído no BackupStore, faz a triagem (importar/restaurar) e vigia o arquivo a cada 2 s. Os diagnósticos de §8 ganharam `plugin_rule_cycle`, `plugin_lock_conflict` e `bsa_without_plugin` (core/10 §1.1). `load_order_external_change` não bloqueia o deploy, só a escrita (D089 item 1).

## 12. Critérios de aceite

- Habilitar mod com plugin: plugin aparece, entra ativo (setting padrão) e na posição correta pelas restrições.
- Plugin com master inexistente: erro no plugin e no Diagnostics.
- Editar `plugins.txt` fora do app: diagnóstico imediato; nenhum overwrite até triagem.
- Sort em ordem já válida não muda nada.
- Plugins, Load Order e ModOrder nunca aparecem misturados na mesma lista (INV-ORD-06).
