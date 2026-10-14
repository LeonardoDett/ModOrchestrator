# Tela: Load Order

Core: 08, 12. Vortex: página Load Order baseada em arquivo (`file_based_loadorder`: FileBasedLoadOrderPage, ItemRenderer com índice, lock, InfoPanel, FilterBox) e a ordenação da página Plugins. Aparece só com capability `load_order`.

## 1. Objetivo

Ver e ajustar a **ordem** de carregamento: por que cada plugin está onde está, o que o sort vai mudar, e se a ordem aplicada no jogo é a do profile. Divergência aprovada 2.

## 2. Layout (prancha `JogoOrdemDeCarga`, D127)

- Linha de cabeçalho de 76 px: "Ordem de carga" e o estado do arquivo do jogo em chip ("Diferente da aplicada no jogo · N diferenças" em âmbar com "Comparar"; "Ordem do perfil aplicada no jogo" em verde; "Alterada fora do app" em vermelho com "Revisar"); à direita "Mais ações" (restaurar a anterior, comparar, copiar lista, importar ordem), "Desfazer ordenação" e "Aplicar no jogo".
- Linha de 48 px: "Buscar plugin", "Mostrar plugins inativos" (desligado por padrão), a dica "Arraste para ajustar. Masters, regras e grupos são respeitados sozinhos."; à direita "Ordenação automática" e "Ordenar agora".
- Lista de arrastar em linhas de 44 px (alça, Índice, Plugin, Grupo, Regras, Trava) e, ao lado, o painel "Por que está aqui" (360 px): posição, índice e grupo; cada restrição em duas linhas (o quê e o tipo: master, regra, grupo); "Quem depende dele"; a nota de que um movimento que quebra restrição é recusado com a posição válida mais próxima; "Travar posição" e "Adicionar regra".

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
