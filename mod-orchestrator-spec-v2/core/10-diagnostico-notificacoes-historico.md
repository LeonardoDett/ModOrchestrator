# Diagnóstico, notificações, histórico e logs

Referências: D014, D020, D027, D044, D082 (mecânica da F9), D084 (proposta); INV-OPS-05/06. Vortex: `health_check`, notificações com ações e "never show again", `history_management` (HistoryDialog), `diagnostics_files`, `support_bundle`, `NotificationAggregator`. MO2: botão Problems.

Quatro conceitos separados, que **não se substituem**:

| Conceito | Pergunta que responde | Vida | Persistência |
|---|---|---|---|
| Diagnostic | "O que está errado agora e o que eu faço?" | existe enquanto o fato existir | derivado; supressões persistidas |
| Notification | "O que aconteceu que eu deveria saber?" | até ser lida/dispensada | persistida |
| HistoryEntry | "O que foi feito, quando e por quem?" | permanente (retenção) | projeção de Events |
| Log técnico | "O que o programa fez em detalhe?" | rotativo | arquivo |

## 1. Health checks

Um HealthCheck tem ID estável, escopo (app / instância / profile), gatilhos (eventos que o invalidam) e uma função pura `fatos → diagnósticos[]`. Rodam no backend após os gatilhos e em `preflight`s. O conjunto atual de diagnósticos é recalculado, não acumulado.

### 1.1 Catálogo V1

Severidade no modelo é `error` / `warning` / `info`, mais a lista `blocks[]` de operações impedidas (core/01). Na tabela e na UI, **blocking** = `error` com `blocks` não vazio; a coluna "Bloqueia" é o conteúdo de `blocks`.

| checkId | Severidade | Bloqueia | Módulo | Ação principal |
|---|---|---|---|---|
| `staging_missing` | blocking | deploy | deployment | Localizar staging / Settings |
| `staging_foreign` | blocking | deploy | deployment | Detalhes |
| `foreign_deployment` | blocking | deploy, launch | deployment | Guia de remoção / Verificar de novo / Adotar |
| `deploy_interrupted` | blocking | deploy | deployment | Reconciliar agora |
| `deploy_pending` | info | — | deployment | Deploy |
| `deploy_needs_decision` | warning | — | deployment | Revisar plano |
| `deploy_failed` | error | — | deployment | Ver falhas / Tentar novamente |
| `method_unavailable` | error | deploy | deployment | Settings › Mods |
| `external_changes_pending` | warning | deploy dos caminhos afetados | external | Revisar |
| `load_order_external_change` | warning | apply da load order | plugins | Revisar |
| `rule_cycle` | blocking | reorder, deploy | rules | Resolver ciclo |
| `mods_incompatible` | error | deploy | rules | Desabilitar A / B |
| `mod_requirement_missing` | error | — | rules | Habilitar / Importar |
| `mod_recommendation_missing` | info | — | rules | — |
| `rule_orphan` | warning | — | rules | Remover regra |
| `override_stale` | warning | — | conflicts | Reescolher / Remover |
| `conflicts_unreviewed` | info | — | conflicts | Abrir Conflicts |
| `mod_fully_overwritten` | info | — | conflicts | Ver conflitos do mod |
| `staging_file_missing` / `staging_file_modified` | warning | — | library | Reinstalar / Aceitar |
| `mod_archive_missing` | info | — | library | Reimportar |
| `installer_required` | warning | — | library | Continuar instalação |
| `plugin_missing_master` | error | launch (aviso) | plugins | Mostrar fornecedor / Desativar |
| `plugin_limit_exceeded` | error | launch (aviso) | plugins | Abrir Plugins |
| `plugin_disabled_master` | warning | — | plugins | Ativar master |
| `plugin_header_unreadable` | warning | — | plugins | Abrir pasta |
| `plugin_master_order` | error | — (só ordem externa) | plugins | Revisar |
| `plugin_rule_orphan` | warning | — | plugins | Remover regra / Abrir regras |
| `plugin_rule_cycle` | error | sort de plugins | plugins | Abrir regras |
| `plugin_lock_conflict` | warning | — | plugins | Abrir Load Order |
| `plugin_from_losing_file` | info | — | plugins | Abrir Conflicts |
| `bsa_without_plugin` (adapter) | info | — | plugins | Abrir Plugins |
| `game_not_found` | blocking | tudo da instância | games | Localizar jogo |
| `game_version_changed` | warning | — | games/adapter | Detalhes |
| `game_running` | blocking | deploy, purge | games | Aguardar |
| `framework_missing` (adapter, ex.: SKSE) | error | launch (aviso) | adapter | Importar framework |
| `disk_space_low` | warning | — | app | Abrir pasta |
| `backup_failed` | warning | — | app | Detalhes |

Novos checks exigem entrada nesta tabela (mapa de impacto).

### 1.2 Diagnostic
Campos em core/01. Regras:
- `key = checkId + subject` estável; permite supressão e "novo desde".
- `evidence`: fatos verificáveis (caminhos, nomes de mods/plugins, regras) como dados, nunca texto livre montado no backend.
- `actions`: `{id, params, navigateTo?}`; a UI renderiza o rótulo pelo catálogo i18n e executa o comando do bridge. Todo `blocking`/`error` tem pelo menos uma ação que resolve ou leva ao lugar certo (INV-OPS-06).
- Supressão ("Não mostrar de novo" / "Ignorar este") por `key` ou por `checkId` inteiro; `blocking` não pode ser suprimido. Settings › Interface › "Redefinir notificações suprimidas" (paridade Vortex, com contagem).

## 2. Notificações

- Geradas quando: um diagnóstico `warning+` aparece pela primeira vez (não a cada recálculo); uma operação termina (sucesso relevante, falha, cancelada); o sistema fez algo automático que o usuário deve saber (auto-sort moveu plugins, auto-deploy bloqueado).
- Agregação: notificações do mesmo tipo em curto intervalo viram uma ("12 mods instalados"), paridade `NotificationAggregator`.
- Canais: toast (transitório, só sucesso/info e falhas com link), central de notificações (sino na topbar, lista com lida/não lida, ações), notificação de desktop do Windows (setting, desligada por padrão; só para operações longas concluídas com o app em segundo plano).
- Um problema persistente nunca é comunicado só por toast (anti-pattern 37).

## 3. Histórico

- Projeção legível de Events: quem (usuário/sistema/auto), o quê, alvo, quando, profile, operação.
- Filtros: jogo, profile, mod, tipo de ação, período, origem (usuário/automático).
- **Reversível** quando a ação é puramente de estado desejado e o inverso é seguro: habilitar/desabilitar, mudança de ordem, regra criada/removida, override, troca de profile ativo, mudança de atributo. A reversão é um novo comando (gera nova entrada), nunca apaga histórico. Ações de filesystem (install, deploy, purge, captura) não são reversíveis pelo histórico; a UI oferece a ação oposta quando fizer sentido (ex.: remover mod instalado).
- Acesso: tela Diagnostics › aba Histórico, botão "Histórico" na toolbar de Mods (paridade Vortex) filtrado por mod selecionado, aba Histórico no inspector do mod.
- Retenção: 180 dias (setting).

## 4. Log técnico

- Arquivo rotativo no diretório de dados (`logs/`, 10 arquivos × 10 MB), JSON por linha: timestamp, nível, operação, step, instância, entidade, mensagem, erro, campos.
- Nível configurável (Settings › Aplicação). Sem dados pessoais além de caminhos locais.
- Visualizador na tela Diagnostics › aba Log (LogViewer da dettmann-ui) com filtro por nível/operação e "Abrir pasta de logs".
- **Pacote de diagnóstico**: exporta zip com logs, versão, lista de mods (nome, versão, habilitado, prioridade), load order, diagnósticos ativos, resumo de settings (sem caminhos do usuário se o setting "anonimizar caminhos" estiver ligado). Paridade `support_bundle`/`diagnostics_files`.

## 5. Critérios de aceite

- Resolver a causa de um diagnóstico faz ele sumir sem ação extra do usuário.
- Todo diagnóstico `blocking`/`error` do catálogo tem ação testada.
- Suprimir um `warning` o esconde de Dashboard, badge e notificações, e aparece em "suprimidos" com opção de reativar.
- Reverter "habilitar mod X" pelo histórico desabilita X e cria nova entrada.
- Nenhum texto de diagnóstico vem pronto do backend (só código + parâmetros).
