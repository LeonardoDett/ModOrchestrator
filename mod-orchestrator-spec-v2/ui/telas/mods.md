# Tela: Mods

Redesenho v1 (pranchas `JogoMods`, `JogoModsAninhada`, `JogoModsAbas`, `JogoOrganizacao`, `JogoOrganizacaoTags`, `JogoFilaInstalacao`; RD8, D119, D123, D124). O detalhe do mod (§6) muda para o modal de cinco abas na RD9; até lá vale o Inspector descrito aqui.

Core: 02, 03, 05, 06, 04. Vortex: página Mods (`mod_management/views/ModList`, toolbar, filtros, details panel, multi-select bar, drop zone); `mod-highlight`, `mod-content`, `category_management`, `history_management`. MO2: lista de prioridade com separadores e flags de conflito.

## 1. Objetivo

Responder: quais mods tenho, quais estão habilitados, em que ordem, quem está vencendo quem, o que está com problema, e o que falta implantar. É a tela principal de uso diário.

## 2. Base no Vortex e divergências

Reproduz: toolbar no topo, tabela com filtros por coluna, toggle de status por linha, painel de detalhes à direita, barra de ações de multi-seleção, dropzone na base, histórico e categorias pela toolbar, ações por linha em menu. Divergências: coluna Prioridade + arrastar + separadores (divergência 6), linguagem "vence" (7).

## 3. Layout (prancha `JogoMods`, D127)

```
Mods  [◆ 142 de 380 ativos] [▣ 48 GB em disco]          [≡ 3] [⇩] [🚀 64%] [⋯] │ [+ Adicionar mods]     (linha de 76 px)
[🔍 Buscar por nome ou tag (320 px)] [Filtros] [Todos 380 | Ativos 142 | Desligados 238]      [Lista | Aninhada | Abas]  (48 px)
┌ Ativo │ Mod (nome / tags embaixo)            │ Categoria        │ Conflitos      │ Atualizado │ Tamanho ┐ (cabeçalho 36 px)
│  ◉    │ Correções Não Oficiais               │ ▣ Correções      │ Vence 3        │ há 3 dias  │  220 MB │ (linhas de 54 px)
│       │ • essencial                          │                  │                │            │         │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Faixas de escolha pendente, problemas e ciclo aparecem acima da tabela só quando há algo. A tela inteira aceita arquivos soltos; não há dropzone fixa (só no estado vazio).

## 4. Cabeçalho

`ResourcePage layout="workspace"`: título, chips (`Indicator variant="chip"`: ativos e disco) e as ações numa linha.

| Elemento | Comportamento |
|---|---|
| Fila (botão com borda, ícone e contador em pílula) | abre o modal da fila; conta operações na fila e importados sem instalar; a pílula fica `warning` quando alguém pede escolha |
| Importar (ícone) | "De arquivos…" e "De pasta…" |
| Implantação | ícone em repouso; implantando, "64%" na cor de informação; menu Implantar, Prévia, Limpar |
| Mais ações (ícone) | Prancha `JogoModsMenus` (RD17b): Implantar agora, Limpar a implantação, Verificar a implantação · Organização: categorias e tags, Regras entre mods, Criar separador, Colunas da lista › (Categoria, Conflitos, Atualizado, Tamanho; setting `mods.hiddenColumns`) · Histórico dos mods, Abrir pasta › (jogo, staging, arquivos, mod em foco), Exportar a lista em texto (perfil ativo, `[x]` ligado), Verificar os arquivos dos mods ("Verificar agora" do Diagnóstico) |
| **Adicionar mods** (primário, depois de um divisor) | seletor de arquivos |

## 5. Tabela

### 5.1 Colunas

Fixas, sem seletor de colunas e sem ordenação por cabeçalho: **Ativo** (switch 30×18), **Mod** (nome em cima; tags embaixo com ponto colorido, ou "sem tags"; mod desligado com texto apagado), **Categoria** (só na Lista: quadrado com ícone e cor + nome), **Conflitos** ("Vence N", "Perde N", "Vence N, perde M", "A resolver · N", "Sem conflito", "Instalando", "Na fila", com cor de significado), **Atualizado** ("há 3 dias", data na dica) e **Tamanho**. A ordem das linhas é a prioridade do perfil ativo.

### 5.1.1 Filtro rápido e busca
- Busca de 320 px; casa nome, autor, origem e tags.
- Botão "Filtros" (prancha `JogoModsMenus`, RD17b) abre um painel de 410 px com seções de chips, vários por seção (na seção vale qualquer um; entre seções, todos): Situação (Não instalado, Com erro, Com requisito faltando; os dois últimos vêm do backend, `ModFlags`, pelos problemas visíveis), Categoria, Tags (4 por vez e "Mais N"), Conflitos (Com conflito, Não revisados, Totalmente sobrescrito) e Contém (marcas de conteúdo do adapter; some quando o jogo não classifica arquivos, como no `generic`). Rodapé com "N de M mods", "Limpar filtros" e "Fechar". Cada filtro em uso vira um chip removível ao lado do botão ("Categoria Texturas ×"), seguido de "Limpar".
- Filtro rápido com contagem: Todos, Ativos, Desligados.

### 5.1.2 Visões (D123)
- **Lista**: a tabela com prioridade, separadores e arrastar.
- **Aninhada** (prancha `JogoModsAninhada`): grupos de 42 px por categoria (seta, ícone colorido, nome, "N de M ativos"), sem a coluna Categoria.
- **Abas** (prancha `JogoModsAbas`): faixa de abas dentro do cartão da tabela (Todos, categorias de primeiro nível com ícone e contagem, Sem categoria), sem a coluna Categoria. Sem categorias, a tela convida a criar a primeira.
- A visão é a setting de instância `mods.view`, gravada ao trocar.

### 5.2 Ordem

A prancha não tem coluna de prioridade, alça de arrastar nem separadores (D127). A ordem muda por "Mover para…" (menu da linha e barra de multi-seleção) e pela ação "Reordenar" do detalhe do mod; recusa e alternativas continuam no DLG-11. Separadores já gravados continuam no ModOrder, mas a tela não os mostra.

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

## 6. Detalhe do mod (modal, D121, D127)

Pranchas `JogoModDetalhe`, `JogoModConflitos`, `JogoModArquivos`, `JogoModInstalacao`, `JogoModHistorico`. Modal de 1040 × 780. Abre com Enter ou duplo clique na linha e por "Detalhes" no menu da linha; substitui o Inspector lateral, que saiu.

- **Cabeçalho** (faixa de estrutura): no Resumo, quadrado de 52 px da categoria, nome em 20 px, chip da categoria, tags com ponto da cor (tirar com o X) e "+ tag" tracejado (sugere as tags já definidas); nas outras abas, versão compacta com quadrado de 40 px e a linha "categoria · versão · tamanho · prioridade N de M". À direita: "Ativo" com switch (só mod instalado), divisor e fechar.
- **Abas** (38 px, sobre a linha da faixa): Resumo, Conflitos (contagem de mods envolvidos; âmbar com par não revisado), Arquivos (contagem), Instalação, Histórico.
- **Resumo**: ações rápidas Reordenar (abre "Mover para…"), Reinstalar (ou Instalar, se só importado), Abrir pasta do mod e, à direita, Remover. "Conflitos e requisitos" com quatro números contados em **arquivos** (B13): Perde (borda vermelha quando > 0), Vence, Mods envolvidos e Requisitos presentes/total, e o link "Abrir na página de Conflitos". "Dados do mod" em grade 4 × 2: Versão, Tamanho, Arquivos, Prioridade, Autor, Instalado, Atualizado, Origem (archive). "Ajustes de INI" (D149, só com `game_settings` e quando o mod traz tweaks): uma linha por tweak com nome, "Em <arquivo> · N chaves" e switch (desligado por padrão); muda a hora se o perfil está implantado. Descrição e "Suas notas" lado a lado; as notas se editam no lugar e salvam ao sair do campo. Não há formulário de edição no detalhe.
- **Conflitos**: "N mods disputam arquivos com este" com o atalho âmbar para a página de Conflitos; filtro Todos / Este mod perde / Este mod vence com contagens; tabela de 48 px (Mod envolvido, Categoria, Em disputa, Para este mod com Vence/Perde/Vence e perde/Iguais). Par travado por regras através de outros mods mostra o cadeado com as regras (B4, D126). Decidir é na página de Conflitos.
- **Arquivos**: barra de arquivos por tipo (B8, três tipos e "outros", vale para qualquer jogo), "Buscar arquivo", filtro Todos / dois tipos principais / "Em conflito · N" e a árvore de linhas de 34 px com Nome, Situação (No jogo, No jogo, vence N mods, Sobrescrito por X, Igual ao de outro mod, Oculto, Fora do jogo) e Tamanho somado por pasta. O menu de contexto de um arquivo tem "Escolher vencedor…" e "Ocultar arquivo"/"Mostrar".
- **Instalação**: "Instalado pelo instalador do mod (FOMOD)" com "N passos · N opções escolhidas · instalado há X de archive", "Buscar opção" e Reinstalar; passos numerados e recolhíveis, cada grupo com as opções marcadas (B9). Sem FOMOD: "Instalado direto do arquivo" e os dados do archive (nome, tamanho, guardado, pasta raiz, data, SHA-256).
- **Histórico**: linhas de 48 px com ícone por tipo de evento, o texto e "há X".
- **Rodapé** (48 px): "Mod N de M · Esc fecha", Anterior e Próximo pela ordem da lista visível. Esc fecha e devolve o foco à tabela.

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
