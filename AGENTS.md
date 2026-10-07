# Instruções para agentes

Antes de qualquer alteração, aplique o protocolo em
`mod-orchestrator-spec-v2/prompts/00-protocolo.md`.

## Skills

Projeto (spec):
- `mod-orchestrator-spec-v2/skills/consult-ai-docs/SKILL.md` — antes de implementar.
- `mod-orchestrator-spec-v2/skills/maintain-ai-docs/SKILL.md` — ao mudar contrato/decisão.

UI (dettmann-ui v2), para qualquer trabalho em `frontend/`:
- `.claude/skills/dettmann-ui-use/SKILL.md` — construir ou alterar telas.
- `.claude/skills/dettmann-ui-author/SKILL.md` — criar ou alterar componentes e a própria lib.
- `.claude/skills/dettmann-ui-improve/SKILL.md` — auditoria somente leitura, antes de concluir uma tela.

O `frontend/` usa `dettmann-ui-v1` até o subprojeto 4 (migração para a v2); as skills acima descrevem a v2.

## Regras de código

- Camadas: `internal/core/domain` <- `internal/core/application` <- `internal/infrastructure` / `internal/adapters`. `internal/bridge` só transporta; `internal/bootstrap` só conecta. `go test ./internal` falha se a regra for violada.
- Nenhuma regra de negócio em componentes React; a UI relê estado do backend e trata eventos apenas como sinal.
- Toda UI usa `dettmann-ui`; não criar componentes paralelos.
- Validação: `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `wails build`.
- Registrar decisões novas em `mod-orchestrator-spec-v2/docs-ia/decisoes.md`.
