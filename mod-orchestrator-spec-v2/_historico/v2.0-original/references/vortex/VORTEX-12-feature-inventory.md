# VORTEX-12 — Inventário funcional de referência

> Este arquivo é uma matriz de cobertura para evitar os gaps da primeira especificação. Alguns itens pertencem a extensões/jogos e não devem ser implementados no core.

## Shell/global

- Dashboard.
- Customização de dashboard/dashlets.
- Games.
- Managed games.
- Supported/unmanaged games.
- Game search.
- Hide/show game.
- Manual game location.
- Open game/mod folders.
- Downloads.
- Extensions.
- Settings.
- Notifications.
- Help/support.
- Logs.
- About.
- Account.
- Login/logout.
- Refresh account info.
- Feedback.
- Nexus profile.

## Mods

- Install From File.
- Install archive/dropzone.
- Enable/disable.
- Batch actions.
- Categories.
- Manage Rules.
- Deploy.
- Purge.
- Reset to manifest.
- History.
- Open folders.
- Tutorials.
- Filters.
- Sorting.
- Column visibility.
- Info panel.
- Mod metadata.
- Update detection.
- Changelog indicator.
- Endorsement/tracking indicators.
- Dependency indicators.
- Conflict indicators.
- File-level override indicators.
- Game-specific actions.

## Downloads

- All downloads.
- Filter by game.
- Queue/status.
- Speed history.
- Open download folder.
- Install.
- Unpack as-is.
- Delete.
- Open location.
- Query metadata.
- View metadata.
- Categorize.
- Column selection.
- Drop URL/file.
- Download links (`nxm://`).
- Bandwidth/threads.
- Install-on-download automation.

## Profiles

- Enable profile management.
- Create.
- Activate.
- Clone.
- Remove.
- Separate mod list.
- Optional profile-specific saves.
- Optional profile-specific game settings.
- Transfer mod configuration between profiles.
- Transfer/import save games.

## Conflicts

- Detect file conflicts.
- Notify unsolved conflicts.
- Show involved mods.
- Highlight conflict in mod order.
- Define winner.
- Define pair rule.
- Define per-file exception.
- Show resolved/unresolved state.

## Plugins/load order

- Plugin list when game supports it.
- Enable/disable plugin.
- Sort.
- Rules.
- Groups.
- Dependency/master relationships.
- Cycle diagnostics.
- Adapter-specific serialization.
- Game-specific plugin validation.

## Deployment

- Hardlink deployment.
- Alternative link mechanisms according to environment/game.
- Purge.
- Deployment state.
- Deployment warnings.
- External changes.
- Restore/reconcile.
- Staging folder.
- Download folder.
- Per-game paths.

## External changes

- Detect changed managed files.
- Detect missing/deleted files.
- Detect moved files.
- Ask whether to keep/revert where supported.
- Reconcile on next relevant operation.

## Extensions

- List installed extensions.
- Enabled/disabled state.
- Bundled extensions visibility.
- Grouping.
- Find more.
- Search.
- Sort.
- Endorsements.
- Downloads.
- Last update.
- Install extension.
- Update extensions.
- Restart requirement.

## Settings — Interface

- Language.
- Custom title bar.
- Desktop notifications.
- Hide top-level category.
- Relative times.
- Bring app foreground on browser download.
- Profile management.
- GPU acceleration.
- Deploy mods when enabled.
- Install mods when downloaded.
- Enable mods when installed.
- Run at startup.
- Reset suppressed notifications.
- Dashboard/dashlet toggles.

## Settings — Vortex/Application

- Multi-user mode.
- Health checks.
- Missing dependency suggestions.
- Update channel.
- Check for update.
- Anonymous/usage analytics.

## Settings — Download

- Download folder.
- Download threads.
- Bandwidth limit.
- Install during collection downloads.
- Copy files on Install From File.
- Handle Nexus mod-manager links.
- Chrome link fix.
- Metadata server.

## Settings — Workarounds

- Installer sandbox.
- Symlink/link recovery mechanisms.
- Advanced recovery/backup controls.

## Settings — Theme

- Legacy UI.
- Theme selection.
- Clone theme.
- Font size.
- Margins.
- Body font.
- Heading font.
- System fonts.
- Dashlet height.
- Titlebar rows.
- Color swatches.
- Dark/light theme.

## Save games

- Profile-specific saves.
- Transfer saves.
- Copy/move import.
- Open save folder.

## Tools / game-specific

- FNIS configuration.
- SMAPI log.
- Game-specific import from NMM/MO.
- External tools and extension-provided toolbar actions.

## Portabilidade

- Backup internal state.
- Staging folder.
- Download folder.
- Restore on new PC.

## Aplicação ao Mod Orchestrator

### V1 obrigatório

Games, game instance, Profiles, Mods, Import, Install/Enable/Disable, Deploy/Purge, Conflicts, Diagnostics, Logs, capability-driven Plugins/Load Order, Settings essenciais e detecção de external changes.

### V1 preparada, não implementada

Downloads, update providers, account integrations, Collections, Save Games, Tools, Extensions marketplace, online metadata.

### Deliberadamente fora do core

Nexus authentication, premium handling, NXM links, LOOT, store-specific discovery, game-specific installers e tools.

Fontes de referência:
- https://github.com/Nexus-Mods/Vortex/wiki
- https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-UI-Mods-section
- https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-UI-Games-section
- https://github.com/modcommunity/how-to-use-vortex-and-basics
