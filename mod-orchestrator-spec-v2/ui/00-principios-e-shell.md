# UI: princípios e shell

Referências: D014, D015, D016, D021, D037, D042–D045; `references/vortex/VORTEX-01-shell-e-navegacao.md`, `VORTEX-12-feature-inventory.md`.

## 1. Princípios

1. **Vortex é o layout base (D042).** Onde o Vortex já resolveu um problema de interface, reproduzimos a distribuição de elementos e o tipo de controle (select é select, modal é modal, barra de multi-seleção é barra de multi-seleção). Só divergimos com entrada em §6.
2. **Triagem primeiro (D014).** Em cada tela, o que impede o setup de funcionar aparece antes do resto (faixa de problemas, badges, contadores).
3. **Simples no dia a dia, profundo sob demanda.** Ações frequentes em um clique; detalhes em painel lateral (Inspector); opções avançadas sob "Modo avançado".
4. **A UI não decide (anti-pattern 1).** Toda regra (o que está habilitado, quem vence, o que bloqueia, que ações existem) vem do backend como dado. A UI desabilita ações que o backend marcou como indisponíveis e mostra o motivo que ele enviou.
5. **Estado vem do backend (D021).** Após comando, a tela relê a consulta; não existe atualização otimista de estado de domínio. Feedback imediato (spinner no botão, linha "em progresso") é permitido.
6. **Nada falso (anti-pattern 18).** Recursos futuros não aparecem como ação. O espaço no layout existe; o item não.
7. **Status nunca só por cor (D043).** Ícone + rótulo/tooltip.
8. **Tudo por teclado.** Foco visível, atalhos documentados, tabelas navegáveis por setas.
9. **Textos via i18n (D044).**

## 2. Estrutura do shell (paridade Vortex)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ BARRA DE TÍTULO: [ícone jogo ▾ | ▶ Play ▾]   (área reservada: tools)   ─ □ × │
├──────────────┬────────────────────────────────────────────────────────────────┤
│ SIDEBAR      │ TOPBAR DA PÁGINA: Título · [Profile ▾] · Status deploy ·        │
│              │   (!) problemas · ⟳ operações · 🔔 notificações · ? ajuda       │
│ Dashboard    ├────────────────────────────────────────────────────────────────┤
│ Games        │ TOOLBAR DA PÁGINA (ícone + rótulo, como IconBar do Vortex)      │
│ ─ <Jogo> ─   ├────────────────────────────────────────────────────────────────┤
│  Overview    │                                                  │ INSPECTOR   │
│  Mods        │  CONTEÚDO (tabela/lista/cards)                   │ (painel     │
│  Conflicts   │                                                  │  lateral    │
│  Plugins*    │                                                  │  direito)   │
│  Load Order* │                                                  │             │
│  Profiles    ├──────────────────────────────────────────────────┴─────────────┤
│  Diagnostics │ BARRA DE MULTI-SELEÇÃO (aparece com ≥ 2 selecionados)          │
│ ─────────    ├────────────────────────────────────────────────────────────────┤
│ Extensions   │ DROPZONE (só em Mods)                                           │
│ Settings     │                                                                │
│ [«] recolher │                                                                │
└──────────────┴────────────────────────────────────────────────────────────────┘
* só com capability
```

### 2.1 Barra de título (custom title bar, `ui.customTitleBar`)
- **Lançador** (paridade `titlebar-launcher`): ícone do jogo ativo + select de jogo gerenciado (troca o jogo ativo), botão **Play** (core/11 §6) com menu (lançar sem SKSE, abrir pasta do jogo). Estado: habilitado, "Deploy necessário antes" (Play faz o deploy), bloqueado (tooltip com o diagnóstico).
- Área reservada à direita do lançador para a hotbar de tools (V1.x): vazia na V1.
- Controles da janela.

### 2.2 Sidebar (paridade menu principal do Vortex)
- Seção global superior: **Dashboard**, **Games**.
- Seção do jogo ativo (cabeçalho com nome/ícone do jogo): **Overview**, **Mods**, **Conflicts**, **Plugins**\*, **Load Order**\*, **Profiles**, **Diagnostics**. Itens vêm de consulta do bridge por capability (core/11 §5).
- Seção global inferior: **Extensions**, **Settings**.
- Reservados (não renderizados na V1): Downloads (global, entre o jogo e Extensions, como no Vortex), Collections e Saves (seção do jogo).
- Badges nos itens: Mods (mods em instalação), Conflicts (pares não revisados, se setting ligado), Diagnostics (contagem de `blocking`+`error`), Plugins (erros de plugin).
- Recolhível para só ícones (paridade Vortex); estado lembrado.
- Sem jogo ativo: seção do jogo não aparece (D023).

### 2.3 Topbar da página
- Título da página.
- **Select de profile** (jogo ativo): lista de profiles, "Gerenciar profiles…". Trocar = ativar (core/07 §4).
- **Status de deploy** (core/04 §7) como botão: clique abre popover com resumo do plano e botão Deploy / Revisar / Reconciliar. Quando implantado ≠ ativo: "Implantado: A · Ativo: B".
- **Problemas**: contador de `blocking`/`error` → abre Diagnostics.
- **Operações**: indicador com operações em curso → abre o drawer de operações (lista com progresso por step, cancelar quando permitido, fila de importação).
- **Notificações** (sino, paridade Vortex): popover com lista, ações e "marcar todas como lidas".
- **Ajuda**: atalhos de teclado, abrir log, pacote de diagnóstico, sobre.
- Reservado: conta de provider (V2), à direita, como no Vortex.

### 2.4 Toolbar da página
Botões ícone + rótulo, agrupados, com overflow em menu "…" quando falta espaço (paridade IconBar). Ações indisponíveis aparecem desabilitadas com tooltip do motivo (vindo do backend), nunca escondidas, exceto as que dependem de capability.

### 2.5 Inspector
Painel à direita, redimensionável, aberto ao selecionar **um** item. Com vários selecionados, mostra resumo e ações em lote. Fecha com Esc. Estado aberto/fechado e largura lembrados por tela.

### 2.6 Barra de multi-seleção
Aparece na base do conteúdo com ≥ 2 itens selecionados: "N selecionados" + ações em lote + "Limpar seleção" (paridade Vortex).

## 3. Padrões de interação (resumo; detalhe em `03-componentes-e-padroes.md`)

| Situação | Padrão | Paridade |
|---|---|---|
| Lista densa | tabela virtualizada com filtros por coluna e busca | Vortex tabelas |
| Detalhe de item | Inspector | Vortex details panel |
| Decisão curta/destrutiva | modal de confirmação | Vortex dialogs |
| Processo em etapas | assistente em modal | FOMOD, adicionar jogo |
| Resultado simples | toast | Vortex notifications (transitórias) |
| Problema persistente | diagnóstico + notificação no sino | Vortex notifications persistentes |
| Escolha entre poucos valores fixos | select | Vortex |
| Liga/desliga | switch (settings) / toggle de status (tabela) | Vortex |
| Reordenar | arrastar + "Mover para…" | MO2/Vortex FBLO |

## 4. Estados de página

Toda tela define: **carregando** (skeleton), **vazio** (próximo passo claro), **sem jogo** (quando depende de jogo), **offline** (fora do Wails, D021), **erro de consulta** (mensagem + tentar de novo), **ocupado** (operação mutante em curso na instância: ações mutantes desabilitadas com o nome da operação).

## 5. Atalhos globais

`Ctrl+K` paleta de comandos · `Ctrl+I` importar · `Ctrl+D` deploy · `Ctrl+F` busca da tela · `Ctrl+1..7` itens do workspace · `F5` reler tela · `Esc` fecha inspector/modal · `Delete` remover selecionados (com confirmação) · `Espaço` alterna habilitado na linha focada.

## 6. Divergências aprovadas em relação ao Vortex

| # | Divergência | Motivo | Decisão |
|---|---|---|---|
| 1 | Tela **Conflicts** dedicada (o Vortex usa só diálogos por mod). Os diálogos por mod também existem. | Pedido do usuário; visão geral de conflitos é o maior gap do Vortex. | D042 |
| 2 | **Load Order** separada de **Plugins** para jogos com plugins (o Vortex junta em Plugins). | Pedido do usuário; inventário ≠ ordem. | D042 |
| 3 | Tela **Diagnostics** (o Vortex espalha em notificações, Health Check e diálogos). | Modelo único de triagem (core/10). | D042 |
| 4 | **Profiles** sempre visível; select de profile na topbar. | D037; troca rápida é uso frequente. | D037/D042 |
| 5 | **Overview** do jogo (o Vortex não tem). | Contexto do workspace e triagem por jogo. | D042 |
| 6 | Tabela de Mods com coluna **Prioridade** e arrastar para ordenar; separadores. | Modelo híbrido. | D025 |
| 7 | Linguagem "X vence Y" no lugar de "load before/after" para mods. | Clareza. | D025 |
| 8 | Plano de deploy inspecionável antes de aplicar. | Transparência. | D036 |
| 9 | Settings sem "Enable Profile Management" e sem aba Download na V1. | D037, D013. | — |

Qualquer outra diferença de distribuição é bug de UI ou exige nova linha aqui com decisão.
