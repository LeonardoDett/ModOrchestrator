---
name: maintain-ai-docs
description: Mantém a especificação do Mod Orchestrator sincronizada quando um contrato, decisão, invariante, fluxo de UX, setting, diagnóstico ou escopo muda. Use sempre que uma implementação exigir mudar ou acrescentar regra, e ao final de cada fase para registrar decisões novas sem transformar a documentação em diário de commits.
---

# maintain-ai-docs

## Quando usar

- contrato, entidade ou regra alterados;
- nova decisão arquitetural ou de produto;
- invariante novo, alterado ou removido;
- novo anti-pattern descoberto (falha que pode reaparecer);
- fluxo de UX ou distribuição de tela alterados (divergência do Vortex);
- setting, HealthCheck, código de erro ou evento novos;
- mudança de escopo de release;
- fato externo confirmado (itens "(verificar)").

## Procedimento

1. **Descreva o problema** em uma frase: o que a spec diz, o que a realidade exige.
2. **Mapa de impacto**: encontre a linha em `docs-ia/04-mapa-de-impacto.md`; se não existir, acrescente-a.
3. **Decisão**: registre em `docs-ia/decisoes.md` com o próximo ID, status, motivo, alternativas rejeitadas e consequências. Se muda uma decisão antiga, marque a antiga `emendada por Dxxx` ou `substituída por Dxxx` **sem apagar o texto e a motivação originais**.
4. **Invariantes**: altere `02-invariantes.md` somente com decisão citada.
5. **Documentos afetados**: atualize todos os `core/`, `ui/`, `references/` (ADOPT/ADAPT/DEFER/REJECT) e catálogos (settings em core/13, checks em core/10 §1.1, diálogos em ui/telas/dialogos.md, divergências em ui/00 §6).
6. **Glossário**: termo novo ou renomeado entra em `01-glossario.md`; termo abandonado vai para "Termos proibidos".
7. **Anti-pattern**: se a falha pode se repetir, acrescente no fim da lista (numeração estável).
8. **Prompts**: atualize `prompts/01-fases.md` se mudaram documentos obrigatórios ou pré-condições de uma fase.
9. **Referências cruzadas**: procure citações ao que mudou (IDs, nomes de arquivo, seções) e corrija.
10. **Histórico da spec**: mudança estrutural grande ganha linha em `docs-ia/05-historico-da-spec.md`.

## Regras

- Documentação descreve o **estado atual e o porquê**, não o passo a passo de commits.
- Uma decisão por mudança; não agrupe decisões independentes.
- Não "limpe" decisões antigas: o histórico da motivação é o que evita a mesma discussão no futuro.
