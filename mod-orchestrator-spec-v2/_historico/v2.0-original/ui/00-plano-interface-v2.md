# Plano de Interface V2 — UX/UI

## Objetivo

Criar uma interface de mod manager que pareça simples no uso diário, mas revele controle avançado quando necessário. A estrutura usa Vortex como referência de distribuição de informação, porém adapta a navegação para o conceito do Mod Orchestrator.

Vortex organiza Games, Mods, Downloads, Extensions, Settings e áreas específicas por jogo, e sua tela de Mods concentra toolbar, filtros, tabela, dropzone, multi-actions e painel de informação. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-UI-Mods-section

## Shell global

### Sidebar

**Global**
- Dashboard
- Games
- Extensions
- Settings

**Workspace do jogo ativo**
- Overview
- Mods
- Conflicts
- Plugins
- Load Order
- Profiles
- Logs / Diagnostics

**Reservado**
- Downloads
- Tools
- Collections

Apenas recursos disponíveis/capabilities aparecem como ativos. Itens futuros podem aparecer como "Coming later" apenas em uma seção de descoberta, não como botões quebrados.

### Topbar

- jogo ativo;
- profile ativo;
- status de deployment;
- contador de problemas;
- operações em andamento;
- notificações;
- ajuda.

## Tela Dashboard

Não deve ser um painel financeiro cheio de cards. É um centro de triagem:

1. **Setup status** — jogo/profile, deployment pending, método de deploy.
2. **Problems requiring action** — conflitos, dependencies, external changes, invalid plugins.
3. **Recent operations**.
4. **Quick actions** — Import Mod, Deploy, Purge, Open Game Folder.
5. Reservar dashlets futuros.

## Games

Base Vortex: busca, managed/unmanaged, grid/list, hide/show, localização manual, abrir pasta. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-UI-Games-section

Adicionar jogo deve ser wizard curto:

`selecionar jogo -> detectar instalação -> confirmar root -> definir staging quando necessário -> validar deployment -> concluir`

## Overview do jogo

É a tela que contextualiza o workspace. Mostrar:

- game artwork;
- profile atual;
- Mods enabled/total;
- plugins enabled/total quando aplicável;
- conflitos não resolvidos;
- dependencies quebradas;
- deployment status;
- ações principais.

## Mods

### Layout

Manter o modelo Vortex:

- toolbar;
- filtros;
- tabela;
- seleção múltipla;
- multi-action bar;
- dropzone/import;
- info/details panel.

### Colunas sugeridas

Status | Mod | Version | Category | Priority | Conflicts | Dependencies | Size | Source

### Toolbar

Import From File | Enable | Disable | Deploy | Purge | Rules | Categories | Open | History

`Check for updates` fica reservado para fase de provider.

### Detalhes do mod

Painel lateral com:

- metadata;
- footprint;
- arquivos;
- source;
- dependencies;
- conflicts;
- install history;
- diagnostics.

## Conflicts

Tela dedicada com split view:

**esquerda:** grupos de mods conflitantes.

**direita:** árvore de arquivos disputados.

Para cada arquivo:

`winner -> losers -> reason -> rule`

Ações:

- Make A win;
- Make B win;
- Create rule;
- Remove rule;
- Open file;
- Compare metadata.

A granularidade por arquivo é obrigatória porque Vortex suporta escolher vencedores diferentes para arquivos de um mesmo par de mods. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Managing-File-Conflicts

## Plugins

Tabela orientada a estado:

Enabled | Plugin | Source Mod | Type | Group | Warnings | Rules

Ações:

- enable/disable;
- manage rules;
- show source mod;
- validate;
- sort when supported.

## Load Order

Separar visualmente de Plugins. A tela mostra:

- ordem atual;
- origem da ordem (manual/sorter/adapter);
- rules;
- groups;
- diagnostics;
- sort action.

Não assumir drag-and-drop como único mecanismo. Vortex prefere sorting automático com regras customizadas para load order em jogos compatíveis. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-The-Vortex-Approach-to-Load-Order

## Profiles

Cards compactos com:

- nome;
- quantidade de mods;
- estado deployed;
- última utilização;
- saves/settings isolados quando suportados.

Ações: Activate, Clone, Rename, Delete, Open folder, Compare.

Vortex permite separar mod list e opcionalmente saves/game settings por profile. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Setting-up-Profiles

## Logs / Diagnostics

Duas camadas:

- Diagnostics: problemas acionáveis.
- Logs: auditoria técnica.

Um diagnóstico sempre deve levar ao local onde a ação pode ser executada.

## Settings

Separar por intenção:

### Interface
Idioma, notificações, comportamento visual, dashboard.

### Application
Dados, update, privacy, performance.

### Deployment
Método, staging, validação, comportamento automático.

### Import
Archives, installers, segurança.

### Advanced
Opções perigosas/experimentais.

Não copiar cegamente as tabs do Vortex; usar sua distribuição como referência e reorganizar quando a semântica ficar mais clara.

## Design system

Usar exclusivamente dettmann-ui.

Tema base: dark + verde, 60/30/10.

- 60%: superfícies neutras escuras.
- 30%: superfícies secundárias, bordas e áreas de navegação.
- 10%: verde para ação, seleção, sucesso e identidade.

Verde não deve ser aplicado a tudo: erro, warning e informação devem manter semântica própria do design system.

## Crescimento

Reservar slots para:

- Downloads;
- Tools hotbar;
- Collections;
- Save Games;
- external providers;
- extension marketplace.

Nenhuma dessas áreas deve criar dependência no MVP.
