# Manifesto para IA

Este projeto deve ser desenvolvido como um sistema de gerenciamento de estado complexo, não como uma coleção de telas.

## Regra central

Antes de alterar código, o agente deve descobrir:

- qual estado está sendo alterado;
- qual é a fonte de verdade;
- quais invariantes protegem esse estado;
- quais fluxos dependem dele;
- quais documentos precisam ser atualizados se a decisão mudar.

## Hierarquia de autoridade

1. Contratos e invariantes em `docs-ia/`.
2. Decisões aprovadas em `docs-ia/decisoes.md`.
3. Core correspondente.
4. Plano de UI.
5. Implementação existente.
6. Preferências inferidas pelo agente.

Nunca usar implementação existente para justificar uma violação documental.

## Alteração de regra

Se uma implementação exigir mudar uma regra existente, primeiro registrar uma proposta de decisão, listar impactos e somente depois implementar.
