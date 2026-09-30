# Migração da especificação anterior

A especificação recebida foi tratada como baseline, não como fonte final.

## Principais correções

- Adicionado installer domain/FOMOD.
- Adicionado External Changes.
- Adicionado deployment planning e verification.
- Separado FileConflict de FileRule.
- Adicionado regra por arquivo e precedência.
- Separado PluginRule de FileRule.
- Adicionado Diagnostics/Notifications/Operations.
- Adicionado capability-driven adapters/extensions.
- Expandido Profiles.
- Expandido Settings e shell.
- Adicionado inventário funcional Vortex.
- UI refeita do zero como workspace orientado a triagem.
- Prompts atualizados para Cursor com protocolo obrigatório.
- Mantidas downloads/tools/collections como contratos futuros.

## O que foi preservado

- isolamento físico dos mods;
- importação local na V1;
- deploy por links/cópia em vez de VFS por injeção;
- separação install order/load order;
- regras cíclicas como erro explícito;
- modularidade do core;
- dettmann-ui como design system.
