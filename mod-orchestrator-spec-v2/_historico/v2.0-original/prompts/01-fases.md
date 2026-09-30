# Prompts por fase

## F0 — Bootstrap

```text
Aplique prompts/00-protocolo.md.

Implemente somente a F0 do plano. Crie a estrutura modular do projeto, Wails + frontend, persistência inicial, modelo de Operation/Event e integração inicial da dettmann-ui.

Não implemente regras de mods/deploy/conflitos ainda.

Valide build, testes e importação da biblioteca UI. Ao terminar, registre decisões estruturais novas.
```

## F1 — Domínio

```text
Aplique prompts/00-protocolo.md e leia core/00-arquitetura-core.md e core/01-modelo-de-dominio.md.

Implemente somente domínio, contratos e testes unitários. Não implemente UI nem filesystem real.

Garanta separação entre desired state, calculated state e applied state.
```

## F2 — Jogos

```text
Aplique prompts/00-protocolo.md e leia core/11-jogos-extensoes.md.

Implemente GameDefinition, GameInstance, discovery e adapter genérico. Toda particularidade deve entrar por capability.

Crie testes de jogo não suportado, localização manual e staging inválido.
```

## F3 — Biblioteca

```text
Aplique prompts/00-protocolo.md e leia core/02-biblioteca-importacao.md.

Implemente importação local, inspeção segura, resolução de root, footprint e instalação isolada.

Não implemente download.
```

## F4 — Installers

```text
Aplique prompts/00-protocolo.md e leia core/03-instaladores.md.

Crie o contrato de installer e suporte seguro para archive-as-is. Detecte FOMOD e reporte installer_required sem fingir que ele foi processado.
```

## F5 — Deploy

```text
Aplique prompts/00-protocolo.md e leia core/04-deploy-purge.md e references/vortex/VORTEX-04-deploy-purge.md.

Implemente plan/reconcile/apply/verify/manifest. Proteja arquivos unmanaged. O processo deve ser idempotente e recuperável após interrupção.
```

## F6 — Profiles

```text
Aplique prompts/00-protocolo.md e leia core/07-perfis.md.

Implemente profile lifecycle e desired state. Troca de profile deve gerar deployment_pending quando necessário.
```

## F7 — Conflicts

```text
Aplique prompts/00-protocolo.md e leia core/05-conflitos-regras.md e references/vortex/VORTEX-05-conflicts.md.

Implemente cálculo por arquivo, regras por par, exceções por caminho e detecção de ciclos. Não resolva conflito silenciosamente.
```

## F8 — Validation

```text
Aplique prompts/00-protocolo.md e leia core/06-dependencias-validacao.md e core/10-diagnostico-logs.md.

Implemente diagnostics, dependency validation e notification events. Todo bloqueio precisa de evidência e ação.
```

## F9 — Plugins

```text
Aplique prompts/00-protocolo.md e leia core/08-plugins-load-order.md.

Implemente capability-driven plugin discovery, load order contract e regras. Não assuma LOOT nem Bethesda.
```

## F10 — External changes

```text
Aplique prompts/00-protocolo.md e leia core/09-external-changes.md e references/vortex/VORTEX-08-external-changes.md.

Implemente scan, classificação e reconciliation. Nunca transforme mudança externa em sucesso silencioso.
```

## F11 — UI foundation

```text
Aplique prompts/00-protocolo.md e leia ui/00-plano-interface-v2.md, ui/01-mapa-de-telas.md e ui/03-componentes-e-padroes.md.

Instale e use dettmann-ui. Crie shell, sidebar, topbar, theme dark/green 60/30/10 e navegação baseada em capability.

Não crie componentes paralelos ao design system.
```

## F12 — UI workspace

```text
Aplique prompts/00-protocolo.md e leia todo o plano de UI e references/vortex/VORTEX-01-shell-e-navegacao.md até VORTEX-07-profiles.md.

Implemente Overview, Mods, Profiles, Conflicts, Plugins, Load Order e Diagnostics.

Priorize UX de triagem e painel lateral de detalhes.
```

## F13 — UX operations

```text
Aplique prompts/00-protocolo.md e leia ui/02-fluxos-ux.md.

Implemente wizards, modals, progress, batch actions e fluxos de erro. Cada operação deve terminar com resultado e revalidação.
```

## F14 — Hardening

```text
Aplique prompts/00-protocolo.md.

Faça testes de interrupção, corrupção, permissões, arquivos externos, volume diferente, paths perigosos e migrations. Não adicione feature nova.
```
