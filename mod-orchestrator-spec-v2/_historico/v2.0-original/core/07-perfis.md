# Perfis

Profiles isolam configurações de uma mesma instalação de jogo. Vortex permite perfis com listas de mods, e opcionalmente saves e settings específicos. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Setting-up-Profiles

## Conteúdo

Um profile pode possuir:

- enabled mods;
- install order;
- file rules;
- plugin enabled state;
- load order rules;
- game settings quando suportado;
- save-game namespace quando suportado.

## Troca

Trocar profile altera o estado desejado, não necessariamente o filesystem. O sistema marca `deployment_pending` e oferece deploy.

## Operações

Criar, ativar, clonar, renomear, excluir, exportar/importar no futuro.

Clonar deve definir explicitamente quais recursos são compartilhados e quais são copiados.
