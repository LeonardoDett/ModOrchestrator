# Tela: Conflicts

Core: 05. Vortex: indicadores de conflito na tabela, notificação "Unsolved file conflicts", diálogo de conflitos por mod (select por mod oponente), diálogo "file overrides" (select por arquivo). MO2: aba Conflicts (Winning/Losing), aba Data.

## 1. Objetivo

Visão geral de **todos** os conflitos do profile ativo: quem vence quem, por quê, o que não foi revisado, e onde escolher vencedores por par ou por arquivo. Divergência aprovada 1: o Vortex não tem essa tela. Os diálogos por mod do Vortex também existem (`dialogos.md`).

## 2. Layout (prancha `JogoConflitos`, D127)

- Linha de cabeçalho de 72 px: "Conflitos", chips "N pares a decidir" (âmbar quando > 0) e "N decididos"; à direita "Limpar regras" (remove, após confirmar, as regras de par que o usuário criou; regras dos dados dos mods ficam) e "Usar sugestões em tudo" (prepara a sugestão de cada par a decidir sem trava, D126).
- Abaixo, de ponta a ponta: coluna de 320 px com "Buscar mod", "Ocultar resolvidos" e os mods com conflito em linhas de 56 px (nome, "contra N mods", contagem âmbar de pares a decidir); à direita, o mod escolhido: nome, "Disputa arquivos com N mods. Em cada linha, clique no mod que deve vencer.", a faixa "Para todos os N" ("X vence" / "Os outros vencem") e a tabela "Disputa com" / "Quem vence?" em linhas de 68 px com as duas opções de 44 px (a escolhida em verde com "vence"; "Sugerido" na sugestão). Par travado por regras através de outros mods aparece desabilitado com cadeado e "altere por lá" (B4). "N arquivos" abre a escolha por arquivo.
- Escolhas ficam preparadas até "Salvar" na barra de 60 px ao pé do painel, que diz quantas mudanças e o que a ordem vai mover (D004); "Descartar" desfaz.
- Faixa de aviso para intenções obsoletas (override ou ocultação que perdeu o sentido), com remover e reescolher.

## 3. Lista de pares

Colunas: vencedor, perdedor(es) (conflitos com 3+ mods aparecem como grupo: "B vence A, C"), nº de arquivos, como foi decidido (ordem / regra / override / misto / redundante), revisado. Agrupar por **Par** (padrão) ou por **Mod** (um mod e todos os oponentes, como a aba Conflicts do MO2). Busca por nome de mod ou caminho de arquivo.

## 4. Detalhe do par

- Frase-resumo e motivo, com prioridades.
- Ações de par: "B vence A" / "A vence B" (cria OrderRule; se exigir movimento na ordem, mostra a prévia; recusa se fechar ciclo, com o ciclo), "Remover regra" (se houver), "Marcar como revisado".
- Árvore de arquivos disputados (L5): por arquivo, **select de vencedor** (paridade com file overrides do Vortex) listando providers em ordem de prioridade; motivo; ação "Voltar ao padrão"; seleção múltipla/pasta para escolher vencedor em lote; "Comparar" (tamanho, data, hash iguais?).
- Arquivos redundantes aparecem apagados com ícone "igual".

## 5. Estados

- Sem conflitos: EmptyState "Nenhum conflito no profile ativo" (é bom sinal).
- Recalculando: skeleton na lista, sem bloquear.

## 6. Bridge

Consultas: `ConflictPairs(instance, profile, filtro, agrupamento)`, `ConflictPairDetail(a, b)`, `ConflictFiles(a, b, janela)`.
Comandos: `CreateOrderRule` (com `preview=true` para prévia), `RemoveOrderRule`, `SetFileOverride(s)`, `ClearFileOverride(s)`, `MarkConflictsReviewed`.

## 7. Critérios de aceite

- Em 3 cliques, escolher um vencedor diferente para um único arquivo.
- Criar "A vence B" mostra o impacto na ordem antes de confirmar.
- O motivo de cada vencedor é sempre visível (nunca "porque sim").
