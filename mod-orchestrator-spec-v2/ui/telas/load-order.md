# Tela: Load Order

Core: 08, 12. Vortex: página Load Order baseada em arquivo (`file_based_loadorder`: FileBasedLoadOrderPage, ItemRenderer com índice, lock, InfoPanel, FilterBox) e a ordenação da página Plugins. Aparece só com capability `load_order`.

## 1. Objetivo

Ver e ajustar a **ordem** de carregamento: por que cada plugin está onde está, o que o sort vai mudar, e se a ordem aplicada no jogo é a do profile. Divergência aprovada 2.

## 2. Layout

```
Toolbar: [Ordenar agora] [Auto-sort ●] | [Desfazer última ordenação] [Restaurar load order anterior] | [Comparar com aplicada] [Exportar ▾]
Estado: "Ordem do profile aplicada no jogo" ✓   |   "Diferente da aplicada (12 movimentos)" [Aplicar]
Info: "Arraste para ajustar. Restrições (masters, regras, grupos) são respeitadas automaticamente."
┌───────────────────────────────────────────────────────────┬────────────────────┐
│ ReorderableList (L2)                                      │ INSPECTOR          │
│  #   Índice  Plugin              Grupo      🔒  ↳ regras   │ Por que está aqui: │
│  1   00      Skyrim.esm          fixo       🔒             │ - depois de X (master)
│  …                                                         │ - grupo "Patches"  │
│  48  2F      Patch.esp           Patches        ↳ 2        │ - regra do usuário │
└───────────────────────────────────────────────────────────┴────────────────────┘
```

## 3. Comportamento

- Lista com todos os plugins (ativos com índice; inativos visíveis mas esmaecidos, filtráveis).
- Arrastar: permitido se o adapter permite ordem manual; movimento que viola restrição é recusado com a explicação e alternativas (mesma UX da ModOrder, F-04).
- "Ordenar agora": prévia em modal quando mover mais de N itens (lista de movimentos com motivo), confirmar aplica; senão aplica direto com toast "7 plugins movidos" + Desfazer.
- "Comparar com aplicada": DiffViewer entre desejada e aplicada (arquivo do jogo).
- Inspector mostra **por que** o plugin está na posição: restrições que o prendem (masters, grupo, regras, lock) e o que depende dele.
- Travar posição (IndexLock) pelo Inspector ou ícone.
- Exportar: copiar lista em texto; importar ordem (texto/`plugins.txt` externo) é ação "Importar ordem…" que passa pelo motor e mostra movimentos.

## 4. Estados

- Ciclo vindo de provedor: faixa bloqueante com participantes; arrastar e sort desabilitados.
- Alteração externa do `plugins.txt`: faixa com "Revisar" (diálogo de Alterações externas, tipo load_order).

## 5. Bridge

Consultas: `LoadOrderView(profile)` (com índice, grupo, restrições resumidas), `LoadOrderExplain(plugin)`, `LoadOrderDiffApplied(profile)`, `SortPreview(profile)`.
Comandos: `MovePlugins` (com recusa + alternativas), `SortPlugins`, `SetIndexLock`, `ApplyLoadOrder`, `RestorePreviousLoadOrder`, `ImportLoadOrder`.

## 6. Critérios de aceite

- Para qualquer plugin, o usuário descobre por que ele está naquela posição sem sair da tela.
- Sort sobre ordem válida não muda nada (e diz isso).
- Nenhuma ação desta tela aparece na tela Mods e vice-versa (INV-ORD-06).
