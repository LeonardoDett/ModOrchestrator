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
6. Se a tarefa envolver tela: o artboard da tela no design v1 (ui/01-mapa-de-telas.md; D119) e a fase RD do plano do redesign. Referências Vortex/MO2 citadas nos documentos só para fluxo e comportamento.
7. Para frontend/: skill `dettmann-ui-use` (`.claude/skills/`; `dettmann-ui-author` se faltar componente na lib) e, antes de concluir, `dettmann-ui-improve` (D095, D107).

ANTES DE IMPLEMENTAR, escreva um resumo curto:
- estados alterados e suas fontes de verdade;
- invariantes envolvidos (IDs);
- decisões que restringem a tarefa (IDs);
- o que está fora do escopo da fase;
- escopo de jogo (D112): a mudança vale para todo jogo ou depende de uma capability?
  Se depende, diga qual, e o que acontece numa instância sem ela (adapter generic).

REGRAS:
- Não invente comportamento: se a spec não responde, pare e pergunte ou registre decisão "proposta".
- Nenhuma regra de negócio na UI; a UI relê o backend após eventos.
- Conflito ≠ regra; diagnóstico ≠ notificação ≠ histórico ≠ log.
- ModOrder ≠ LoadOrder. Use os termos do glossário.
- Multi-jogo (D011, D112): nada no núcleo, no bridge ou no frontend supõe um processo
  que só alguns jogos têm. Comportamento opcional entra por capability + contrato do
  adapter, com teste do caminho "sem a capability". Nome de jogo, de ferramenta, de
  arquivo ou extensão de um jogo só existe em internal/adapters. Catálogo novo (códigos,
  rótulos, telas, settings) nasce extensível pelo adapter ou registra por que não.
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
4. Conferir anti-patterns, critérios de aceite dos documentos da fase e o escopo de jogo
   declarado no resumo.
5. Registrar decisões novas (docs-ia/decisoes.md) e atualizar documentos afetados.
6. Relatar: arquivos alterados, testes executados, demonstração manual, riscos restantes.
```
