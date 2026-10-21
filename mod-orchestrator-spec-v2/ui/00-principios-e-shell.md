# UI: princípios e shell

Referências: D014, D015, D016, D021, D037, D043–D045, D112, D115, **D119, D120, D121**; design v1 em `propostas/redesign-telas-v1-fechamento.md` (canvas "Redesign das telas do Mod Orchestrator"); plano em `propostas/2026-10-14-plano-implementacao-redesign.md`.

> O `frontend/` segue esta casca desde a fase RD4 do plano (2026-10-14). As telas dentro dela continuam as anteriores até a fase de cada uma; a descrição do shell antigo está no histórico do git e na D054.

## 1. Princípios

1. **O design v1 é o layout base (D119).** A distribuição de telas e elementos segue os artboards aprovados, transcritos em `ui/telas/`. O Vortex continua sendo referência de fluxo e comportamento (D001), não de layout. Tela sem artboard aprovado mantém o layout atual dentro da casca nova; tela nova sem artboard não é implementada.
2. **Triagem primeiro (D014).** O que impede o setup de funcionar aparece antes do resto: contagem no sino, selo no item do menu, faixa de problemas na tela.
3. **Simples no dia a dia, profundo sob demanda.** Ações frequentes em um clique; o detalhe de um item abre sem sair da tela (modal com abas para o mod, D121; painel lateral onde o artboard mostra painel); opções avançadas sob "Modo avançado".
4. **A UI não decide (anti-pattern 1).** Toda regra (o que está habilitado, quem vence, o que bloqueia, que ações, menus, abas e seções existem) vem do backend como dado. A UI desabilita o que o backend marcou como indisponível e mostra o motivo que ele enviou. Nenhuma tela testa capability por conta própria (D112, D115).
5. **Estado vem do backend (D021).** Após comando, a tela relê a consulta; não existe atualização otimista de estado de domínio. Feedback imediato (spinner no botão, linha "em progresso") é permitido.
6. **Nada falso (anti-pattern 18).** Recurso futuro não aparece como ação nem como item de menu. O que o design mostra e o backend não entrega não vira dado inventado: ou entra como fase com contrato, ou sai da tela (D119).
7. **Status nunca só por cor (D043).** Ícone + rótulo ou dica. Vale também para a cor de destaque do jogo (§2.5).
8. **Tudo por teclado.** Foco visível, atalhos documentados, tabelas navegáveis por setas; botão só com ícone tem nome acessível e dica obrigatória.
9. **Textos via i18n (D044).**

## 2. Estrutura: dois níveis (D120)

O app tem dois níveis. No primeiro o usuário escolhe o jogo e vê o que pede atenção em qualquer jogo. Ao entrar num jogo, a janela inteira passa a ser o espaço daquele jogo: barra superior, menu lateral e cor de destaque mudam.

### 2.1 Nível do app

Vale para todos os jogos e usa a cor da marca do app.

| Item | Conteúdo | Documento |
|---|---|---|
| **Início** | O que pede atenção em qualquer jogo e o que foi feito por último | `telas/dashboard.md` |
| **Biblioteca** | Jogos gerenciados: entrar, jogar, adicionar e ver os detectados | `telas/games.md` |
| **Adicionar jogo** (a partir da Biblioteca) | Suportados, personalizados, pasta; importar de outro gerenciador | `telas/games.md`, `telas/dialogos.md` |
| **Extensões** | Lista do suporte embutido | `telas/settings-extensions.md` |
| **Configurações** | Preferências do app; as do jogo ficam dentro do jogo | `telas/settings-extensions.md` |

Casca do nível do app: barra superior com o logo, o sino e a ajuda (sem seletor de jogo); menu lateral com Início e Biblioteca, um grupo "Entrar direto" com os jogos fixados (cada um com selo de problemas), Extensões e Configurações no rodapé, e a versão do app.

Reservado, não renderizado: Downloads (V2).

### 2.2 Espaço do jogo

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ BARRA SUPERIOR: [‹ Biblioteca] │ [ícone Jogo ▾] [Perfil ▾]      🔔n  ?   ─ □ × │
├───────────────┬────────────────────────────────────────────────────────────────┤
│ MENU       [«]│ CABEÇALHO DA PÁGINA: Título · chips de número · ações           │
│               ├────────────────────────────────────────────────────────────────┤
│ Visão geral   │                                                                │
│ ─ Conteúdo ─  │  CONTEÚDO (tabela, lista ou cartões)                            │
│  Mods         │                                                                │
│  Plugins*     │                                                                │
│  Ordem carga* │                                                                │
│  Conflitos    ├────────────────────────────────────────────────────────────────┤
│ ─ Setup ─     │ BARRA DE AÇÃO EM LOTE (com seleção ou alterações não salvas)    │
│  Perfis       │                                                                │
│ ─ Saúde ─     │                                                                │
│  Diagnóstico  │                                                                │
│               │                                                                │
│ [Implantando] │                                                                │
│ [▶ Jogar]     │                                                                │
└───────────────┴────────────────────────────────────────────────────────────────┘
* só com a capability efetiva
```

#### Barra superior
- **‹ Biblioteca**: volta ao nível do app.
- **Seletor de jogo**: ícone e nome do jogo ativo; troca o jogo sem passar pela Biblioteca.
- **Seletor de perfil**: perfis da instância e "Gerenciar perfis…". Trocar é ativar (core/07 §4).
- **Notificações**: sino com contagem. Substitui o indicador de status de deploy, o contador de problemas e o indicador de operações que ficavam na topbar: o que aparecia neles chega como notificação ou como estado do cartão de implantação (§ Menu lateral). O painel aberto segue `JogoNotificacoes` (RD17a): 440 px, cabeçalho com "N não lidas" e "Marcar todas como lidas"; filtro Todas, Não lidas e Pedem ação; cada linha com o ponto de não lida, a marca da gravidade (problema) ou do resultado (operação concluída, cancelada, com falha), título, detalhe, a ação da linha ("Ver o problema", "Ver a operação", "Ver a atualização"; operação concluída não tem ação), a idade e "Dispensar"; rodapé com "Ver todos os problemas no Diagnóstico" e "Limpar lidas". "Pedem ação" são as linhas com ação.
- **Ajuda**: atalhos de teclado, abrir log, pacote de diagnóstico, sobre.
- **Controles da janela**, quando a janela é sem moldura (`ui.customTitleBar`).
- Sem campo de busca e sem botão "Jogar": a busca é da tela (`Ctrl+F`) e da paleta (`Ctrl+K`, §5); o "Jogar" fica no rodapé do menu.
- Reservado: conta de provider (V2).

#### Menu lateral
- Cabeçalho "Menu" com o botão de recolher.
- **Grupos e itens vêm do backend** (consulta do workspace), montados pelas capabilities **efetivas** da instância (D115). Grupo sem item não aparece.

  | Grupo | Itens | Condição |
  |---|---|---|
  | (entrada) | Visão geral | sempre |
  | Conteúdo | Mods | sempre |
  | Conteúdo | Plugins | `plugins` efetiva |
  | Conteúdo | Ordem de carga | `load_order` efetiva |
  | Conteúdo | Conflitos | sempre |
  | Setup | Perfis | sempre |
  | Saúde | Diagnóstico | sempre |

  Saves (`save_games`) aparece no grupo Setup desde a D142. Reservados, não renderizados: Configurações do jogo (`game_settings`), Ferramentas (`tools`), Descobrir mods, Downloads do jogo, Coleções, Inspetor de assets e itens de extensões.
- **Selos**: contagem por item, enviada pelo backend (Plugins: erros de plugin; Conflitos: pares a decidir; Diagnóstico: `blocking` + `error`; Mods: em instalação).
- **Item em atenção**: Conflitos fica em âmbar com selo preenchido quando há pendência. O nível de atenção vem com o item; a UI não o deduz da contagem.
- **Rodapé**: cartão **"Implantando"** com progresso enquanto há deploy em curso, preso acima do botão **Jogar**. O botão segue core/11 §6 (habilitado; "deploy necessário antes", quando ele mesmo implanta; bloqueado com o diagnóstico na dica) e só existe com `launch` efetiva. O cartão de implantação não depende de `launch`.
- **Recolhido**: trilho de 60 px só com ícones, dica ao passar o mouse com nome e contagem, selos mantidos, anel de progresso da implantação e "Jogar" como ícone. O estado é lembrado (estado de apresentação, no navegador).
- **Ajustes da instância** (recursos ligáveis, D115) pertence ao espaço do jogo; o item entra no menu na RD13, junto com a tela (até lá não aparece: nada falso). As pranchas divergiam sobre onde fica o Diagnóstico; ficou no grupo Saúde.
- O "Jogar" aparece desabilitado com o motivo quando o backend diz que não há como lançar (jogo sem executável); some de vez quando `launch` não é efetiva.

#### Cabeçalho da página
Título, chips de número com ícone ("142 de 380 ativos") e ações. A ação principal da tela é o único botão preenchido; as demais são botões só com ícone, com dica obrigatória e, quando faz sentido, selo ou progresso. Ação indisponível aparece desabilitada com o motivo vindo do backend, nunca escondida, exceto as que dependem de capability.

#### Detalhe de item
- **Mod**: modal grande com abas (Resumo, Conflitos, Arquivos, Histórico, Instalação), D121. Esc fecha e devolve o foco à linha.
- Demais telas: painel lateral quando o artboard mostra painel (Plugins, Ordem de carga, Diagnóstico); nas telas ainda sem artboard, o Inspector atual.

#### Barra de ação em lote
Na base do conteúdo, com dois ou mais itens selecionados ("N selecionados" + ações + "Limpar seleção") ou com alterações ainda não salvas (rodapé de Conflitos).

### 2.3 Sem jogo
Sem jogo gerenciado só existe o nível do app. O espaço do jogo nunca é mostrado vazio (D023).

### 2.4 Variação por jogo
`JogoGenerico` é o artboard de referência do jogo com menos capacidades: mesmo shell, menos itens no menu e menos blocos na Visão geral. Toda tela nova define como fica sem cada capability de que depende (D112).

### 2.5 Cor de destaque do jogo
No espaço do jogo a cor de destaque é a do jogo, declarada na definição do jogo, com padrão do app para quem não declara. No nível do app vale a cor da marca. O destaque é um papel a mais no tema da dettmann-ui (D043); o contrato e o cálculo de contraste são registrados com o componente de tema, na fase RD2 do plano.

## 3. Padrões de interação (resumo; detalhe em `03-componentes-e-padroes.md`)

| Situação | Padrão |
|---|---|
| Lista densa | tabela virtualizada com filtros e busca |
| Detalhe de um mod | modal grande com abas |
| Detalhe em telas com painel | painel lateral |
| Decisão curta ou destrutiva | modal de confirmação |
| Processo em etapas | assistente em modal (FOMOD, adicionar jogo, importar) |
| Resultado simples | toast |
| Problema persistente | diagnóstico + notificação no sino |
| Escolha entre poucos valores fixos | select, ou controle segmentado quando são visões da mesma lista |
| Liga/desliga | switch (ajustes) / toggle de status (tabela) |
| Reordenar | arrastar + "Mover para…" |

## 4. Estados de página

Toda tela define: **carregando** (skeleton), **vazio** (próximo passo claro), **sem jogo** (quando depende de jogo), **não disponível neste jogo** (rota de tela cuja capability não está efetiva), **offline** (fora do Wails, D021), **erro de consulta** (mensagem + tentar de novo), **ocupado** (operação mutante em curso na instância: ações mutantes desabilitadas com o nome da operação).

## 5. Atalhos globais

`Ctrl+K` paleta de comandos · `Ctrl+I` importar · `Ctrl+D` deploy · `Ctrl+F` busca da tela · `Ctrl+1..7` itens do menu do jogo · `F5` reler tela · `Esc` fecha modal ou painel · `Delete` remover selecionados (com confirmação) · `Espaço` alterna habilitado na linha focada.

A paleta de comandos é aberta também por um botão só com ícone na barra superior, com a dica do atalho (resposta do usuário em 2026-10-14; o artboard é ajustado na RD4).

## 6. Relação com o Vortex e o MO2

A tabela "Divergências aprovadas em relação ao Vortex", que existia aqui pela D042, deixou de valer com a D119: diferença de layout em relação ao Vortex não precisa mais de justificativa. O que continua valendo das duas referências:

- **Vortex (D001):** fluxos e comportamento (deploy e purge, regras, triagem de alterações externas, notificações, extensibilidade). `references/vortex/` segue como fonte para esses assuntos.
- **MO2 (D002):** isolamento da biblioteca e clareza de prioridade ("quem está mais abaixo vence").

As escolhas de produto que antes apareciam como divergências continuam, cada uma com a sua decisão: tela de Conflitos dedicada e linguagem "X vence Y" (D025, D027), Ordem de carga separada de Plugins, tela de Diagnóstico (core/10), Perfis sempre disponíveis (D037), Visão geral do jogo, plano de deploy inspecionável (D036).
