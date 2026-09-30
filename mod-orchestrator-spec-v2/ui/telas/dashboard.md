# Tela: Dashboard

Core: 10. Vortex: Dashboard com dashlets (`starter_dashlet`, `onboarding_dashlet`/`firststeps_dashlet`, `RecentlyManagedDashlet`, `news_dashlet`, `changelog-dashlet`, `extension-dashlet`), modo de edição para mostrar/ocultar/reordenar.

## 1. Objetivo

Ponto de partida global: o que precisa de atenção em qualquer jogo, o que foi feito recentemente e atalhos para continuar. Centro de triagem, não painel de métricas.

## 2. Dashlets V1

| Dashlet | Conteúdo | Paridade |
|---|---|---|
| **Primeiros passos** | checklist: gerenciar jogo, importar mod, deploy, jogar; some quando completo (reativável) | onboarding |
| **Precisa de atenção** | diagnósticos `blocking`/`error`/`warning` de todas as instâncias, agrupados por jogo, com ação principal | health check |
| **Jogos recentes** | últimos jogos gerenciados/usados com Ativar e Play | RecentlyManagedDashlet |
| **Status do jogo ativo** | profile, status de deploy, mods habilitados/total, conflitos não revisados, botão Deploy/Play | — |
| **Operações recentes** | últimas operações com resultado; link para Histórico | — |
| **Novidades do app** | changelog da versão instalada (local, sem rede) | changelog-dashlet |

Reservados (não renderizados): Ferramentas (Starter, V1.x), Notícias/Mods em destaque (V2, dependem de provider).

## 3. Layout e personalização

Grid responsivo de Cards; "Personalizar" (toolbar) liga modo de edição: ocultar/mostrar, reordenar por arrastar; persistido em `ui.dashboard.dashlets`. "Precisa de atenção" não pode ser ocultado quando há `blocking`.

## 4. Estados

Sem jogos: só "Primeiros passos" e "Novidades". Sem problemas: "Precisa de atenção" mostra estado positivo compacto.

## 5. Critérios de aceite

- Um problema bloqueante em qualquer jogo aparece aqui com ação que resolve ou leva ao lugar certo.
- Dashboard nunca mostra dado inventado (offline: estado explícito, D021).
