# Arquitetura Core

## Camadas

### Domain
Entidades, value objects, invariantes e regras puras.

### Application
Casos de uso: importar, ativar, desativar, ordenar, resolver, validar, deployar, purgar, diagnosticar.

### Infrastructure
Filesystem, banco, processos, links, arquivos compactados, hashing e integração com SO.

### Adapters
Capacidades específicas de jogos e providers.

### UI bridge
Somente transporte de comandos, consultas e eventos para a UI.

## Regra de dependência

`domain <- application <- infrastructure/adapters`.

UI não deve conhecer detalhes de filesystem.

## Operações devem ser transacionais quando possível

Uma operação longa deve possuir:

- identificador de operação;
- progresso;
- etapas;
- estado atual;
- resultado;
- erro estruturado;
- possibilidade de recuperação.

## Fonte de verdade

- Biblioteca: filesystem gerenciado + metadata persistida.
- Perfil: metadata persistida.
- Regras: metadata persistida.
- Conflitos: cálculo.
- Deployment: manifesto aplicado + inspeção do filesystem.
- Diagnóstico: derivado de fatos atuais + histórico.
