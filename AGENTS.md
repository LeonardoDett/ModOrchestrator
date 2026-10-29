# Instruções para agentes

A pasta `mod-orchestrator-spec-v2/` é uma **cópia de consulta** da especificação, atualizada pelo mantenedor de tempos em tempos. Não a leia por padrão nem a carregue inteira: abra só o documento ou a decisão que a tarefa citar ou de que você realmente precisar (ex.: `docs-ia/02-invariantes.md`, `core/04-deploy-purge.md`, uma decisão `Dxxx` em `docs-ia/decisoes.md`).

## Antes de implementar

Escreva um resumo curto: estados alterados e suas fontes de verdade; invariantes envolvidos (IDs); decisões que restringem a tarefa (IDs); o que está fora do escopo; escopo de jogo (D112): vale para todo jogo ou depende de uma capability, e o que acontece numa instância sem ela (adapter `generic`).

Se a tarefa não responde uma pergunta necessária, pare e pergunte. Não crie regra implícita no código. Decisão nova de contrato ou comportamento: descreva no relatório ou no pull request (contexto, escolha, alternativas).

## Skills de UI

`frontend/` e `dettmann-ui/` (dettmann-ui v2; D095, D107):
- `.claude/skills/dettmann-ui-use/SKILL.md` — construir ou alterar telas do `frontend/`.
- `.claude/skills/dettmann-ui-author/SKILL.md` — criar ou alterar componentes e a própria lib.
- `.claude/skills/dettmann-ui-improve/SKILL.md` — auditoria somente leitura, antes de concluir uma tela.

## Regras de código

- Camadas: `internal/core/domain` <- `internal/core/application` <- `internal/infrastructure` / `internal/adapters`. `internal/bridge` só transporta; `internal/bootstrap` só conecta. `go test ./internal` falha se a regra for violada.
- Todo recurso que não vale para qualquer jogo entra por capability do adapter e tem teste com o adapter `generic` (sem a capability). Fatos de um jogo (nomes, arquivos, extensões) só em `internal/adapters` (D112).
- Adapters importam só o SDK (`modorchestrator/sdk`); nome novo que um adapter precise entra no SDK como alias (D134). Módulo de recurso opcional entra no núcleo por pontos de contribuição, nunca por nome (D133).
- Nenhuma regra de negócio em componentes React; a UI relê estado do backend e trata eventos apenas como sinal.
- Toda UI usa `dettmann-ui`; não criar componentes paralelos. Todo texto de UI via i18n.
- Conflito ≠ regra; diagnóstico ≠ notificação ≠ histórico ≠ log; ModOrder ≠ LoadOrder.
- Nada toca o filesystem do jogo sem plano + journal; nada não gerenciado é apagado.
- Validação: `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `wails build`.
