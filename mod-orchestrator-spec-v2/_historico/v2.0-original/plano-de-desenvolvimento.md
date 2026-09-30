# Plano de Desenvolvimento V2 — do zero

## Estratégia

Construir primeiro o motor que consegue representar e reconciliar um setup simples. Depois adicionar complexidade de installers, conflitos, plugins e UI.

Cada fase só começa após testes da anterior e atualização dos documentos IA.

## F0 — Contratos e bootstrap

- repositório;
- Wails + frontend;
- packages isolados;
- persistência inicial;
- event/operation model;
- dettmann-ui instalado e skills incorporadas;
- CI e testes.

**Saída:** aplicação abre, navegação vazia e core compilando.

## F1 — Domínio

Entidades, invariantes, repositories/interfaces e diagnósticos.

**Não implementar filesystem complexo ainda.**

## F2 — Game discovery + GameInstance

GameDefinition, discovery, localização manual, staging, capabilities e adapter genérico.

## F3 — Biblioteca e importação

Archive inspection, extraction, root resolution, footprint, metadata, categorias e estado de instalação.

## F4 — Installer abstraction

Detecção de installers; implementação básica de archive-as-is; estrutura preparada para FOMOD.

## F5 — Deployment engine

Plan -> protect -> purge/reconcile -> apply -> verify -> manifest. Hardlink primeiro, fallbacks conforme capability.

## F6 — Profiles

Criar/trocar/clonar/excluir; desired state e deployment pending.

## F7 — Conflicts

Resolver conflitos por arquivo, regras por par, exceções e ciclos.

## F8 — Dependencies + diagnostics

Solver/validator, severity, blocking state e notification center.

## F9 — Plugins/load order

Capabilities, plugin discovery, rules, sorter contract e persistência.

## F10 — External changes

Filesystem scan, classification e reconciliation UI.

## F11 — UI Foundation

Integrar dettmann-ui de forma completa. Criar shell, tokens, layout e navegação.

## F12 — UI Game workspace

Overview, Mods, Profiles, Conflicts, Plugins, Load Order, Diagnostics.

## F13 — UX de operações

Wizards, modals, command bar, batch actions, progress, operation center e empty/error states.

## F14 — Hardening

Crash recovery, interrupted deploy, permissions, volume boundaries, path safety, corrupted metadata, migration.

## F15 — Extensibilidade

Primeiro adapter real; extension manifest; capability registration; versioning.

## F16 — Futuro preparado

Downloads, tools, collections, save games e providers somente quando contratos estiverem estáveis.

## Critério de passagem entre fases

1. Documentos obrigatórios foram lidos.
2. Testes relevantes passam.
3. Nenhum anti-pattern novo foi introduzido.
4. Mudanças de contrato estão documentadas.
5. A fase possui uma forma de demonstração manual.
