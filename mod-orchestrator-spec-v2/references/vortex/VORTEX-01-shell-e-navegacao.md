# VORTEX-01 — Shell e navegação

## Observado

Vortex usa uma navegação global combinada com contexto do jogo ativo. A interface inclui jogos gerenciados, Downloads, Dashboard, Games, Extensions, Settings, notificações, suporte e conta. A área de um jogo expõe recursos como Mods e, quando suportado, Plugins/Load Order.

## Aplicação

**ADOPT:** separar global e workspace do jogo.

**ADAPT:** Mod Orchestrator usará Dashboard, Games, Extensions e Settings como global; Overview, Mods, Conflicts, Plugins, Load Order, Profiles e Diagnostics como workspace. Title bar com launcher (Play) como no Vortex. Divergências listadas em `ui/00-principios-e-shell.md` §6.

**REJECT:** dependência de conta Nexus para operações locais da V1.

Fonte: https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-UI-Games-section
