# Modelo de domínio

Este documento lista entidades, atributos essenciais, relações e a quem pertencem. Comportamento detalhado fica no documento de cada módulo. Termos: `docs-ia/01-glossario.md`. Já implementado na F0/F1 parcial: `relpath`, `game` (Definition, Instance, Target, Location, Capability, DeploymentMethod), `mod` (Mod, Installation, File), `operation`, `event`.

Convenções: `?` = opcional; `[]` = lista; IDs são opacos (INV-ID-01); tempos em UTC.

## 1. Mapa de propriedade

```
GameDefinition (adapter, não persistido)
  └─ GameInstance ───────────────────────────────── conteúdo compartilhado (D026)
       ├─ Archive[]                       (ArchiveStore)
       ├─ Mod[] ── Installation (atual) ── File[]
       ├─ Category[] (árvore)
       ├─ OrderRule[], DependencyRule[], IncompatibilityRule[]
       ├─ FileOverride[], FileExclusion[], ConflictReview[]
       ├─ PluginRule[], PluginGroup[], PluginGroupAssignment[]
       ├─ DeploymentManifest (por target) + DeploymentJournal?
       └─ Profile[] ─────────────────────────────── seleção e posição (D026)
            ├─ ModEntry[]  (enabled por mod)
            ├─ ModOrder    (mods + separadores)
            ├─ PluginState[], LoadOrder, IndexLock[]
            ├─ LocalSettings? / SaveNamespace?   (capability, V1.x)
            └─ Snapshot[]
```

## 2. Entidades

### relpath.Path (implementado)
Caminho relativo normalizado. Comparação por `Key()` sem diferenciar maiúsculas; preserva a grafia original para exibição e escrita. INV-ID-02.

### GameDefinition (implementado em parte)
| Atributo | Tipo | Nota |
|---|---|---|
| id | GameID | estável, ex.: `skyrimse` |
| name | texto | |
| adapter | nome | adapter que o fornece |
| capabilities | Capability[] | core/11 |
| modTypes | ModTypeDef[] | core/11 |
| targets | TargetDef[] | targets que uma instância terá (id, como resolver caminho) |
| detection | regras de descoberta | por loja/registro/arquivo marcador |
| artwork? | referência | para Games/Overview |

### GameInstance (implementado em parte)
| Atributo | Tipo | Nota |
|---|---|---|
| id | InstanceID | |
| game | GameID | |
| adapter | nome | |
| displayName | texto | padrão = nome do jogo; editável (ex.: "Skyrim — teste") |
| root | caminho absoluto | pasta do jogo |
| targets | Target[] | id + caminho absoluto resolvido |
| staging | caminho absoluto | INV-LIB-03 |
| archiveStore | caminho absoluto | D032 |
| backupStore | caminho absoluto | por volume de target (D034) |
| preferredMethod | DeploymentMethod | efetivo pode variar por ModType |
| store? | steam/gog/epic/manual | origem da descoberta |
| gameVersion? | texto | lida pelo adapter; mudança gera diagnóstico |
| activeProfile | ProfileID | INV-ORD-01; guardado pelo repositório de profiles, não no struct da instância (D051) |
| hidden | bool | só afeta a tela Games |
| managedSince, lastUsedAt | tempo | |

### Archive
| Atributo | Tipo | Nota |
|---|---|---|
| id | ArchiveID | |
| instance | InstanceID | |
| originalName | texto | nome do arquivo importado |
| storedPath | caminho relativo ao ArchiveStore | vazio se não retido |
| kind | zip / 7z / rar / folder | |
| size, hash | número, texto | hash de conteúdo para duplicados |
| importedAt | tempo | |
| retained | bool | D032 |

### Mod (implementado em parte)
| Atributo | Tipo | Nota |
|---|---|---|
| id | ModID | nome de pasta na staging deriva dele (INV-ID-03) |
| instance | InstanceID | |
| state | imported / installing / installed / removed | core/02 |
| name | texto | detectado (FOMOD info.xml, nome do archive) |
| attributes | ModAttributes | nome customizado, versão, autor, descrição, notas, destaque, tags, URL de origem informativa |
| category? | CategoryID | |
| modType | ModTypeID | padrão do adapter; alterável |
| source | Source{kind, ref} | V1: `manual-file`; ref informativa |
| archive? | ArchiveID | |
| variantOf? | ModID | variantes compartilham "família" |
| variantLabel? | texto | |
| installation? | InstallationID | atual |
| content | ContentFlags[] | detectado pelo adapter: plugins, texturas, meshes, scripts, interface, sons, SKSE plugin, BSA... |
| createdAt, installedAt, updatedAt | tempo | |

Não existe `enabled` no Mod (anti-pattern 26).

### Installation (implementado)
id, mod, instance, installer, options (escolhas: para FOMOD, a seleção completa por step/grupo), files[] (`source` relativo à pasta do mod na staging, `dest` Location, size, hash?), createdAt. Reinstalar cria nova Installation (novo ID); a anterior é descartada após o sucesso (INV-LIB-01).

### Category
id, instance, name, parent?, order. Árvore editável. Categorias não afetam deploy.

### Profile
| Atributo | Tipo | Nota |
|---|---|---|
| id | ProfileID | |
| instance | InstanceID | |
| name | texto | único por instância |
| notes? | texto | |
| features | {localSaves, localSettings} | só com capability; V1.x |
| createdAt, lastActivatedAt | tempo | |

### ModEntry
profile, mod, enabled, enabledAt?. Existe para todo mod instalado (INV-ORD-02); criado desabilitado ou habilitado conforme setting "Habilitar mods ao instalar".

### ModOrder
profile, items[] em ordem: cada item é `mod(ModID)` ou `separator(SeparatorID)`. Separator: id, label, color?, collapsed (estado de UI persistido por conveniência). Prioridade de um mod = posição entre **mods** (separadores não contam), começando em 1.

### OrderRule
id, instance, before (ModReference), after (ModReference), source (`user` / `metadata` / futuro `collection`), createdAt, note?. Semântica: `before` fica antes de `after` na ModOrder, logo `after` vence `before`.

### DependencyRule
id, instance, mod (ModReference), requires (ModReference), kind (`requires` | `recommends`), source, note?.

### IncompatibilityRule
id, instance, a, b (ModReference), source, note?.

### ModReference
V1: `{modId}`. Contrato preparado para `{provider, providerModId, fileId?, versionRange?, logicalName?, hash?}` (resolução fuzzy do Vortex). Regras cujo alvo não resolve são **órfãs** (diagnóstico, INV-LIB-05).

### FileOverride
id, instance, location (Location), winner (ModID), createdAt. INV-CON-01/03.

### FileExclusion
id, instance, mod, location. O mod deixa de fornecer a Location em qualquer profile.

### ConflictReview
instance, pairKey (dois ModIDs ordenados), contestedHash (hash do conjunto de Locations em disputa no momento), reviewedAt. Se o conjunto mudar, a revisão deixa de valer.

### DeploymentManifest
Por instância e target: profile aplicado, method padrão, appliedAt, operationId, entries[]:
| Campo | Nota |
|---|---|
| location | |
| kind | `link` (hardlink/symlink/copy de arquivo de mod) / `backup` (original movido, D034) / `dir` (pasta criada pelo gerenciador) |
| mod? , sourcePath? | origem na staging |
| method | hardlink / symlink / copy |
| evidence | hardlink: identidade de arquivo (volume serial + file index); symlink: alvo; copy: size + mtime + hash |
| backupPath? | para `backup` |

### DeploymentJournal
instance, operationId, plan (ações por Location), progress (índice da última ação concluída + ações concluídas), startedAt. Existe apenas durante um deploy/purge (D035).

### ExternalChange (derivado) e ExternalDecision (persistido)
ExternalChange: location, kind (`missing` / `modified` / `replaced` / `unexpected` / `permission` / `load_order`), manifestEntry?, observed. ExternalDecision: location, decision, decidedAt, applied? (para decisões adiadas como "ignorar sempre").

### Plugin (derivado) e PluginState/LoadOrder (persistidos)
Plugin: name (chave, sem diferenciar maiúsculas), location, providerMod? (ou `base_game` / `unmanaged`), header (flags, masters[], description, author, version), implicit (master fixo do jogo).
PluginState: profile, pluginName, enabled.
LoadOrder: profile, entries[] (pluginName) em ordem; IndexLock: profile, pluginName, position.
PluginRule: instance, plugin, loadsAfter[] (e opcionalmente requires/incompatible do mesmo formato). PluginGroup: instance, name, after[] (grupos). PluginGroupAssignment: instance, pluginName, group.

### Snapshot
id, profile, reason (`before_bulk_enable`, `before_sort`, `manual`...), createdAt, payload (ModEntries + ModOrder + PluginStates + LoadOrder). Retenção configurável.

### Diagnostic (derivado)
key (checkId + subject), checkId, severity (`error` / `warning` / `info`), blocks[] (tipos de operação que o diagnóstico impede; só `error` pode bloquear; "bloqueante" na UI = `error` com `blocks` não vazio), subject (entidades relacionadas), params (para i18n), evidence[], impact, actions[] (ação = id de comando + parâmetros + destino de navegação), firstSeenAt (persistido para "novo desde"), suppressed? (derivado de Suppression persistida).

### Notification
id, kind (`diagnostic` / `operation_result` / `info`), ref (diagnostic key ou operationId), createdAt, readAt?, dismissedAt?.

### Operation / Event (implementados)
D019 / D020.

### Setting
scope (`app` / `instance` / `profile`), scopeId?, key, value. Catálogo e defaults em core/13.
