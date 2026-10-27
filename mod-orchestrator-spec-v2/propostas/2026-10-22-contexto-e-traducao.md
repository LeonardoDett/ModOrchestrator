# Proposta: contexto das sessões, limpeza e tradução

Data: 2026-10-22. Aprovada pelo usuário em 2026-10-22 ("sim para todas").

## Andamento

- **T0 feito (2026-10-22):** apagados `.cursor/skills`, `dettmann-ui-v1/` e `_historico/`; `dettmann-ui/skills/` é a fonte única das skills (o instalador grava só em `.claude/skills`; `--cursor` para o Cursor); worktree `ModOrchestrator-lv2` e branch removidos.
- **Arquivamento adiado para T2:** propostas fechadas, `docs-ia/05`, `06`, `09` e `dettmann-ui/docs/plans|specs|prompts` são citados em `decisoes.md`, que LV5–LV10 estão editando; mover agora quebraria links. Mover junto com a divisão de `decisoes.md`, na mesma janela.
- **Lib feita (2026-10-27, D148):** `dettmann-ui-vnext/` virou `dettmann-ui/`; `docs/plans`, `docs/specs`, `prompts/` e `REFACTOR_REPORT.md` da lib apagados (citações dizem que estão no histórico do git). O resto da T2 continua pendente.
- **T1 feito (2026-10-22):** README e CONTRIBUTING em inglês.
- **Próximo:** T2 e T3 quando LV5–LV10 estiverem integradas e nenhuma fase estiver rodando.

Tokens estimados por bytes ÷ 3,5 (texto pt-BR com acentos); servem para comparar, não são exatos.

## 1. Quanto uma sessão lê antes de escrever código

| Item | Tamanho | Tokens (aprox.) | Quando entra |
|---|---|---|---|
| AGENTS.md + CLAUDE.md + MEMORY.md | 2,8 KB | ~0,8 mil | sempre, automático |
| Plugins e hooks do usuário (superpowers, lista de ~150 skills) | — | ~8 mil | sempre, fora do repositório |
| Base fixa do protocolo (README, visão, manifesto, glossário, invariantes, fontes de verdade, anti-patterns, plano inteiro, 01-fases, protocolo, skill consult-ai-docs) | 77,6 KB | ~22 mil | toda tarefa |
| `docs-ia/decisoes.md` | 244 KB, 1.515 linhas, 146 decisões | **~70 mil** | toda tarefa ("só as vigentes", mas 134 de 146 são vigentes: o filtro não economiza nada) |
| Documentos da fase (2 a 5 de `core/` e `ui/`) | 30 a 60 KB | 10 a 17 mil | toda tarefa |
| Skills dettmann-ui (use + improve, às vezes author) | 27 a 39 KB | 8 a 11 mil | tarefa de tela |

**Total antes da primeira linha de código: ~105 mil tokens no backend, ~120 mil numa tela.** Dois terços disso é `decisoes.md`.

Outros pontos que pesam:
- Protocolo, `consult-ai-docs` e `AGENTS.md` repetem as mesmas regras (camadas, D112, dettmann-ui, validação) em três lugares.
- `plano-de-desenvolvimento.md` (20 KB) é lido inteiro, mas F0 a F15 já estão concluídas; só interessa a seção da fase atual.
- As 12 maiores decisões (D145, D088, D078, D146, D142…) têm 4 a 6,6 KB cada, porque carregam detalhe de implementação que já está nos documentos `core/`.
- `decisoes.md` é editado por quase toda fase (18 commits em 7 dias) e causa renumeração em rebase (ex.: "decisão renumerada para D143 após rebase sobre LV1 e LV3").

## 2. O que existe e o que fazer

| Item | Tamanho | Situação | Proposta |
|---|---|---|---|
| `docs-ia/decisoes.md` | 244 KB | arquivo único, lido inteiro | **Dividir**: `decisoes/README.md` com índice (ID, título, status, 1 linha, documentos) de ~6 mil tokens + um arquivo por decisão (`decisoes/D146.md`). A sessão lê o índice e só as decisões citadas. Isso também acaba com a colisão entre fases paralelas: cada decisão nova é um arquivo novo. |
| Protocolo + consult-ai-docs + AGENTS.md | 7,3 KB | três textos com o mesmo conteúdo | **Unificar** num protocolo só (~1,5 mil tokens); AGENTS.md vira ponteiro; base fixa passa a ser manifesto, invariantes, anti-patterns, glossário e a seção da fase. README e visão só quando a dúvida for de escopo. |
| `plano-de-desenvolvimento.md` | 20 KB | fases concluídas misturadas com a atual | **Resumir** F0 a F15 em uma tabela e mover o detalhe para o arquivo morto. |
| `_historico/` | 60 KB, 41 arquivos | já marcado como "não é autoridade" | **Arquivar fora do repositório** (o git guarda a história) ou manter, mas fora da tradução. |
| `propostas/` | 133 KB, 8 arquivos | 6 já viraram decisões ou fases fechadas | **Arquivar** as fechadas em `propostas/arquivo/`. As duas que LV5–LV10 estão editando agora (`plano-lacunas-mo2-vortex`, `trabalho-futuro-f14`) ficam onde estão. |
| `docs-ia/05` a `09` (histórico, revisão, relatório F14, paridade Vortex, proposta multi-jogo) | 65 KB | relatórios de momento, não regras | **Arquivar** 05, 06 e 09; manter 07 e 08 enquanto LV usar. |
| `dettmann-ui/docs/plans/` e `specs/` | 250 KB dos 323 KB | planos das ondas 1–4, todas fechadas | **Arquivar**. Ficam `decisions.md`, `architecture.md`, `theme-system.md`, `component-matrix.md`, `migration.md`. |
| `.cursor/skills/` | 39 KB | cópia velha das skills (dettmann-ui-use desatualizada) | **Apagar**, ou trocar por um aviso apontando para `.claude/skills/`. |
| `dettmann-ui/skills/` | 41 KB | `dettmann-ui-use` difere de `.claude/skills/` (14.953 × 15.372 bytes) | **Escolher uma fonte** (`.claude/skills/`) e gerar a outra por script, ou apagar a cópia. |
| `dettmann-ui-v1/` | 950 KB, 858 arquivos | app não consome mais (AGENTS.md) | **Apagar antes da publicação**; o git guarda. |
| `dettmann-ui/prompts/` | 5 KB | prompts de migração já feitos | **Arquivar**. |
| `IconesAnimados/` | — | já apagada (registro em decisoes.md, linha 955); sobra só `specs/referencia-icones-animados.md` | nada a fazer além de arquivar o spec junto com os demais. |
| Worktree `../ModOrchestrator-lv2` | branch `claude/project-thread-s5kb6p` | LV2 já entrou no master por squash (c37acd8) | **Remover o worktree e a branch**. O worktree `lv10wt` no scratchpad é de uma fase ativa: não mexer. |
| `../ModOrchestrator-lv2-captura*.png` | 2 imagens | capturas soltas fora do repositório | **Apagar**. |
| Memória do projeto | 8 arquivos, 7,8 KB | enxuta | Juntar `redesenho-dettmann-ui-v2` (ondas fechadas) com `seguir-o-design`; atualizar `publicacao-adiada` com o plano de tradução. |
| `.claude/settings.local.json`, `launch.json` | 5 KB | em uso | manter. |
| Plugins do usuário | ~8 mil tokens por sessão | legal, figma, product-management, verification-foundation etc. não servem a este projeto | **Opcional**: desativar os que não usa; só você pode mudar. |

### Pasta compartilhada do projeto (Biblioteca)

30 arquivos. Quase tudo é cópia do que já está no repositório, várias com timestamp:

- `09-proposta-multi-jogo-e-extensoes` (3 versões), `2026-10-13-registro-de-jogos` (3), `2026-10-14-plano-implementacao-redesign` (3), `07-relatorio-f14` (2): **~290 KB redundantes**; a versão vigente está no git.
- Planos da lib (`2026-10-09-v2-components-design`, `wave1`, `catalog-growth`, `redesign-components`) e `levantamento/*`: também já no repositório.
- `resumo-conversas`, `indice-chats`, `revisao-decisoes-proposta` (8 de outubro): superados.
- Screenshots `onda1` a `onda4` e dois `mcp-Claude_Browser-blob`: registro das ondas fechadas.

Proposta: apagar as cópias com timestamp e as que estão no git; manter só as screenshots, se quiser o registro. Os agentes não apagam arquivos da Biblioteca; o usuário apaga pelo app.

## 3. Efeito esperado

| | Hoje | Depois |
|---|---|---|
| Leitura obrigatória (backend) | ~105 mil tokens | ~30 a 35 mil |
| Leitura obrigatória (tela) | ~120 mil | ~40 a 45 mil |
| Texto vivo da spec a traduzir | ~880 KB | ~450 KB (o resto vai para o arquivo morto, que não é traduzido) |

## 4. Plano de tradução para inglês

Estado atual:
- Código: ~93% dos comentários Go já em inglês (619 de 8.373 linhas em pt), TS do app 93 de 838, `dettmann-ui/src` 319 linhas em pt. Mensagens de erro já em inglês.
- UI: i18n com `en.ts` e `pt-BR.ts`.
- Público: CHANGELOG e `docs/getting-started.md` já em inglês (com `primeiros-passos.md`); README e CONTRIBUTING em pt.
- Lib: docs em inglês, skills em pt.
- Spec: toda em pt.

Política proposta: tudo que vai para o repositório público em inglês; conversa com você, status e commits continuam em pt-BR (commits podem seguir em pt até a V1.0 se preferir). Guia do usuário bilíngue, como já está.

| Fase | O que | Volume | Colide com LV5–LV10? |
|---|---|---|---|
| T0 | Limpeza sem colisão: `.cursor/skills`, worktree LV2, PNGs, arquivar `_historico`, propostas fechadas, plans/specs da lib, prompts da lib | — | não (nenhuma fase toca esses arquivos) |
| T1 | Público: README, CONTRIBUTING, templates de `.github/` | ~18 KB | não |
| T2 | Reestruturação: dividir `decisoes.md`, unificar protocolo, resumir o plano | — | **sim**: só depois que LV5–LV10 forem integradas, numa janela sem fase rodando |
| T3 | Base da spec: protocolo, manifesto, glossário, invariantes, fontes de verdade, anti-patterns, AGENTS.md, skills (consult/maintain e dettmann-ui) | ~60 KB | sim, mesma janela de T2 |
| T4 | `core/` e `ui/` | ~260 KB | por pasta, só arquivos que nenhuma fase ativa esteja editando; uma sessão por pasta |
| T5 | Decisões: índice primeiro; corpos das vigentes em lotes de ~30; substituídas ficam em pt no arquivo morto | ~150 KB após enxugar | depois de T2; cada decisão é um arquivo, então dá para paralelizar |
| T6 | Comentários restantes em pt (Go, TS, lib) | ~1.000 linhas | sim, fazer num congelamento de código curto |

Regras para a tradução não quebrar nada: glossário traduzido primeiro e usado como tabela de termos (ModOrder, LoadOrder, DeploymentManifest já são nomes em inglês); IDs (D-xxx, invariantes, DLG-xx) não mudam; nomes de arquivo passam para inglês só em T2, junto com a atualização de todos os links (um script confere links quebrados); nenhuma mudança de conteúdo misturada com tradução no mesmo commit.
