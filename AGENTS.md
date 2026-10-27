# Instruções para agentes

Antes de qualquer alteração, aplique o protocolo em
`mod-orchestrator-spec-v2/prompts/00-protocolo.md`.

## Skills

Projeto (spec):
- `mod-orchestrator-spec-v2/skills/consult-ai-docs/SKILL.md` — antes de implementar.
- `mod-orchestrator-spec-v2/skills/maintain-ai-docs/SKILL.md` — ao mudar contrato/decisão.

UI (`frontend/` e `dettmann-ui/`, dettmann-ui v2; D095, D107):
- `.claude/skills/dettmann-ui-use/SKILL.md` — construir ou alterar telas do `frontend/`.
- `.claude/skills/dettmann-ui-author/SKILL.md` — criar ou alterar componentes e a própria lib.
- `.claude/skills/dettmann-ui-improve/SKILL.md` — auditoria somente leitura, antes de concluir uma tela.


## Regras de código

- Camadas: `internal/core/domain` <- `internal/core/application` <- `internal/infrastructure` / `internal/adapters`. `internal/bridge` só transporta; `internal/bootstrap` só conecta. `go test ./internal` falha se a regra for violada.
- Todo recurso que não vale para qualquer jogo entra por capability do adapter e tem teste com o adapter `generic` (sem a capability). Fatos de um jogo (nomes, arquivos, extensões) só em `internal/adapters` (D112).
- Adapters importam só o SDK (`modorchestrator/sdk`); nome novo que um adapter precise entra no SDK como alias (D134). Módulo de recurso opcional entra no núcleo por pontos de contribuição, nunca por nome (D133).
- Nenhuma regra de negócio em componentes React; a UI relê estado do backend e trata eventos apenas como sinal.
- Toda UI usa `dettmann-ui`; não criar componentes paralelos.
- Validação: `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `wails build`.
- Registrar decisões novas em `mod-orchestrator-spec-v2/docs-ia/decisoes.md`.
