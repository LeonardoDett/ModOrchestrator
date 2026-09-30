# Fluxos de UX

Cada fluxo lista os passos do usuário, o que o sistema faz, e onde cada decisão aparece. Os nomes de diálogos referem-se a `telas/dialogos.md`.

## F-01 Primeira execução

1. App abre no Dashboard com o dashlet "Primeiros passos" (paridade `onboarding_dashlet`/`firststeps_dashlet`): Gerenciar um jogo → Importar o primeiro mod → Fazer deploy → Jogar.
2. Busca rápida de jogos roda em segundo plano; jogos encontrados aparecem em Games › Descobertos e no dashlet.
3. "Gerenciar" abre o assistente **Gerenciar jogo** (core/11 §4).
4. Ao concluir: jogo ativo, workspace aberto em Overview, checklist atualizado.

## F-02 Importar mods

1. Mods › "Importar arquivo" (ou arrastar para a dropzone/tabela, ou `Ctrl+I`). Vários arquivos formam fila visível no drawer de operações.
2. Para cada item, o backend decide o instalador. Sem decisão necessária: instala direto; linha aparece "Instalando…" e depois habilitada (setting padrão).
3. Decisão necessária abre o diálogo correspondente, um por vez, sem bloquear o resto da UI:
   - **Duplicado** (core/02 §6);
   - **Preparar instalação** (root ambíguo / nada reconhecido);
   - **Assistente FOMOD**.
4. Resultado: toast agregado ("5 mods instalados, 1 aguardando escolha"), conflitos novos sinalizados na linha e no badge de Conflicts, auto-deploy agendado.
5. Falha: linha fica "Não instalado" com o erro no Inspector e ação "Tentar de novo".

## F-03 Habilitar / desabilitar

1. Toggle na linha (ou `Espaço`, ou multi-seleção).
2. Backend atualiza o profile, recalcula conflitos e diagnósticos.
3. Se o mod requer mods desabilitados: toast com ação "Também habilitar X, Y" (core/06 §6).
4. Auto-deploy (se ligado) ou status "Deploy pendente".

## F-04 Ordenar mods

1. Mods ordenados por Prioridade; arrastar linha(s) ou "Mover para…".
2. Posição válida: aplica. Inválida: popover com as regras violadas e botões "Posição válida mais próxima" / "Mover e remover regra(s)" / Cancelar.
3. Histórico registra; `Ctrl+Z` desfaz a última mudança de ordem (usa reversão do histórico).

## F-05 Revisar conflito e escolher vencedor

1. Sinal: ícone de conflito na linha do mod, badge em Conflicts, diagnóstico informativo.
2. Caminho rápido (paridade Vortex): ícone de conflito na linha → **Editor de conflitos do mod**: lista de mods em conflito com select por mod ("Este vence" / "Aquele vence" / "Sem regra (decidido pela ordem)").
3. Caminho completo: tela Conflicts → par → árvore de arquivos → select de vencedor por arquivo ou por pasta.
4. Salvar cria OrderRule e/ou FileOverrides, marca o par como revisado, recalcula; auto-deploy.

## F-06 Deploy

1. Automático após mudanças, ou botão Deploy (toolbar de Mods, popover de status, `Ctrl+D`).
2. Sem decisões: progresso no indicador de operações; toast final com contagens.
3. Com decisões: diálogo **Plano de deploy** (resumo + itens que precisam de decisão); external changes abrem o diálogo **Alterações externas**.
4. Falha parcial: toast de erro com "Ver detalhes" → diálogo de resultado com Locations e motivo, "Tentar novamente".

## F-07 Purge

1. Toolbar de Mods › Purge. Confirmação curta explicando que mods não são desinstalados.
2. External changes durante o purge: diálogo **Alterações externas**.
3. Resultado: status "Não implantado".

## F-08 Trocar profile

1. Select de profile na topbar (ou Profiles › Ativar).
2. Backend ativa; tela atual relê; status "Deploy pendente" ou auto-deploy por diff.
3. Topbar mostra "Implantado: A · Ativo: B" até o deploy terminar.

## F-09 Alteração externa detectada fora de deploy

1. Ao focar o app, scan leve detecta divergência.
2. Diagnóstico `external_changes_pending` + notificação no sino.
3. "Revisar" abre o diálogo **Alterações externas** em modo avulso; "Aplicar decisões" executa só as ações escolhidas (operação própria).

## F-10 Ferramenta gerou arquivos

1. Após usar Nemesis/BodySlide fora do app, o scan encontra `unexpected` nas saídas conhecidas.
2. Diálogo agrupado por pasta: "Capturar para mod novo 'Gerados — Nemesis'" é a ação destacada (não pré-selecionada).
3. Captura → mod novo no fim da ordem → deploy reimplanta como links.

## F-11 Problema de plugin

1. Plugin com master faltando: badge em Plugins, erro na linha, diagnóstico.
2. Inspector do plugin lista masters com estado; ação "Ativar master" ou "Mostrar mod que fornece" ou "Desativar plugin".
3. Revalidação imediata.

## F-12 Lançar o jogo

1. Play na barra de título.
2. Deploy pendente: executa (com diálogo se houver decisões).
3. Bloqueios: modal com diagnóstico e ações; avisos (master faltando, SKSE ausente): modal com "Lançar mesmo assim".
4. Jogo em execução: Play vira "Em execução"; deploy/purge desabilitados com motivo.

## F-13 Recuperação após fechamento inesperado

1. Ao abrir: se havia deploy em curso, faixa bloqueante no Dashboard/Overview: "O último deploy foi interrompido" + "Reconciliar agora".
2. Reconciliar roda deploy normal; resultado explicado.

## F-14 Falha genérica

Toda falha segue: `evento → diagnóstico (se persistente) ou toast (se transitória) → evidência → impacto → ação recomendada → execução → revalidação`. A UI nunca mostra mensagem técnica crua como texto principal; o detalhe técnico fica em "Detalhes" (copiável).
