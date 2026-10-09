# Mod Orchestrator

Gerenciador de mods desktop (Go + Wails v2 + React). A especificação vive em
`mod-orchestrator-spec-v2/` e o design
system em `dettmann-ui-vnext/`, ambas versionadas neste repositório (o build da lib, `node_modules/` e `dist/`, não é versionado; ver D052).

Estado: **V1.0 em preparação** (fases F0–F15 da spec implementadas; a primeira release pública depende das etapas 4–7 do `plano-de-publicacao.md`). Mudanças por versão: [CHANGELOG.md](CHANGELOG.md).

## Instalação

1. Baixe `ModOrchestrator-amd64-installer.exe` em [Releases](https://github.com/LeonardoDett/ModOrchestrator/releases) e, se quiser, confira o hash com o `SHA256SUMS` da release.
2. O instalador é **por usuário** (`%LOCALAPPDATA%\Programs\ModOrchestrator`) e **não pede administrador**. Requer Windows 10/11 x64; o WebView2 é instalado se faltar. Há também um `.zip` portátil.
3. Passo a passo até jogar: [Primeiros passos](docs/primeiros-passos.md) ([English](docs/getting-started.md)).

**Aviso do SmartScreen ("O Windows protegeu o computador").** Aparece para executáveis sem assinatura ou ainda sem reputação. A assinatura será feita pela SignPath Foundation, a partir do build no GitHub Actions, com aprovação manual de cada release (D077); até a aprovação do projeto, as releases saem sem assinatura e o aviso aparece. Em "Mais informações", releases assinadas mostram o editor "SignPath Foundation". O código de PR nunca chega ao pipeline que assina, e todo instalador publicado vem acompanhado do `SHA256SUMS`.

**Atualização.** Desligada por padrão (o app não usa a rede). Em Configurações › Aplicação › Atualizações você liga a verificação e escolhe o canal (estável ou beta); o instalador só roda depois de conferido com o hash e a assinatura da release.

**Desinstalar** mantém os dados (`%APPDATA%\ModOrchestrator`) a menos que você marque a opção, e nunca apaga mods, staging nem pastas de jogo.

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

1. Compilar a dettmann-ui que o `frontend/` usa (v1 até a migração, D095; uma vez, e a cada mudança nela):

   ```bash
   cd dettmann-ui-v1 && npm install && npm run build
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

4. Instalador (precisa do NSIS no PATH): `wails build -nsis` gera `build/bin/ModOrchestrator-amd64-installer.exe` a partir de `build/windows/installer/project.nsi`. Releases saem só pelo workflow `release.yml` (tag `v*`), nunca da máquina de alguém; checagens em `go run ./tools/release`.

Dados da aplicação: `%APPDATA%\ModOrchestrator\state.db`; log técnico em `%APPDATA%\ModOrchestrator\logs`. Para isolar (dev/testes),
defina `MODORCHESTRATOR_DATA_DIR`.

## Contribuir e licença

Contribuições por PR são bem-vindas: veja [CONTRIBUTING.md](CONTRIBUTING.md). Publicação e assinatura dos executáveis: `mod-orchestrator-spec-v2/plano-de-publicacao.md`.

Licença: [GPL-3.0-or-later](LICENSE), incluindo a `dettmann-ui` (D076). Contribuições à `dettmann-ui` também são licenciadas sob MIT (D096; ver [CONTRIBUTING.md](CONTRIBUTING.md)).
