# Mapa de telas

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
| Jogo | Saves | — | V1.x (reservada) | `save_games` | — | Saves (gamebryo) |
| Barra de título | Tools hotbar | — | V1.x (reservada) | `tools` | — | Starter / titlebar launcher |

## Formato de cada documento de tela

1. Objetivo e perguntas que a tela responde.
2. Base no Vortex (o que é reproduzido) e divergências.
3. Layout (esquema).
4. Toolbar: ações, ordem, condições.
5. Conteúdo: colunas/campos, filtros, ordenação, estados de linha.
6. Inspector.
7. Multi-seleção.
8. Estados de página (vazio, carregando, ocupado...).
9. Consultas e comandos do bridge usados.
10. Critérios de aceite de UX.
