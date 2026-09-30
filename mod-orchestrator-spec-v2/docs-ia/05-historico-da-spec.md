# Histórico da especificação

## v1 (baseline)

Primeira especificação gerada a partir do pedido original (réplica funcional do MO2 com referência Vortex, sem downloads). Tratada como baseline.

## v2.0

Reformulação completa:

- adicionados installer domain/FOMOD (só detecção), External Changes, deployment planning e verification;
- FileConflict separado de FileRule; PluginRule separado de FileRule;
- Diagnostics/Notifications/Operations;
- adapters por capability;
- Profiles e Settings expandidos;
- inventário funcional do Vortex (superficial);
- UI refeita como workspace orientado a triagem, integrada à dettmann-ui;
- prompts por fase e protocolo obrigatório.

Preservado da v1: isolamento físico dos mods, importação local na V1, deploy por links/cópia em vez de VFS por injeção, separação ordem de mods/load order, ciclos como erro explícito, modularidade do core, dettmann-ui como design system.

## v2.1 (2026-09-30, revisão atual)

Ver `06-revisao-2026-09-30.md` para os gaps encontrados. Resumo:

- documentos `core/` reescritos com estados, regras, fluxos, erros, critérios de aceite e fora de escopo;
- novos: visão e escopo, glossário, invariantes, fontes de verdade, adapter Skyrim SE, catálogo de settings, persistência/backup/recuperação, telas individuais de UI, tema 60/30/10, referência MO2;
- inventário do Vortex refeito a partir da lista real de extensões internas do repositório;
- decisões D024–D048 (modelo híbrido de ordem, FOMOD completo, Skyrim SE como primeiro adapter, deploy por diff, journal, backups, auto-deploy seguro, locks, i18n, launch);
- plano reordenado em fatias verticais (D024);
- prompts e skills independentes de ferramenta (Claude Code/Cursor), skills com frontmatter.

Cópia integral da v2.0: `_historico/v2.0-original/` (somente consulta; não é autoridade).
