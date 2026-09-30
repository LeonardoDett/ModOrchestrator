---
name: consult-ai-docs
description: Carrega o contexto mínimo e obrigatório da especificação do Mod Orchestrator antes de planejar ou implementar qualquer mudança (código, UI, refactor). Use no início de toda tarefa no repositório ModOrchestrator para identificar fase, estados, fontes de verdade, invariantes e decisões que restringem a tarefa.
---

# consult-ai-docs

## Objetivo

Reduzir o custo de planejamento e impedir decisões contraditórias, lendo **o necessário e nada além**, e produzindo um resumo de restrições antes de tocar em código.

## Procedimento

1. **Fase.** Identifique a fase em `plano-de-desenvolvimento.md`. Se a tarefa não pertence à fase atual, diga isso antes de continuar.
2. **Base fixa** (sempre): `docs-ia/00-manifesto.md`, `01-glossario.md`, `02-invariantes.md`, `03-fontes-de-verdade.md`, `anti-patterns.md`; em `decisoes.md`, as decisões vigentes/emendadas que o prompt da fase ou os documentos citam.
3. **Documentos da fase**: exatamente os listados em `prompts/01-fases.md` para a fase.
4. **Se a tarefa muda um contrato**: `docs-ia/04-mapa-de-impacto.md`, e então a skill `maintain-ai-docs`.
5. **Se envolve fluxo ou layout**: as referências Vortex/MO2 citadas nos documentos (não a pasta inteira).
6. **Se envolve `frontend/`**: skills da dettmann-ui (`theme-first`, `composition`, `component-authoring`; `ui-review` antes de concluir) e `ui/03-componentes-e-padroes.md`.
7. **Resumo de restrições** (escreva antes de implementar):
   - estados alterados → dono → fonte de verdade;
   - invariantes (IDs) que precisam de teste;
   - decisões (IDs) que restringem;
   - termos do glossário usados;
   - fora de escopo.
8. **Lacuna**: se a spec não responde uma pergunta necessária, pare e pergunte, ou registre decisão com status `proposta` e peça confirmação. Nunca crie regra implícita no código.

## Não fazer

- Não ler `_historico/` como autoridade.
- Não tratar implementação existente como superior aos documentos.
- Não ler todos os documentos "por garantia": o custo de contexto é real; siga os passos.
