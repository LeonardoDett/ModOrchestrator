# Ordem de mods, regras e conflitos

Referências: D004, D005, D006, D025–D029; INV-ORD-*, INV-CON-*. Vortex: `mod_management/util/sort.ts`, `mod-dependency-manager` (regras, editor de conflitos, "file overrides", diálogo de ciclo), `mod-highlight`. MO2: lista de prioridade, separadores, flags de conflito (+, −, ±, redundante), aba Conflicts (Winning/Losing), ocultar arquivos.

## 1. Ordem de mods (ModOrder)

- Cada profile tem uma ModOrder com **todos** os mods instalados da instância e os separadores (INV-ORD-02).
- Prioridade = posição entre mods (1 = menor). Maior prioridade vence conflito de arquivo.
- Mods desabilitados mantêm posição (habilitar de novo não "pula" para o fim).
- Separadores: criar, renomear, colorir, mover, recolher, excluir (mods dentro ficam no lugar). Mover um separador move o bloco inteiro até o próximo separador (comportamento MO2).

## 2. Regras entre mods

| Regra | Armazenada como | UI | Efeito |
|---|---|---|---|
| B vence A | `OrderRule{before: A, after: B}` | "B vence A" / "A perde para B" | Restrição de ordem: prioridade(A) < prioridade(B). |
| A requer B | `DependencyRule{requires}` | "Requer" | Diagnóstico se B ausente/desabilitado (core/06). Não impõe ordem. |
| A recomenda B | `DependencyRule{recommends}` | "Recomenda" | Diagnóstico informativo. |
| A incompatível com B | `IncompatibilityRule` | "Incompatível" | Diagnóstico bloqueante se ambos habilitados. |

Regras pertencem à instância (D026) e valem para todos os profiles. Regras com `source=metadata` (FOMOD requirements aceitos, futuros metadados de provider) são exibidas com essa origem e podem ser desativadas (não apagadas) pelo usuário.

Regras de ordem valem **mesmo com um dos lados desabilitado**, para que habilitá-lo não quebre a ordem.

## 3. Motor de ordenação (D029)

Domínio puro, compartilhado com plugins (core/08).

Entrada:
- itens na ordem atual;
- arestas rígidas "X antes de Y" (OrderRules; para plugins, também restrições do adapter);
- itens travados em posição (plugins: IndexLock; mods: não usado na V1);
- grupos opcionais com ordem entre grupos (plugins).

Saída:
- nova ordem válida;
- lista de movimentos (`item`, `de`, `para`, `motivo`: regra/restrição que causou);
- ou ciclo: lista de itens e arestas participantes.

Algoritmo (implementado, D050):
1. Ordenação topológica **estável** em dois candidatos: "para frente" (empurra para baixo o item que precisa esperar) e "para trás" (puxa para cima o item que precisa vir antes). Entre itens sem restrição mútua, ambos preservam a ordem atual.
2. Deslocamento mínimo: vence o candidato que move menos itens (complemento da maior subsequência comum com a ordem atual); empate → "para frente" (determinismo, INV-ORD-05).
3. Separadores (mods) entram como itens sem restrições: ficam no lugar, e um mod só sai do bloco quando uma regra obriga. O movimento é explicado pelas regras violadas ("saiu de 'Texturas' por causa da regra ...").
4. Locks (plugins) são aplicados sobre o resultado e revalidados; conflito entre lock e restrição é erro, nunca correção silenciosa.

Propriedades testáveis:
- se a ordem atual já é válida, a saída é idêntica (nenhum movimento);
- saída sempre satisfaz todas as arestas, ou retorna ciclo sem alterar nada;
- mesma entrada ⇒ mesma saída.

## 4. Ações do usuário na ordem

| Ação | Comportamento |
|---|---|
| Arrastar mod(s) para posição P | Se a posição viola regra: recusa com a lista de regras violadas e oferece (a) "Mover para a posição válida mais próxima" (P' calculado pelo motor), (b) "Mover e remover a(s) regra(s)". |
| "Enviar para o topo/fundo", "Mover para posição…" | Mesmo tratamento. |
| Criar regra "B vence A" | Se fecharia ciclo: recusa mostrando o ciclo (INV-ORD-04). Senão aplica o motor em **todos** os profiles; se algum profile precisar de movimento, o diálogo mostra a prévia por profile antes de confirmar. |
| Remover regra | Nunca move nada. |
| Instalar mod | Entra no fim (core/02 §8) e o motor roda. |

Toda mudança de ordem gera Snapshot automático se mover mais de 20 itens (setting), e HistoryEntry reversível.

## 5. Conflitos de arquivo

### 5.1 Cálculo (INV-CON-04, derivado)
Para o profile em questão:
1. Providers de cada Location = mods **habilitados** cuja Installation fornece a Location, menos FileExclusions.
2. Conflito = Location com ≥ 2 providers.
3. Vencedor (INV-CON-01): FileOverride válido (mod habilitado e provider) › maior prioridade.
4. Resolução: `override` se veio de override; senão `rule` se existe OrderRule direta ou transitiva entre o vencedor e cada perdedor; senão `order`.
5. Redundante: todos os providers com mesmo tamanho **e** mesmo hash (hash sob demanda, com cache por arquivo da staging). Conflito redundante é mostrado apagado e não conta como "não revisado".

Conflitos entre mods desabilitados não são mostrados por padrão, mas a consulta "conflitos potenciais" (incluindo desabilitados) existe para a tela Conflicts com filtro.

### 5.2 Agregações (consultas)
- **Por par** (A, B): Locations disputadas, quantas cada um vence, como foi decidido, revisado ou não.
- **Por mod** (visão MO2): "Vence" (Locations em que ganha de alguém), "Perde" (em que perde), "Sem conflito", "Redundante"; e o indicador resumido para a tabela: `nenhum`, `vence tudo`, `perde tudo`, `misto`, `totalmente sobrescrito` (todos os arquivos perdem: mod inútil na configuração atual, alerta), `só redundante`.
- **Por arquivo**: providers em ordem de prioridade, vencedor, motivo.

### 5.3 Overrides e exclusões
- **Escolher vencedor de um arquivo** cria/atualiza FileOverride. "Voltar ao padrão" remove.
- **Escolher vencedor em lote**: selecionar vários arquivos (ou uma pasta) de um par e escolher; cria um override por Location (sem wildcard na V1; a UI agrupa por pasta).
- **Ocultar arquivo do mod** cria FileExclusion. Útil para remover um arquivo problemático sem editar o mod (MO2 "hide").
- Override/exclusão órfãos ou obsoletos: diagnóstico `override_stale` com ações remover/reescolher.

### 5.4 Revisão (D027)
- Um par está "não revisado" se tem Locations em disputa e não há ConflictReview válida para o conjunto atual.
- "Marcar como revisado" é uma ação explícita por par (ou em lote); também acontece automaticamente quando o usuário cria regra/override naquele par.
- Diagnóstico `conflicts_unreviewed` (info) com contagem de pares, desligável por setting.

## 6. Ciclos

Só podem existir por regras de metadados (D028). Quando existem:
- diagnóstico **bloqueante** `rule_cycle` com participantes e regras;
- a ModOrder não é alterada (fica na última ordem válida);
- deploy bloqueado (precondição global);
- ação: abrir "Resolver ciclo" (lista das regras do ciclo com botão desativar em cada uma; visualização em grafo é V1.x).

## 7. Erros

`order_violates_rules`, `rule_would_create_cycle` (param `cycle`), `rule_duplicate`, `rule_self_reference`, `rule_not_removable`, `rule_not_found`, `separator_not_found`, `order_history_stale`, `order_nothing_to_undo`, `override_not_provider`, `mod_not_found` (D069, D070).

## 8. Eventos

`order.changed` (ordem antes/depois, motivo e itens movidos, D070), `rule.created`, `rule.removed`, `rule.disabled`, `rule.enabled`, `override.set`, `override.cleared`, `exclusion.set`, `exclusion.cleared`, `conflict.reviewed`, `separator.changed`.

## 9. Critérios de aceite

- Criar "B vence A" com B abaixo de A: nada se move.
- Criar "B vence A" com B acima de A: só B se move (para logo abaixo de A) ou A sobe, o que deslocar menos; o motivo aparece no histórico.
- Criar regra que fecharia ciclo: recusada mostrando A → B → C → A.
- Arrastar mod para posição inválida: recusado com alternativas; nenhuma mudança parcial.
- Override em arquivo: só aquela Location muda de vencedor; indicador do mod mostra "misto".
- Dois mods com arquivo idêntico: conflito marcado redundante.
- 200.000 Locations e 1.000 mods: recálculo após habilitar um mod dentro da meta de `00-visao-e-escopo.md`.
