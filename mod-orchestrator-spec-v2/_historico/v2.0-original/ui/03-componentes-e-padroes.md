# Componentes e padrões UX

## Preferências

- tabela para alta densidade;
- painel lateral para detalhes sem perder contexto;
- modal para decisões curtas e destrutivas;
- wizard para operações com etapas;
- command bar para ações frequentes;
- toast somente para confirmação/resultado simples;
- notification center para problemas que exigem ação;
- empty state com próximo passo claro.

## Seleção múltipla

Toda tabela principal deve suportar seleção múltipla e ações em lote quando semanticamente seguro.

## Estados visuais

Cada recurso importante deve distinguir:

`healthy | pending | warning | blocked | error | disabled`.

## Regra de densidade

A UI deve mostrar informação suficiente para usuário avançado sem transformar cada célula em uma lista de ícones. Ícones indicam estado; tooltip e painel explicam.
