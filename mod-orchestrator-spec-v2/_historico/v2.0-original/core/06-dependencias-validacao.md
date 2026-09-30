# Dependências e Validação

## Tipos

- Mod requer Mod.
- Plugin requer Plugin.
- Plugin requer arquivo.
- Mod requer capability/framework.
- Requisito opcional.

## Estados

`Satisfied`, `Missing`, `Disabled`, `WrongVersion`, `Conflicting`, `Unknown`.

## Momento de validação

Validar após importação, após mudanças no profile e obrigatoriamente antes do deploy/launch.

## Diagnóstico

Cada requisito quebrado deve informar entidade, evidência e ação sugerida.

Não bloquear operações que não dependem do requisito. Ex.: importar pode ser permitido mesmo com dependency missing; deploy pode ser bloqueado se o adapter declarar requisito crítico.
