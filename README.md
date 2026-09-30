# Mod Orchestrator

Gerenciador de mods desktop (Go + Wails v2 + React). A especificação vive em
`mod-orchestrator-spec-v2/` e o design
system em `dettmann-ui-vnext/`, ambas versionadas neste repositório (o build da lib, `node_modules/` e `dist/`, não é versionado; ver D052).

Fase atual: **F0 — bootstrap** (estrutura, persistência, Operation/Event, shell vazio).

## Estrutura

```
main.go                      entrypoint Wails
internal/
  core/domain/               entidades e invariantes puras (operation, event)
  core/application/          casos de uso + ports (operations)
  infrastructure/            sqlite, eventbus, system (clock/ids), appdata
  bridge/                    transporte UI <-> core (DTOs, bindings, eventos)
  bootstrap/                 composition root
  architecture_test.go       garante a regra de dependência entre camadas
frontend/
  src/bridge/                cliente tipado do backend (Wails ou offline)
  src/shell/                 sidebar, topbar, navegação
  src/pages/                 telas
  wailsjs/                   bindings gerados pelo Wails (não editar)
```

Decisões estruturais: `mod-orchestrator-spec-v2/docs-ia/decisoes.md` (D017–D023).

## Desenvolvimento

Pré-requisitos: Go 1.27+, Node 24+, Wails CLI v2, WebView2 (Windows).

1. Compilar a dettmann-ui (uma vez, e a cada mudança nela):

   ```bash
   cd dettmann-ui-vnext && npm install && npm run build
   ```

   Enquanto o typecheck da biblioteca estiver quebrado, `npm run build` gera JS/CSS
   mas falha na etapa de `.d.ts`. Gere os tipos à parte:

   ```bash
   cd dettmann-ui-vnext && npx tsc -p . --noEmit false --declaration --emitDeclarationOnly --declarationMap false --outDir dist
   ```

   (o comando reporta os erros de tipo da lib, mas emite os `.d.ts`).

2. Rodar o app em modo dev:

   ```bash
   wails dev
   ```

3. Testes e build:

   ```bash
   go vet ./... && go test ./...
   ```

   ```bash
   npm --prefix frontend run typecheck && npm --prefix frontend test
   ```

   ```bash
   wails build
   ```

Dados da aplicação: `%APPDATA%\ModOrchestrator\state.db`. Para isolar (dev/testes),
defina `MODORCHESTRATOR_DATA_DIR`.
