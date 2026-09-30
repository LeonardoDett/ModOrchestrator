# MO2 — Referência de comportamento

Mod Organizer 2 (https://github.com/ModOrganizer2/modorganizer). Referência de **isolamento, prioridade e transparência de conflitos**. Não é referência de layout (D042: layout vem do Vortex).

## Conceitos e decisão

| Conceito MO2 | O que resolve | Decisão | Onde |
|---|---|---|---|
| Pasta por mod (`mods/<nome>`) | Isolamento total | ADOPT (pasta por ModID, INV-ID-03) | core/02 |
| VFS (usvfs) por injeção | Jogo nunca é tocado | REJECT (links reais) | 00-visao |
| Lista de prioridade (painel esquerdo), "mais abaixo vence" | Clareza de quem vence | ADOPT (ModOrder, D025) | core/05 |
| Separadores | Organizar listas grandes | ADOPT | core/05 §1 |
| Flags de conflito (+, −, ±, redundante) | Ver conflitos na lista | ADAPT (indicador com 5 estados) | core/05 §5.2 |
| Aba Conflicts do mod (Winning/Losing/Advanced) | Detalhe de conflitos | ADOPT (Inspector › Conflitos) | ui/telas/mods |
| Aba Data (árvore virtual com origem de cada arquivo) | "De onde vem este arquivo?" | ADAPT (busca por caminho em Conflicts; árvore no Inspector) | ui/telas/conflicts |
| Ocultar arquivo (`.mohidden`) | Remover arquivo sem editar o mod | ADAPT (FileExclusion, sem renomear) | core/05 §5.3 |
| Overwrite (arquivos gerados) | Capturar saídas de ferramentas | ADAPT (captura explícita, D046) | core/09 §5 |
| Profiles com ordem própria | Configurações independentes | ADOPT | core/07 |
| INIs e saves locais por profile | Isolar configurações | DEFER (V1.x) | core/07 §7 |
| Painel de plugins com ordem | Load order | ADOPT (separado de mods) | core/08 |
| Arquivos BSA como aba | Controle de archives | DEFER (V1.x) | core/12 |
| Executáveis configurados | Rodar ferramentas | DEFER (V1.x tools) | core/15 |
| Botão Problems | Checagens | ADAPT (Diagnostics) | core/10 |
| Notas e cores por mod | Organização pessoal | ADOPT | core/02 §9 |
| "Contains" (conteúdo) | Filtro por tipo de conteúdo | ADOPT (ContentFlags) | core/02 §9 |
| Instâncias portáteis/globais | Vários setups | ADAPT (múltiplas GameInstances) | core/11 |
| Backup de modlist/plugins | Voltar atrás | ADAPT (Snapshots + histórico) | core/07 §6 |
| Download tab / NXM | Downloads | DEFER (V2) | core/15 |

## Arquivos de uma instância MO2 (para importação V1.x)

`ModOrganizer.ini` (caminhos, jogo), `mods/<mod>/` (+ `meta.ini`), `profiles/<p>/modlist.txt` (ordem invertida: primeira linha = maior prioridade; `+` habilitado, `-` desabilitado, `*` fixo; separadores com sufixo `_separator`), `profiles/<p>/plugins.txt`, `profiles/<p>/loadorder.txt`, `overwrite/`.
