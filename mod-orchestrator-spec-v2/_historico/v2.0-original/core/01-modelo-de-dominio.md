# Modelo de domínio

## GameDefinition
Identidade lógica de um jogo e capacidades suportadas.

## GameInstance
Instalação concreta: root, data targets, staging, deployment strategy e adapter.

## Mod
Unidade lógica gerenciada. Possui metadata, versão, origem, categoria, archive de origem opcional, pasta instalada, footprint e estado.

## ModInstallation
Resultado de instalar um archive em um GameInstance. Mantém estrutura resolvida e origem.

## Profile
Estado independente de uma configuração de jogo: mods habilitados, prioridade, regras aplicáveis, plugins e configurações suportadas.

## InstallOrderEntry
Prioridade de conteúdo de arquivos.

## Plugin
Unidade carregável detectada pelo adapter.

## LoadOrderEntry
Prioridade do plugin.

## FileConflict
Resultado calculado para um caminho fornecido por dois ou mais mods.

## FileRule
Regra persistida que altera o vencedor de um caminho/par.

## PluginRule
Regra de ordenação de plugins: before/after, grupo ou restrição fornecida pelo adapter/solver.

## Dependency
Requisito entre entidades, podendo ser mod, plugin, arquivo ou capability.

## DeploymentManifest
Lista do que foi aplicado pelo gerenciador, incluindo origem, destino, método, hash quando disponível e operação.

## ExternalChange
Diferença entre o estado esperado e o filesystem observado.

## Diagnostic
Problema acionável com severidade, causa, evidência, impacto e ações sugeridas.

## Operation
Execução longa rastreável: import, install, deploy, purge, sort, scan etc.

## Notification
Mensagem orientada ao usuário, separada do log técnico.
