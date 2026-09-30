# Mod Orchestrator — Especificação V2

Esta é uma reformulação completa da especificação anterior para o Mod Orchestrator.

O documento parte de três referências: **Vortex** como referência principal de UX, ciclo de deploy, regras, extensibilidade e tratamento de problemas; **Mod Organizer 2** como referência de isolamento, perfis e modelo mental de prioridade; e **dettmann-ui** como sistema visual obrigatório do produto.

> A especificação não é uma cópia de implementação. Ela documenta comportamentos e decisões arquiteturais que o produto deve reproduzir ou adaptar.

## Princípios

1. **Estado desejado separado do estado aplicado.** A biblioteca e o perfil representam intenção; o deploy representa estado aplicado.
2. **Nada silencioso.** Conflitos, dependências, arquivos externos, falhas de deploy e regras cíclicas devem produzir diagnóstico acionável.
3. **Game-agnostic core.** Particularidades de cada jogo vivem em adaptadores/extensões.
4. **Importação primeiro.** V1 importa arquivos locais; downloads/providers são preparados por contratos, mas não implementados.
5. **UX orientada a triagem.** A interface deve priorizar o que precisa de decisão humana.
6. **Automação com explicabilidade.** Sempre que o sistema decidir algo automaticamente, deve existir uma explicação ou evidência.
7. **Modularidade real.** Core não depende da UI e UI não implementa regra de negócio.
8. **Compatibilidade futura.** Downloads, ferramentas externas, coleções, instaladores FOMOD, plugins e extensões devem poder ser adicionados sem remodelar o núcleo.

## Estrutura

- `core/` — contratos e regras de domínio.
- `ui/` — plano novo de interface e UX.
- `references/vortex/` — somente referências de comportamento e fluxos observados no Vortex.
- `docs-ia/` — decisões, invariantes e controle de mudanças para agentes de IA.
- `skills/` — skills para consultar e manter a documentação.
- `prompts/` — prompts prontos para o Cursor executar cada fase.

## Ordem de leitura para implementação

1. `docs-ia/00-manifesto.md`
2. `docs-ia/decisoes.md`
3. `docs-ia/anti-patterns.md`
4. `core/00-arquitetura-core.md`
5. `core/01-modelo-de-dominio.md`
6. `core/02-biblioteca-importacao.md`
7. `core/03-instaladores.md`
8. `core/04-deploy-purge.md`
9. `core/05-conflitos-regras.md`
10. `core/06-dependencias-validacao.md`
11. `core/07-perfis.md`
12. `core/08-plugins-load-order.md`
13. `core/09-external-changes.md`
14. `core/10-diagnostico-logs.md`
15. `core/11-jogos-extensoes.md`
16. `core/12-futuro.md`
17. `ui/00-plano-interface-v2.md`
18. `prompts/00-protocolo.md` e o prompt da fase correspondente.

## Fontes externas principais

- Vortex: https://github.com/Nexus-Mods/Vortex
- Vortex Wiki: https://github.com/Nexus-Mods/Vortex/wiki
- Vortex API: https://github.com/Nexus-Mods/vortex-api

A documentação oficial do Vortex informa que o projeto busca automatizar sorting e gerenciamento de mods, possui perfis, UI extensível e extensões para jogos/funcionalidades. citehttps://github.com/Nexus-Mods/Vortex
