# Mod Orchestrator: especificação v2.1

Gerenciador de mods para PC (Windows, Go + Wails + React/dettmann-ui) que entrega o que o **Vortex** entrega para arquivos locais, com a clareza de prioridade e o isolamento do **MO2**, e corrige os pontos fracos de ambos. Visão, releases e requisitos: [`00-visao-e-escopo.md`](00-visao-e-escopo.md).

> A especificação documenta comportamentos, contratos e decisões; não contém código. Quando código e documento divergem, o documento vale (ver manifesto).

## Princípios

1. **Três estados**: desejado (profile + instância), aplicado (manifesto), observado (disco). Deploy é o diff entre eles (D033).
2. **Nada silencioso**: conflitos explicados, external changes triadas, nada não gerenciado apagado.
3. **Ordem explícita + regras como restrição** (D025): quem vence é sempre visível e explicável.
4. **Core agnóstico de jogo**: tudo específico entra por adapter e capability (D011, D031).
5. **Importação local na V1**; providers/downloads por contrato (D013).
6. **UX de triagem** com layout do Vortex (D014, D042).
7. **Modularidade real**: domínio puro, ports, UI sem regra de negócio (D017).
8. **dettmann-ui obrigatória** (D016).

## Estrutura

| Pasta/arquivo | Conteúdo |
|---|---|
| `00-visao-e-escopo.md` | visão, diferenciais, releases V1.0/V1.x/V2, requisitos não funcionais |
| `docs-ia/` | manifesto, glossário, invariantes, fontes de verdade, mapa de impacto, decisões, anti-patterns, histórico e revisão |
| `core/` | contratos e regras de domínio (arquivos, configs, deploy, ordem, plugins...) |
| `ui/` | princípios e shell, mapa de telas, fluxos, componentes, tema, e `telas/` (uma por tela + diálogos) |
| `references/vortex/`, `references/mo2/` | comportamento observado, com ADOPT/ADAPT/DEFER/REJECT |
| `plano-de-desenvolvimento.md` | fases F0–F15 em fatias verticais |
| `plano-de-publicacao.md` | licença, contribuição, empacotamento, assinatura, canais e atualização (D076, D077) |
| `prompts/` | protocolo universal e prompt por fase |
| `skills/` | `consult-ai-docs` (ler/considerar) e `maintain-ai-docs` (criar/manter) |
| `_historico/` | cópia da v2.0; somente consulta, **não é autoridade** |

## Índice

### docs-ia
- [00 Manifesto](docs-ia/00-manifesto.md) · [01 Glossário](docs-ia/01-glossario.md) · [02 Invariantes](docs-ia/02-invariantes.md) · [03 Fontes de verdade](docs-ia/03-fontes-de-verdade.md) · [04 Mapa de impacto](docs-ia/04-mapa-de-impacto.md) · [05 Histórico da spec](docs-ia/05-historico-da-spec.md) · [06 Revisão 2026-09-30](docs-ia/06-revisao-2026-09-30.md) · [Decisões](docs-ia/decisoes.md) · [Anti-patterns](docs-ia/anti-patterns.md)

### core
| # | Documento | Fase |
|---|---|---|
| 00 | [Arquitetura](core/00-arquitetura-core.md) | todas |
| 01 | [Modelo de domínio](core/01-modelo-de-dominio.md) | F1 |
| 02 | [Biblioteca e importação](core/02-biblioteca-importacao.md) | F4 |
| 03 | [Instaladores e FOMOD](core/03-instaladores.md) | F4, F10 |
| 04 | [Deploy e purge](core/04-deploy-purge.md) | F7 |
| 05 | [Ordem, regras e conflitos](core/05-ordem-conflitos-regras.md) | F5, F6 |
| 06 | [Dependências e validação](core/06-dependencias-validacao.md) | F9 |
| 07 | [Perfis](core/07-perfis.md) | F5 |
| 08 | [Plugins e load order](core/08-plugins-load-order.md) | F11 |
| 09 | [Alterações externas](core/09-external-changes.md) | F7, F8 |
| 10 | [Diagnóstico, notificações, histórico, logs](core/10-diagnostico-notificacoes-historico.md) | F9 |
| 11 | [Jogos, adapters, extensões](core/11-jogos-adapters-extensoes.md) | F3 |
| 12 | [Adapter Skyrim SE/AE](core/12-adapter-skyrim-se.md) | F3, F11 |
| 13 | [Settings](core/13-settings.md) | F12 (cresce por fase) |
| 14 | [Persistência, backup, recuperação](core/14-persistencia-backup-recuperacao.md) | F7, F12, F14 |
| 15 | [Futuro](core/15-futuro.md) | pós-V1 |

### ui
[00 Princípios e shell](ui/00-principios-e-shell.md) · [01 Mapa de telas](ui/01-mapa-de-telas.md) · [02 Fluxos](ui/02-fluxos-ux.md) · [03 Componentes](ui/03-componentes-e-padroes.md) · [04 Tema 60/30/10](ui/04-tema-60-30-10.md)

Telas: [Dashboard](ui/telas/dashboard.md) · [Games](ui/telas/games.md) · [Overview](ui/telas/overview.md) · [Mods](ui/telas/mods.md) · [Conflicts](ui/telas/conflicts.md) · [Plugins](ui/telas/plugins.md) · [Load Order](ui/telas/load-order.md) · [Profiles](ui/telas/profiles.md) · [Diagnostics](ui/telas/diagnostics.md) · [Settings e Extensions](ui/telas/settings-extensions.md) · [Diálogos](ui/telas/dialogos.md)

## Como um agente deve usar

1. Aplicar [`prompts/00-protocolo.md`](prompts/00-protocolo.md) e a skill [`consult-ai-docs`](skills/consult-ai-docs/SKILL.md).
2. Executar o prompt da fase em [`prompts/01-fases.md`](prompts/01-fases.md).
3. Ao mudar qualquer regra: skill [`maintain-ai-docs`](skills/maintain-ai-docs/SKILL.md).

## Fontes externas

- Vortex: https://github.com/Nexus-Mods/Vortex · wiki: https://github.com/Nexus-Mods/Vortex/wiki · API: https://github.com/Nexus-Mods/vortex-api
- MO2: https://github.com/ModOrganizer2/modorganizer
