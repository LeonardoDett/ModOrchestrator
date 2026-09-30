# Instaladores e FOMOD

## Motivo

A instalação de um mod não é necessariamente uma simples extração. Vortex suporta mod installers e diferentes mod types por jogo; o core deve possuir um ponto de extensão equivalente. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-How-to-create-mod-installers

## Contrato conceitual

Um installer recebe:

- archive;
- contexto do GameInstance;
- contexto do Profile;
- regras/capabilities disponíveis.

Produz:

- árvore de arquivos;
- instruções de destino;
- opções escolhidas;
- requisitos;
- warnings;
- footprint final.

## FOMOD

O parser deve tratar `info.xml`, `ModuleConfig.xml`, grupos de seleção, tipos de seleção, plugins, flags, dependências e arquivos condicionais como conceitos distintos.

V1 pode apenas detectar FOMOD e informar `installer_required`, sem implementar toda a UI de seleção.

## Segurança

Nunca executar scripts do archive como parte de uma importação automática sem capability explícita, consentimento e sandbox apropriado.
