# Mod Orchestrator

Gerenciador de mods desktop (Go + Wails v2 + React). A especificação vive em
`mod-orchestrator-spec-v2/` e o design
system em `dettmann-ui-vnext/`, ambas versionadas neste repositório (o build da lib, `node_modules/` e `dist/`, não é versionado; ver D052).

Fase atual: **F3 — jogos, adapters e descoberta concluída** (port `GameAdapter`, adapters `generic` e `skyrimse`, busca nas lojas/registro/unidades, assistente Gerenciar jogo, marcadores das pastas, detecção de implantação de outro gerenciador, navegação do workspace por capability). Próxima: F4 (biblioteca e importação). F2 (fundação de UI) concluída antes.

## Estrutura

```
main.go                      entrypoint Wails
internal/
  core/domain/               entidades e invariantes puras
  core/application/          casos de uso + ports (operations, settings)
  infrastructure/            sqlite, eventbus, logging (log técnico), system, appdata
  bridge/                    transporte UI <-> core (DTOs, bindings, eventos)
  bootstrap/                 composition root
  architecture_test.go       garante a regra de dependência entre camadas
frontend/
  src/bridge/                cliente tipado do backend (Wails ou offline), erros codificados
  src/i18n/                  catálogos en/pt-BR (todo texto de UI vem daqui)
  src/shell/                 barra de título, sidebar, topbar, paleta, atalhos
  src/features/              composições de domínio feitas com peças da lib
  src/pages/                 telas
  wailsjs/                   bindings gerados pelo Wails (não editar)
```

Decisões estruturais: `mod-orchestrator-spec-v2/docs-ia/decisoes.md` (D017–D023; F2: D053–D056; F3: D057–D061).

## Desenvolvimento

Pré-requisitos: Go 1.27+, Node 24+, Wails CLI v2, WebView2 (Windows).

1. Compilar a dettmann-ui (uma vez, e a cada mudança nela):

   ```bash
   cd dettmann-ui-vnext && npm install && npm run build
   ```

   O build gera JS, CSS e `.d.ts` (a etapa de tipos roda com 8 GB de heap). `npm run theme`
   verifica contraste e o contrato de tons dos temas.

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

Dados da aplicação: `%APPDATA%\ModOrchestrator\state.db`; log técnico em `%APPDATA%\ModOrchestrator\logs`. Para isolar (dev/testes),
defina `MODORCHESTRATOR_DATA_DIR`.
