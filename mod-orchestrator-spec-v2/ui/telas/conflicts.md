# Tela: Conflicts

Core: 05. Vortex: indicadores de conflito na tabela, notificação "Unsolved file conflicts", diálogo de conflitos por mod (select por mod oponente), diálogo "file overrides" (select por arquivo). MO2: aba Conflicts (Winning/Losing), aba Data.

## 1. Objetivo

Visão geral de **todos** os conflitos do profile ativo: quem vence quem, por quê, o que não foi revisado, e onde escolher vencedores por par ou por arquivo. Divergência aprovada 1: o Vortex não tem essa tela. Os diálogos por mod do Vortex também existem (`dialogos.md`).

## 2. Layout (split view)

```
Toolbar: [Marcar selecionados como revisados] [Mostrar conflitos de mods desabilitados ☐] [Recalcular]
Resumo: 38 pares em conflito · 12 não revisados · 4 com override · 9 redundantes   [Filtro: Todos|Não revisados|Por regra|Por ordem|Override|Redundante]
┌──────────────────────────────┬──────────────────────────────────────────────────────┐
│ PARES (DataTable)            │ DETALHE DO PAR                                       │
│ Vencedor ▸ Perdedor  Arquivos│ "Mod B vence Mod A em 34 de 40 arquivos"             │
│ B ▸ A        40   ● não rev. │  Decidido por: ordem (B #120 > A #45)                │
│ C ▸ A        12   regra      │  [B vence A (criar regra)] [A vence B (criar regra)] │
│ ...                          │  [Marcar como revisado]                              │
│                              │ ─ Arquivos ────────────────────────────────────────  │
│ Agrupar: [Par | Mod]         │  Tree: pasta/arquivo   Vencedor [select]  Motivo     │
│                              │   meshes/armor/…       [B ▾]              ordem      │
│                              │   textures/x.dds       [A ▾]              override   │
└──────────────────────────────┴──────────────────────────────────────────────────────┘
```

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
