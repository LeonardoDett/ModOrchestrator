# Tela: Plugins

Core: 08, 12. Vortex: página Plugins do Gamebryo (`PluginList`, `PluginFlags`, `PluginFlagsFilter`, `PluginStatusFilter`, `MasterList`, `GroupEditor`, `UserlistEditor`, `LockIndex`, autosort, "Sort now"). Aparece só com capability `plugins`.

## 1. Objetivo

Inventário e estado dos plugins do profile ativo: quais existem, de onde vêm, quais estão ativos, quais têm problema e por quê. A **ordem** é trabalhada na tela Load Order (divergência 2); aqui a ordem aparece só como coluna informativa (índice).

## 2. Layout

```
Toolbar: [Ordenar agora] [Auto-sort: ● ligado] | [Regras] [Grupos] | [Ativar todos] [Desativar todos] | [Abrir ▾]
Resumo: 312 plugins · 287 ativos · Completos 198/254 · Light 89/4096 · 2 com erro
FilterBar: [busca] [Status: Ativo|Inativo] [Flags: Master|Light|Nenhuma] [Origem: Mod|Jogo base|Não gerenciado] [Problemas]
DataTable ─────────────────────────────────────────────────────────── │ INSPECTOR
 ● Índice  Plugin               Flags   Grupo     Mod de origem   ⚠   │
 ● 00      Skyrim.esm           M 🔒    (fixo)    Jogo base            │
 ● 1A      SomeMod.esp          —       default   Some Mod        1    │
 ● FE:003  Tiny.esl             M L     default   Tiny Mod             │
```

## 3. Colunas

| Coluna | Conteúdo |
|---|---|
| Status | toggle ativo; implícitos travados ligados |
| Índice | formato do adapter (`1A`, `FE:003`); vazio se inativo |
| Plugin | nome + ícone de tipo |
| Flags | Master, Light, (outras do adapter), Travado (IndexLock), Implícito |
| Grupo | select inline |
| Mod de origem | link que seleciona o mod na tela Mods |
| Problemas | contagem; tooltip com o principal |
| Masters | contagem (oculta por padrão) |
| Autor, Versão, Descrição | ocultas por padrão |

Ordenação padrão: pela load order (índice); outras colunas ordenáveis.

## 4. Inspector

Descrição, autor, versão, arquivo (caminho), origem; **Masters** (lista com estado: presente, ativo, antes deste; ações "Ativar", "Mostrar mod"); **Dependentes** (quem usa este como master); **Regras** ("carrega depois de": adicionar/remover); **Grupo**; **Posição** (índice, travar/destravar); problemas com ações.

## 5. Multi-seleção

Ativar · Desativar · Definir grupo… · Travar posição / Destravar.

## 6. Diálogos

- **Regras de plugins** (paridade UserlistEditor): todas as regras da instância, por plugin, com origem.
- **Grupos** (paridade GroupEditor, em lista na V1): grupos, "depois de", plugins atribuídos; recusa de ciclo mostrada inline.

## 7. Estados

- Jogo sem capability: item não existe na sidebar.
- Nenhum plugin além dos implícitos: EmptyState explicando que plugins vêm de mods habilitados.
- Arquivo de load order alterado fora: faixa `load_order_external_change` no topo com "Revisar".

## 8. Bridge

Consultas: `PluginList(instance, profile, filtros)`, `PluginDetails(name)`, `PluginRules`, `PluginGroups`.
Comandos: `SetPluginsEnabled`, `SortPlugins`, `SetAutoSort`, `SetPluginGroup`, `CreatePluginRule`/`RemovePluginRule`, `CreateGroup`/`UpdateGroup`/`DeleteGroup`, `SetIndexLock`.

## 9. Critérios de aceite

- Plugin com master faltando é identificável sem abrir nada (ícone + contagem) e resolvível pelo Inspector.
- Contadores de limite sempre visíveis e corretos.
- Clicar no mod de origem leva à linha do mod.
