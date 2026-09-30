# Protocolo universal

Vale para qualquer agente (Claude Code, Cursor ou outro). Cole no início da sessão, ou deixe que `AGENTS.md`/`CLAUDE.md` o carregue.

```text
Você está trabalhando no Mod Orchestrator (Go + Wails v2 + React/dettmann-ui).
A especificação está em mod-orchestrator-spec-v2/. Caminhos abaixo são relativos a ela.

ANTES DE ESCREVER CÓDIGO (aplique a skill consult-ai-docs):
1. README.md (índice) e 00-visao-e-escopo.md (o que é V1).
2. docs-ia/00-manifesto.md, 01-glossario.md, 02-invariantes.md, 03-fontes-de-verdade.md.
3. docs-ia/decisoes.md (só as vigentes/emendadas) e docs-ia/anti-patterns.md.
4. A seção da fase atual em plano-de-desenvolvimento.md.
5. Todos os documentos core/ e ui/ listados no prompt da fase (prompts/01-fases.md).
6. Referências Vortex/MO2 citadas nesses documentos, se a tarefa envolver fluxo ou layout.
7. Para frontend/: skills da dettmann-ui (theme-first, composition, component-authoring) e, antes de concluir, ui-review.

ANTES DE IMPLEMENTAR, escreva um resumo curto:
- estados alterados e suas fontes de verdade;
- invariantes envolvidos (IDs);
- decisões que restringem a tarefa (IDs);
- o que está fora do escopo da fase.

REGRAS:
- Não invente comportamento: se a spec não responde, pare e pergunte ou registre decisão "proposta".
- Nenhuma regra de negócio na UI; a UI relê o backend após eventos.
- Conflito ≠ regra; diagnóstico ≠ notificação ≠ histórico ≠ log.
- ModOrder ≠ LoadOrder. Use os termos do glossário.
- Nada toca o filesystem do jogo sem plano + journal; nada não gerenciado é apagado.
- Toda UI com dettmann-ui; faltou componente genérico → cria na lib.
- Todo texto de UI via i18n.
- Não altere contrato existente sem decisão e mapa de impacto (skill maintain-ai-docs).

DURANTE:
- Mudanças pequenas, testáveis, uma camada por vez (domínio → aplicação → infraestrutura → bridge → UI).
- Testes dos invariantes da fase junto com o código.

AO FINAL:
1. go vet ./... && go test ./...
2. npm --prefix frontend run typecheck && npm --prefix frontend test
3. wails build (quando a fase tocar build/UI)
4. Conferir anti-patterns e critérios de aceite dos documentos da fase.
5. Registrar decisões novas (docs-ia/decisoes.md) e atualizar documentos afetados.
6. Relatar: arquivos alterados, testes executados, demonstração manual, riscos restantes.
```
