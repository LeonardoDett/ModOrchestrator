# Manifesto para IA

Este projeto deve ser desenvolvido como um sistema de gerenciamento de estado complexo, não como uma coleção de telas.

## Regra central

Antes de alterar código, o agente deve descobrir:

- qual estado está sendo alterado (`03-fontes-de-verdade.md`);
- qual é a fonte de verdade;
- quais invariantes protegem esse estado (`02-invariantes.md`);
- quais fluxos dependem dele (`04-mapa-de-impacto.md`);
- quais documentos precisam ser atualizados se a decisão mudar.

## Hierarquia de autoridade

1. Invariantes (`02-invariantes.md`) e decisões vigentes (`decisoes.md`).
2. Glossário (`01-glossario.md`) para nomes e termos.
3. Documento `core/` correspondente.
4. Documentos `ui/`.
5. Referências Vortex/MO2 (`references/`): informam, não mandam.
6. Implementação existente.
7. Preferências inferidas pelo agente.

Nunca usar implementação existente para justificar uma violação documental. Se código e documento divergem, o documento vale; se o documento parece errado, registre proposta de decisão antes de mudar qualquer um dos dois.

## Alteração de regra

Se uma implementação exigir mudar uma regra existente: primeiro registrar proposta de decisão em `decisoes.md`, listar impactos pelo mapa de impacto, e somente depois implementar.

## Ambiguidade

Se a especificação não responde a uma pergunta necessária para implementar, **pare e pergunte**, ou registre uma decisão explícita marcada `proposta` e peça confirmação. Nunca crie regra implícita no código.

## Definição de pronto de qualquer tarefa

- Testes relevantes passam, incluindo os dos invariantes da fase.
- Nenhum anti-pattern novo.
- Critérios de aceite do documento `core/`/`ui/` correspondente atendidos.
- Documentos afetados atualizados; decisões novas registradas.
- Relato final: arquivos alterados, testes executados, riscos restantes.
