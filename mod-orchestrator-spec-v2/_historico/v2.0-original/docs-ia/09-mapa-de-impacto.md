# Mapa de impacto

Use este arquivo antes de alterar uma regra.

| Regra alterada | Documentos normalmente afetados |
|---|---|
| Modelo de Mod | biblioteca, importação, installer, UI Mods |
| Install Order | conflitos, deploy, profiles, UI Mods/Conflicts |
| Load Order | plugins, adapters, UI Load Order |
| Deployment | staging, conflicts, external changes, diagnostics |
| Profile | desired state, deployment, UI Profiles |
| ConflictRule | conflicts, deploy plan, diagnostics |
| Installer | import, library, adapters, future downloads |
| Capability | adapters, UI navigation, plugins, tools |
| Diagnostic | logs, notifications, every operation UI |
| dettmann-ui integration | all UI documents and prompts |
| Operation / Event model | bridge DTOs, logs, diagnostics, notifications, every long-running operation UI |
| Persistence schema | migrations, repositories, crash recovery, hardening (F14) |

## Regra

Se uma mudança não puder ser mapeada, o agente deve investigar antes de implementá-la.
