# Referências de comportamento: Vortex

Esta pasta contém **somente comportamento de referência do Vortex**. Não são requisitos automáticos: o que vale para o produto está em `core/`, `ui/` e `docs-ia/decisoes.md`. Para o layout, o Vortex é a base (D042).

## Como interpretar

- `VORTEX-*` = fato/fluxo observado.
- **ADOPT** = reproduzido.
- **ADAPT** = usado como base, com mudança documentada em decisão.
- **DEFER** = release posterior, contrato preparado.
- **REJECT** = deliberadamente não adotado.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| VORTEX-01 … VORTEX-11 | Resumos por área (shell, games, mods, deploy, conflitos, load order, profiles, external changes, settings, extensibilidade, triagem) |
| VORTEX-12 | Inventário funcional completo, ancorado na lista real de extensões do repositório, com decisão por item |
| VORTEX-13 | Fluxos e gatilhos: cadeia de eventos entre instalar, habilitar, deploy, profile, launch |

Referência complementar de isolamento/prioridade: `references/mo2/MO2-01-referencia.md`.

## Fontes

A wiki do Vortex tem conteúdo migrado e às vezes antigo; comportamento importante foi confrontado com o código do repositório (lista de extensões e textos de Settings consultados em 2026-09-30).

- https://github.com/Nexus-Mods/Vortex (código: `src/renderer/src/extensions/`, `extensions/`)
- https://github.com/Nexus-Mods/Vortex/wiki
- https://github.com/Nexus-Mods/vortex-api
