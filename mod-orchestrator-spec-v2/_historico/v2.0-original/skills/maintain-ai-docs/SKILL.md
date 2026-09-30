# Skill — maintain-ai-docs

## Objetivo

Manter a documentação de contexto sincronizada com o produto sem transformar docs em diário de commits.

## Quando usar

- contrato alterado;
- nova decisão arquitetural;
- novo anti-pattern descoberto;
- fluxo de UX alterado;
- mudança de escopo;
- incompatibilidade descoberta.

## Procedimento

1. Descrever o problema.
2. Identificar documentos afetados.
3. Registrar decisão em `docs-ia/decisoes.md` se for uma escolha arquitetural.
4. Atualizar core/UI afetados.
5. Adicionar anti-pattern se a falha puder reaparecer.
6. Atualizar prompts quando a mudança alterar pré-condições de execução.
7. Verificar referências cruzadas quebradas.

## Regra

Nunca alterar uma decisão antiga apagando sua motivação. Se ela deixar de valer, marque como substituída e registre a nova decisão.
