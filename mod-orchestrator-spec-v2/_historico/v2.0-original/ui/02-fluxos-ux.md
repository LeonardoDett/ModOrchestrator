# Fluxos UX

## Importar mod

`Mods -> Import -> selecionar archive -> analisar -> resolver estrutura/installer -> confirmar -> instalar -> validar -> mostrar resultado`

## Ativar mod

`selecionar -> validar dependencies/conflicts -> atualizar estado desejado -> deployment pending -> oferecer Deploy`

## Deploy

`clicar Deploy -> mostrar triagem se houver problemas -> gerar plano -> confirmar operações sensíveis -> executar -> verificar -> resultado`

## Conflito

`notification -> Conflicts -> selecionar disputa -> selecionar arquivo -> escolher vencedor -> persistir rule -> recalcular -> marcar resolvido`

## External change

`scan -> detectar divergência -> Diagnostics -> escolher ação -> reconciliar -> registrar histórico`

## Profile switch

`Profiles -> Activate -> recalcular desired state -> validar -> deployment pending -> Deploy`

## Falha

Toda falha segue:

`evento -> diagnóstico -> evidência -> impacto -> ação recomendada -> execução -> revalidação`.
