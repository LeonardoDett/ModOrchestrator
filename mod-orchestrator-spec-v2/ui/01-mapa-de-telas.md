# Mapa de telas

Referências: D119, D120. "Artboard" é a prancha do design v1 (`propostas/redesign-telas-v1-fechamento.md`); "RD" é a fase do plano (`propostas/2026-10-14-plano-implementacao-redesign.md`) que reescreve o documento da tela e a implementa. Até essa fase, o documento descreve a tela atual.

## Design v1

| Nível | Tela | Documento | Artboard | Desenho | Capability | RD |
|---|---|---|---|---|---|---|
| App | Início | telas/dashboard.md | `Inicio` | aprovado | — | RD14 |
| App | Biblioteca | telas/games.md | `Biblioteca` | aprovado | — | RD14 |
| App | Adicionar jogo | telas/games.md, telas/dialogos.md | `JogosSuportados` | aprovado | — | RD14 |
| App | Importar de Vortex ou MO2 | telas/dialogos.md | `ImportarOferta`, `ImportarEscolha` | aprovado | partes de plugin só com `plugins`/`load_order` | RD15, RD16 |
| App | Extensões | telas/settings-extensions.md | — | sem artboard | — | — |
| App | Configurações | telas/settings-extensions.md | `Configuracoes` (aba Interface) | aguardando revisão | — | RD17e |
| Jogo | Casca (barra superior e menu) | 00-principios-e-shell.md | `JogoMods`, `JogoMenuRecolhido` | aprovado | menu pelas capabilities efetivas | RD4 |
| Jogo | Visão geral | telas/overview.md | `JogoVisaoGeral`, `JogoGenerico` | aprovado | blocos pelo que o backend devolve | RD13 |
| Jogo | Ajustes da instância (recursos) | telas/overview.md | `JogoAjustesRecursos` | aprovado | — | RD13 |
| Jogo | Mods (Lista, Aninhada, Abas) | telas/mods.md | `JogoMods`, `JogoModsAninhada`, `JogoModsAbas` | aprovado | — | RD8 |
| Jogo | Organização (categorias e tags) | telas/mods.md | `JogoOrganizacao`, `JogoOrganizacaoTags` | aprovado | — | RD8 |
| Jogo | Fila de instalação | telas/dialogos.md | `JogoFilaInstalacao` | aprovado | — | RD8 |
| Jogo | Menus Filtros e Mais ações de Mods | telas/mods.md | `JogoModsMenus` | aguardando revisão | filtro "contém" só com classificação do adapter | RD17b |
| Jogo | Detalhe do mod (5 abas) | telas/mods.md | `JogoModDetalhe`, `JogoModConflitos`, `JogoModArquivos`, `JogoModHistorico`, `JogoModInstalacao` | aprovado | — | RD9 |
| Jogo | Instalador FOMOD | telas/dialogos.md (DLG-06) | `JogoFomod`, `JogoFomodResumo` | aprovado | — | RD10 |
| Jogo | Conflitos | telas/conflicts.md | `JogoConflitos` | aprovado | — | RD11 |
| Jogo | Plugins | telas/plugins.md | `JogoPlugins` | aprovado | `plugins` | RD12 |
| Jogo | Ordem de carga | telas/load-order.md | `JogoOrdemDeCarga` | aprovado | `load_order` | RD12 |
| Jogo | Perfis | telas/profiles.md | `JogoPerfis` | aguardando revisão | — | RD17c |
| Jogo | Diagnóstico | telas/diagnostics.md | `JogoDiagnostico` (aba Problemas) | aguardando revisão | — | RD17d |
| Jogo | Painel de Notificações | 00-principios-e-shell.md | `JogoNotificacoes` | aguardando revisão | — | RD17a |
| — | Downloads, Inspetor de assets, Extensões de usuários | — | `FuturoDownloads`, `FuturoAssets`, `FuturoExtensoes` | reservado | — | — |

Sem artboard (mantêm o layout atual, D119 item 2): abas Histórico, Operações e Log do Diagnóstico; abas Aplicação, Mods, Plugins, Soluções de problemas e Tema das Configurações; diálogos de Perfis; diálogos de Mods abertos por "Mais ações"; Extensões.

## Telas atuais (fases F0 a F15)

Como o `frontend/` está hoje. A coluna "Base no Vortex" é histórica (D042, substituída por D119).

| Área | Tela | Documento | Release | Capability | Fase | Base no Vortex |
|---|---|---|---|---|---|---|
| Global | Dashboard | telas/dashboard.md | V1 | — | F12 (esqueleto F2) | Dashboard + dashlets |
| Global | Games | telas/games.md | V1 | — | F3 | Games |
| Jogo | Overview | telas/overview.md | V1 | — | F12 (esqueleto F3) | — (divergência 5) |
| Jogo | Mods | telas/mods.md | V1 | — | F4 → F5 → F6 → F7 | Mods |
| Jogo | Conflicts | telas/conflicts.md | V1 | — | F6 | diálogos de conflito (divergência 1) |
| Jogo | Plugins | telas/plugins.md | V1 | `plugins` | F11 | Plugins (gamebryo) |
| Jogo | Load Order | telas/load-order.md | V1 | `load_order` | F11 | Load Order (FBLO) / ordenação de Plugins |
| Jogo | Profiles | telas/profiles.md | V1 | — | F5 | Profiles |
| Jogo | Diagnostics | telas/diagnostics.md | V1 | — | F9 (aba Log F2) | Health Check + History + notificações |
| Global | Extensions | telas/settings-extensions.md | V1 (lista de embutidos) | — | F12 | Extensions |
| Global | Settings | telas/settings-extensions.md | V1 | — | F12 (abas crescem por fase) | Settings |
| — | Diálogos e assistentes | telas/dialogos.md | V1 | — | por fase | diálogos do Vortex |
| Global | Downloads | — | V2 (reservada) | — | — | Downloads |
| Jogo | Collections | — | V2 (reservada) | — | — | Collections |
| Jogo | Saves | telas/saves.md | V1 (D142) | `save_games` | LV3 | Saves (gamebryo) |
| Barra de título | Tools hotbar | — | V1.x (reservada) | `tools` | — | Starter / titlebar launcher |

## Formato de cada documento de tela

1. Objetivo e perguntas que a tela responde.
2. Artboards de referência (D119) e o que ficou de fora deles; escopo de jogo (D112): o que muda sem cada capability.
3. Layout (esquema).
4. Toolbar: ações, ordem, condições.
5. Conteúdo: colunas/campos, filtros, ordenação, estados de linha.
6. Detalhe do item (modal ou painel).
7. Multi-seleção.
8. Estados de página (vazio, carregando, ocupado...).
9. Consultas e comandos do bridge usados.
10. Critérios de aceite de UX.
