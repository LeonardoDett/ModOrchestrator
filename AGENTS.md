# Instruções para agentes

Antes de qualquer alteração, aplique o protocolo em
`mod-orchestrator-spec-v2/prompts/00-protocolo.md`.

## Skills

Projeto (spec):
- `mod-orchestrator-spec-v2/skills/consult-ai-docs/SKILL.md` — antes de implementar.
- `mod-orchestrator-spec-v2/skills/maintain-ai-docs/SKILL.md` — ao mudar contrato/decisão.

UI (dettmann-ui), para qualquer trabalho em `frontend/`:
- `dettmann-ui-vnext/.cursor/skills/dettmann-ui/theme-first/SKILL.md`
- `dettmann-ui-vnext/.cursor/skills/dettmann-ui/composition/SKILL.md`
- `dettmann-ui-vnext/.cursor/skills/dettmann-ui/component-authoring/SKILL.md`
- `dettmann-ui-vnext/.cursor/skills/dettmann-ui/ui-review/SKILL.md` — antes de concluir uma tela.

## Regras de código

- Camadas: `internal/core/domain` <- `internal/core/application` <- `internal/infrastructure` / `internal/adapters`. `internal/bridge` só transporta; `internal/bootstrap` só conecta. `go test ./internal` falha se a regra for violada.
- Nenhuma regra de negócio em componentes React; a UI relê estado do backend e trata eventos apenas como sinal.
- Toda UI usa `dettmann-ui`; não criar componentes paralelos.
- Validação: `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `wails build`.
- Registrar decisões novas em `mod-orchestrator-spec-v2/docs-ia/decisoes.md`.
