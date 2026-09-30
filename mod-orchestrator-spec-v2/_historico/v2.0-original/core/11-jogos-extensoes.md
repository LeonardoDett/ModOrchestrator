# Jogos, adaptadores e extensões

## GameDefinition

Define identidade, detecção e capabilities.

## Capabilities

Exemplos:

- filesystem mod target;
- multiple mod types;
- installer;
- plugins;
- load order;
- save games;
- game settings;
- tools;
- launch;
- external change strategy.

## Discovery

A biblioteca de jogos deve poder descobrir instalações via stores/providers e permitir localização manual.

Vortex separa jogos gerenciados e suportados não gerenciados, permite esconder jogos e definir localização manual. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-UI-Games-section

## Extensão

Uma extensão deve poder registrar capabilities sem modificar os pacotes centrais.

## UI

A UI deve esconder telas que não possuem capability, mas deve preservar descoberta do recurso quando ele puder ser habilitado.
