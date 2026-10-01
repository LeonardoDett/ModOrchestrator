# Contribuindo

Obrigado pelo interesse. O Mod Orchestrator é open source sob a [GPL-3.0-or-later](LICENSE).

## Licença das contribuições

Ao abrir um PR, você concorda que a contribuição é licenciada sob a mesma licença do projeto (GPL-3.0-or-later). Não há CLA. Só envie código que você escreveu ou que tenha licença compatível com GPL-3.0, com a atribuição original preservada.

## Compilar e testar

Pré-requisitos e passo a passo em [README.md › Desenvolvimento](README.md#desenvolvimento). Tudo o que é necessário está no repositório, incluindo a `dettmann-ui` (`dettmann-ui-vnext/`).

Para testar o PR de outra pessoa:

```bash
gh pr checkout <número>
```

Depois compile a `dettmann-ui` e rode `wails dev` (ou `wails build`), como no README. Um executável compilado na sua máquina não dispara o aviso do SmartScreen; os artefatos baixados do CI de um PR não são assinados e disparam.

Para não misturar com os seus dados reais, defina `MODORCHESTRATOR_DATA_DIR` para uma pasta de teste antes de rodar.

## Antes de abrir o PR

```bash
go vet ./... && go test ./...
```

```bash
npm --prefix frontend run typecheck && npm --prefix frontend test
```

```bash
wails build
```

O CI roda as mesmas verificações (exceto `wails build`) em todo PR.

## Regras do projeto

- A especificação em `mod-orchestrator-spec-v2/` é a autoridade. Comece pelo [protocolo](mod-orchestrator-spec-v2/prompts/00-protocolo.md) e pelo [AGENTS.md](AGENTS.md); valem para pessoas e agentes.
- Camadas: `internal/core/domain` <- `internal/core/application` <- `internal/infrastructure` / `internal/adapters`. `go test ./internal` falha se a regra for violada.
- Nenhuma regra de negócio em componentes React; toda UI usa a `dettmann-ui`; todo texto de UI vem do i18n (en e pt-BR).
- Mudou contrato, regra ou comportamento não previsto na spec: registre a decisão em `mod-orchestrator-spec-v2/docs-ia/decisoes.md` no mesmo PR.
- Dependência nova precisa ter licença compatível com GPL-3.0 (D076).
- Workflows do GitHub: não use `pull_request_target` nem dê segredos a jobs que rodam código de PR (D077).

## Segurança

Não abra issue pública para vulnerabilidades. Use o reporte privado de vulnerabilidades do GitHub (aba Security do repositório).
