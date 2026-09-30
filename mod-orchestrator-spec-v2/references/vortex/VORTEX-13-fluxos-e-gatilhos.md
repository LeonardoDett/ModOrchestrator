# VORTEX-13 — Fluxos e gatilhos (cadeia de eventos)

Como uma ação no Vortex dispara outras, e qual setting controla cada elo. Serve para garantir que o Mod Orchestrator tenha cada elo, com a mudança documentada quando divergir.

Fontes: comportamento das extensões `mod_management` (InstallManager, modActivation, eventHandlers, preStartDeployHook, LinkingDeployment), `gamebryo_plugin_management` (autosort, deployWatcher, pluginSync), `mod-dependency-manager`, `profile_management`, textos de Settings (consultados em 2026-09-30).

## 1. Instalação

```
Install From File / drop
  └─ InstallManager: detecta jogo → escolhe instalador (testSupported por prioridade)
       ├─ FOMOD → diálogo de passos → instruções
       ├─ instalador de extensão (ex.: SKSE) → instruções
       └─ básico → instruções (copiar arquivos)
  └─ checa duplicado/variante (DuplicatesDialog)
  └─ extrai para a staging, grava mod
  └─ [setting "Enable Mods when installed"] habilita no profile ativo
       └─ [setting "Deploy Mods when Enabled"] agenda deploy
  └─ regras do mod (requires) → notificação de dependências
  └─ conflitos novos → notificação "file conflicts"
```
**Mod Orchestrator:** mesma cadeia (core/02, 03), com fila visível, root ambíguo como decisão, e conflito como informação (D027).

## 2. Habilitar/desabilitar

```
toggle
  └─ grava estado no profile
  └─ recalcula conflitos/regras → notificações
  └─ [Deploy Mods when Enabled] deploy automático
       └─ Gamebryo: deploy terminou → plugins novos detectados (deployWatcher)
            └─ [autosort] LOOT ordena → escreve plugins.txt
```
**Mod Orchestrator:** igual, com deploy por diff e auto-deploy que para em decisão (D036); plugins novos ativados conforme `plugins.enableOnModEnable`; sort nativo (D041).

## 3. Deploy

```
Deploy (manual ou automático)
  └─ evento will-deploy (extensões preparam: ex. FNIS)
  └─ para cada tipo de mod/target: calcula arquivos a implantar (regras + overrides)
  └─ compara com o manifesto anterior (vortex.deployment.json)
       └─ divergências → ExternalChangeDialog (manter / reverter por arquivo)
  └─ aplica links; arquivos originais → .vortex_backup
  └─ grava manifesto no target
  └─ evento did-deploy (extensões: load order, INIs, checagens)
  └─ [Clean up empty directories] remove pastas vazias
```
**Mod Orchestrator:** plano explícito, journal, verificação, backups fora do jogo, marcador próprio, pós-deploy do adapter (core/04 §5).

## 4. Purge

```
Purge → will-purge → remove links do manifesto → restaura .vortex_backup → did-purge
```
Disparado por: usuário, troca de profile (purge + deploy), troca de staging/método, parar de gerenciar.
**Mod Orchestrator:** troca de profile não faz purge (D033); o resto igual.

## 5. Troca de profile

```
ativar profile
  └─ purge do profile anterior
  └─ troca INIs/saves (se o profile tem features locais)
  └─ deploy do novo
  └─ plugins.txt do novo
```
**Mod Orchestrator:** deploy por diff; INIs/saves e `plugins.txt` aplicados no pós-deploy (core/07 §4).

## 6. Lançar o jogo

```
Play (titlebar/starter)
  └─ preStartDeployHook: se deploy pendente, deploy
  └─ checagens (script extender, etc.)
  └─ lança (ferramenta primária)
  └─ ao fechar: new-file-monitor verifica arquivos novos → oferece incluir em mod
```
**Mod Orchestrator:** core/04 §9, core/09 (captura).

## 7. Arquivo de load order alterado fora

```
plugins.txt muda (outra ferramenta, launcher)
  └─ pluginSync lê de volta e atualiza estado
```
**Mod Orchestrator:** ADAPT: não aceita automaticamente; vira ExternalChange `load_order` com triagem (D040).

## 8. Remoção de mod

```
Remove → (opção: remover archive) → desabilita em todos os profiles → deploy → apaga pasta da staging
```
**Mod Orchestrator:** core/02 §7 (regras órfãs sinalizadas).

## 9. Inicialização

```
abre → carrega estado → recupera de backup se corrompido → descoberta rápida de jogos → checagens (health) → notificações pendentes
```
**Mod Orchestrator:** + operações interrompidas → `interrupted`; journal → `deploy_interrupted`; limpeza de temporários (core/14 §5).
