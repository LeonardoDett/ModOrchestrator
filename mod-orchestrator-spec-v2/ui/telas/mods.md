# Tela: Mods

Redesenho v1 (pranchas `JogoMods`, `JogoModsAninhada`, `JogoModsAbas`, `JogoOrganizacao`, `JogoOrganizacaoTags`, `JogoFilaInstalacao`; RD8, D119, D123, D124). O detalhe do mod (§6) muda para o modal de cinco abas na RD9; até lá vale o Inspector descrito aqui.

Core: 02, 03, 05, 06, 04. Vortex: página Mods (`mod_management/views/ModList`, toolbar, filtros, details panel, multi-select bar, drop zone); `mod-highlight`, `mod-content`, `category_management`, `history_management`. MO2: lista de prioridade com separadores e flags de conflito.

## 1. Objetivo

Responder: quais mods tenho, quais estão habilitados, em que ordem, quem está vencendo quem, o que está com problema, e o que falta implantar. É a tela principal de uso diário.

## 2. Base no Vortex e divergências

Reproduz: toolbar no topo, tabela com filtros por coluna, toggle de status por linha, painel de detalhes à direita, barra de ações de multi-seleção, dropzone na base, histórico e categorias pela toolbar, ações por linha em menu. Divergências: coluna Prioridade + arrastar + separadores (divergência 6), linguagem "vence" (7).

## 3. Layout

```
[título da página: Mods]
[◆ 142 de 380 ativos] [▣ 48 GB em disco]                 (fila ³) (importar) (implantação) (…)  [Adicionar mods]
Faixa "N mods esperam a sua escolha" [Abrir fila]   (só se houver decisão pendente)
Faixa de problemas e de ciclo (como antes)
FilterBar: [busca por nome ou tag] [Todos 380 | Ativos 142 | Desligados 238] [Categoria ▾] [Conflitos ▾]   [Lista | Aninhada | Abas] [Colunas ▾]
(visão Abas) [Todos 380] [▣ Correções 18] [▣ Gráficos 96] … [Sem categoria n]
┌──────────────────────────────────────────────────────────────────────────┬──────────────┐
│ Ativo  #  Mod (nome · tags)            Categoria      Conflitos  Atualizado  Tamanho │  Inspector  │
└──────────────────────────────────────────────────────────────────────────┴──────────────┘
Barra de multi-seleção (≥2) e dropzone compacta, como antes.
```

## 4. Cabeçalho

| Elemento | Comportamento |
|---|---|
| Chip "N de M ativos" | `Indicator variant="chip"`; conta mods instalados e habilitados no perfil ativo sobre o total da lista |
| Chip "tamanho em disco" | soma do tamanho dos mods instalados |
| Fila (ícone com selo) | abre o modal da fila (§5.6); o selo conta operações na fila e mods importados sem instalar; fica `warning` quando alguma pede escolha |
| Importar (ícone, menu) | "De arquivos…" e "De pasta…"; importar de outro gerenciador entra na RD16 |
| Implantação (ícone, menu) | Implantar (desabilitado com o motivo), Prévia, Limpar; o ícone gira enquanto implanta |
| Mais ações (ícone, menu) | Categorias e tags, Regras, Novo separador, Histórico da ordem, Histórico, abrir pastas (jogo, staging, arquivos, mod selecionado). Fica assim até a parte 17b |
| **Adicionar mods** (primário) | seletor de arquivos; o único `high` da região |

Botão só com ícone tem `aria-label`, dica com o mesmo texto e selo decorativo (o nome diz a contagem).

## 5. Tabela

### 5.1 Colunas

| Coluna | Padrão | Conteúdo | Ordenável |
|---|---|---|---|
| Ativo | sim | toggle (habilitado, desabilitado, não instalado, instalando) | sim |
| Prioridade (#) | sim | número; vazio para "não instalado" | sim (padrão) |
| Mod | sim | nome, variante, nota e as tags do mod com a cor da definição (D123); tag sem definição fica sem cor | sim |
| Categoria | sim | selo `Tag` com a cor e o ícone da categoria; último nível ou caminho (`ui.hideTopLevelCategory`) | sim |
| Conflitos | sim | indicador core/05 §5.2; clique abre o editor de conflitos | sim |
| Atualizado | sim | tempo desde a instalação atual ("há 3 dias"); a data completa na dica | sim |
| Tamanho | sim | tamanho instalado | sim |
| Versão, Tipo, Conteúdo, Autor, Instalado em, Habilitado em, Origem, Variante | não | como antes | — |

As tags ficam na mesma linha do nome, porque a linha da `DataTable` tem altura fixa (D-036); a prancha as mostra abaixo do nome.

### 5.1.1 Filtro rápido e busca
- Filtro rápido `SegmentedControl` com contagem: Todos, Ativos, Desligados. "Não instalados" saiu do filtro: eles aparecem em Todos e na fila.
- A busca casa nome, autor, origem e tags. Categoria e Conflitos continuam como selects até a parte 17b.

### 5.1.2 Visões (D123)
- **Lista**: a tabela com prioridade, separadores e arrastar.
- **Aninhada**: a mesma tabela agrupada pela categoria (caminho completo), com grupos que recolhem.
- **Abas**: uma aba por categoria de primeiro nível com ícone, cor e contagem, mais "Todos" e "Sem categoria" (quando houver); a aba filtra a lista. Sem categorias, a tela convida a criar a primeira.
- A visão é a setting de instância `mods.view`, gravada ao trocar. Aninhada e Abas só agrupam a exibição: a prioridade só se arrasta na Lista, e a nota da tabela diz isso.

### 5.2 Ordenação e reordenação
- Ordenação padrão: Prioridade crescente (maior prioridade embaixo, "quem está mais abaixo vence"; texto de ajuda no cabeçalho da coluna).
- Arrastar para reordenar e separadores visíveis **só** quando ordenado por Prioridade e sem filtro que esconda itens entre origem e destino; caso contrário a alça some e há tooltip explicando.
- Reordenação inválida: fluxo F-04.
- Menu da linha: "Mover para o topo/fundo", "Mover para…" (número ou "logo abaixo de <mod>"), "Mover para o separador…".

### 5.3 Separadores
- Linha de largura total com rótulo, cor opcional, contagem de mods habilitados/total, recolher/expandir.
- Menu: renomear, cor, excluir, habilitar/desabilitar todos do bloco.

### 5.4 Estados de linha
Habilitado (normal), desabilitado (texto `fg-secondary`), não instalado (itálico + ação "Instalar"), instalando (progresso na linha, sem ações), com erro (ícone `danger` na coluna Problemas), destacado pelo usuário (marca de cor na borda esquerda).

### 5.6 Fila de instalação (D124, prancha `JogoFilaInstalacao`)
Modal aberto pelo ícone da fila. Lista as operações da fila (instalando, esperando, pedindo escolha) e os mods importados que não foram instalados.
- Item que pede escolha: "Escolher opções" abre o diálogo da decisão (raiz, duplicado, FOMOD).
- Mod importado: "Instalar".
- "Instalar todos" (primário) chama `InstallAll` com os importados: o backend instala os que não pedem escolha e deixa os outros importados, sem travar a fila.
- "Esvaziar fila" cancela as operações canceláveis; o X de cada operação cancela só ela.
- Com decisão pendente, a faixa "N mods esperam a sua escolha" aparece acima da lista com "Abrir fila".

### 5.7 Organização (D123, pranchas `JogoOrganizacao` e `JogoOrganizacaoTags`)
Modal "Organização dos mods" aberto por Mais ações › Categorias e tags, com abas:
- **Categorias**: árvore à esquerda (ícone, cor e contagem de mods), "Nova categoria"; à direita nome, "Dentro de", cor (16 cores da paleta categórica, `SwatchPicker`), ícone (48 ícones) e a prévia na lista e como grupo ou aba. Rodapé: Excluir categoria, Fechar, Salvar categoria.
- **Tags**: lista com selo colorido e contagem, "Nova tag"; à direita nome e cor, prévia e "Usada em N mods" com "Ver os mods com esta tag" (fecha o modal e busca pela tag). Renomear muda a tag em todos os mods; renomear para uma tag que já existe é recusado (`tag_exists`).
- A cor e o ícone são ids; o backend valida e guarda só o id. Nada aqui muda a implantação.

### 5.5 Menu de contexto da linha
Habilitar/Desabilitar · Instalar (se não instalado) · Reinstalar · Editar conflitos… · Regras… · Mover… · Categoria ▸ · Tipo de mod ▸ (Avançado) · Destacar ▸ · Abrir pasta · Abrir archive · Renomear · Remover…

## 6. Detalhe do mod (modal, D121)

Pranchas `JogoModDetalhe`, `JogoModConflitos`, `JogoModArquivos`, `JogoModInstalacao`, `JogoModHistorico` (RD9). Abre com Enter ou duplo clique na linha e por "Detalhes" no menu da linha; substitui o Inspector lateral, que saiu.

- **Cabeçalho**: ícone da categoria (cor e ícone da paleta), nome, selo da categoria, tags do mod (tirar com o X, pôr com "+ Tag", que sugere as tags já definidas) e o toggle Ativo.
- **Abas**: Resumo, Conflitos (contagem de mods envolvidos; `warning` com par não revisado), Arquivos (contagem), Instalação, Histórico.
- **Resumo**: números do mod (B13: perde para, vence de, mods envolvidos, requisitos presentes sobre o total; parte que não pôde ser lida mostra "—") com "Abrir na página de Conflitos"; dados do mod (versão, tamanho, arquivos, prioridade "N de M", autor, instalado há, tipo, origem); ações (Habilitar/Instalar, Reinstalar, Abrir pasta, Remover…); edição de nome, versão, autor, categoria, destaque e notas; descrição e conteúdo.
- **Conflitos**: adversários por Vence, Perde e Redundante com a decisão; par decidido por regras através de outros mods aparece travado com essas regras e "Altere por lá" (B4, D126); "Editar conflitos…" e o atalho para a página de Conflitos.
- **Arquivos**: barra de arquivos por extensão (B8, `Progress.Stacked`, vale para qualquer jogo) e a árvore do footprint com a marca de cada arquivo e "Escolher vencedor…", "Ocultar"/"Mostrar".
- **Instalação**: archive, instalador, pasta raiz, arquivos e data; as escolhas do FOMOD por passo e grupo (B9) só existem quando o mod veio de um assistente; Abrir archive e Reinstalar.
- **Histórico**: eventos do mod.
- **Rodapé**: "Mod N de M · Esc fecha", Anterior e Próximo pela ordem da lista visível. Esc fecha e devolve o foco à tabela.

Ações do cabeçalho da tela que falam de "o mod selecionado" (abrir a pasta do mod, histórico) seguem a linha em foco.

## 7. Multi-seleção

Habilitar · Desabilitar · Mover… (bloco para posição) · Categoria… · Destacar… · Reinstalar · Remover… (confirmação com opção de remover archives) · "Criar regra: selecionados vencem…" (Avançado).

## 8. Dropzone

Sempre visível na base (compacta), aceita arquivos e pastas; também é possível soltar sobre a tabela (realce de área inteira). Com uma linha de separador em foco, os mods novos entram no fim daquele bloco (core/02 §8).

## 9. Estados de página

- Sem jogo: redireciona para Games com mensagem.
- Vazio: EmptyState "Nenhum mod ainda" + Importar arquivo + explicação curta de staging/deploy + dropzone grande.
- Filtro sem resultado: "Nenhum mod corresponde aos filtros" + "Limpar filtros".
- Ocupado: ações mutantes desabilitadas com "Deploy em andamento…"; importar entra na fila.

## 10. Bridge

Consultas: `ModListView(instance, profile, filtros?)` (inclui prioridade, status, indicadores, contagens, cor e ícone da categoria, tags), `ModDetails(mod)`, `ModFiles(mod, janela, filtro)`, `ModConflictsSummary(mod)`, `Categories(instance)`, `Tags(instance)`, `ImportQueue(instance)`, `InstanceSettings(instance)` (`mods.view`).
Comandos: `ImportFiles`, `ImportFolder`, `InstallMods`, `InstallAll`, `CancelImport`, `SetModsEnabled`, `MoveMods` (retorna recusa com regras e alternativas), `CreateSeparator`/`UpdateSeparator`/`DeleteSeparator`, `SetModAttributes`, `SetModCategory`, `SaveCategory`/`DeleteCategory`, `SaveTag`/`DeleteTag`, `SetInstanceSetting`, `SetModType`, `ReinstallMods`, `RemoveMods`, `Deploy`, `Purge`, `SetFileExclusion`, `SetFileOverride`.

## 11. Critérios de aceite de UX

- Importar, habilitar e fazer deploy de um mod sem sair da tela e sem ler documentação.
- Com 2.000 mods: rolagem fluida, filtro por texto responde em < 100 ms percebidos.
- Arrastar mod para posição que viola regra explica a regra e oferece alternativa.
- Todo indicador de linha tem tooltip e leva ao detalhe correspondente com um clique.
- Tudo acessível por teclado (seleção, toggle, mover, inspector).
- Jogo sem capability de conteúdo (`generic`): sem categorias iniciais, a visão Abas mostra só "Todos" e o convite para criar; nenhuma coluna de plugin; teste da página sem categorias (`ModsPage.test.tsx`).
- Demonstração da RD8: arrastar 10 archives, "Instalar todos", categorizar e alternar as três visões.
