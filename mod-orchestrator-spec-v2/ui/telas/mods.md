# Tela: Mods

Core: 02, 03, 05, 06, 04. Vortex: página Mods (`mod_management/views/ModList`, toolbar, filtros, details panel, multi-select bar, drop zone); `mod-highlight`, `mod-content`, `category_management`, `history_management`. MO2: lista de prioridade com separadores e flags de conflito.

## 1. Objetivo

Responder: quais mods tenho, quais estão habilitados, em que ordem, quem está vencendo quem, o que está com problema, e o que falta implantar. É a tela principal de uso diário.

## 2. Base no Vortex e divergências

Reproduz: toolbar no topo, tabela com filtros por coluna, toggle de status por linha, painel de detalhes à direita, barra de ações de multi-seleção, dropzone na base, histórico e categorias pela toolbar, ações por linha em menu. Divergências: coluna Prioridade + arrastar + separadores (divergência 6), linguagem "vence" (7).

## 3. Layout

```
Toolbar: [Importar arquivo ▾] [Deploy] [Purge] | [Regras] [Categorias] [Histórico] | [Abrir ▾] [… ]
Faixa de problemas (só se houver): "2 mods com requisitos faltando · 1 alteração externa"  [Ver]
FilterBar: [busca] [Status ▾] [Categoria ▾] [Conflitos ▾] [Problemas ▾] [Tipo ▾]  Agrupar: [Nenhum|Separador|Categoria]  [Colunas ▾]
┌─────────────────────────────────────────────────────────────────────┬──────────────┐
│ ☐ ● #  Nome                     Versão Categoria   ⚡  ⛓  ⚠  Tamanho │  INSPECTOR   │
│ ── Separador: Base ───────────────────────────────────────────────  │              │
│ ☐ ● 1  Unofficial Patch         4.3.2  Correções   ↑   ✓     220MB │              │
│ ☐ ○ 2  Texture Pack A           1.0    Texturas    ↕         1.2GB │              │
│ ...                                                                 │              │
├─────────────────────────────────────────────────────────────────────┴──────────────┤
│ Barra de multi-seleção (≥2): "3 selecionados  [Habilitar] [Desabilitar] [Mover…] [Categoria…] [Reinstalar] [Remover] [Limpar]" │
│ Dropzone: "Solte arquivos ou pastas aqui para importar"                                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 4. Toolbar

| Ação | Comportamento | Condição |
|---|---|---|
| **Importar arquivo** (primário) | seletor de arquivos múltiplo; menu: "Importar pasta…" | instância não bloqueada |
| **Deploy** | deploy manual; mostra plano se houver decisão | status ≠ in_sync; desabilitado com motivo se bloqueado |
| **Purge** | confirmação curta | há manifesto |
| **Regras** | abre diálogo Gerenciar regras (todas as regras da instância) | — |
| **Categorias** | abre diálogo Categorias (árvore editável) | — |
| **Histórico** | abre Diagnostics › Histórico filtrado pela seleção atual (ou jogo) | — |
| **Abrir ▾** | pasta do jogo, Data/targets, staging, arquivos (ArchiveStore), pasta do mod selecionado | — |
| **…** | Verificar implantação, Verificar integridade da staging, Criar separador, Exportar lista (texto) | — |

Reservados (não renderizados na V1): "Verificar atualizações", "Obter mais mods", "Tutoriais".

## 5. Tabela

### 5.1 Colunas

| Coluna | Default | Conteúdo | Ordenável | Filtro |
|---|---|---|---|---|
| Seleção | sim | checkbox | — | — |
| Status | sim | toggle (habilitado/desabilitado/não instalado/instalando/erro) | sim | Status: Habilitado, Desabilitado, Não instalado, Com erro |
| Prioridade (#) | sim | número; vazio para "não instalado" | sim (padrão) | — |
| Nome | sim | nome (customizado se houver) + destaque (cor/ícone) + indicador de nota | sim | busca |
| Versão | sim | texto | sim | — |
| Categoria | sim | último nível ou caminho | sim | árvore |
| Conflitos | sim | indicador core/05 §5.2 (vence, perde, misto, totalmente sobrescrito, redundante); clique abre Editor de conflitos do mod | sim | Tem conflito, Não revisado, Totalmente sobrescrito |
| Dependências | sim | ok / faltando / incompatível | sim | Com problema |
| Problemas | sim | contagem de diagnósticos do mod | sim | Com problema |
| Tamanho | sim | tamanho instalado | sim | — |
| Tipo | não | ModType | sim | tipo |
| Conteúdo | não | ícones de ContentFlags (máx. 4 + "+n") | não | contém: plugin, textura, SKSE… |
| Autor | não | | sim | busca |
| Instalado em | não | data (relativa, setting) | sim | período |
| Habilitado em | não | data | sim | período |
| Origem | não | "Arquivo local" + nome do archive | sim | — |
| Variante | não | rótulo | sim | — |

Seletor de colunas lembra visibilidade/largura/ordem por jogo.

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

### 5.5 Menu de contexto da linha
Habilitar/Desabilitar · Instalar (se não instalado) · Reinstalar · Editar conflitos… · Regras… · Mover… · Categoria ▸ · Tipo de mod ▸ (Avançado) · Destacar ▸ · Abrir pasta · Abrir archive · Renomear · Remover…

## 6. Inspector (um mod)

Abas:
1. **Visão geral**: nome (editável), versão, autor, categoria (select de árvore), notas (textarea), destaque, tipo (Avançado), origem, tamanho, datas, conteúdo, variante. Ações: Habilitar/Desabilitar, Reinstalar, Remover.
2. **Arquivos**: árvore do footprint (FileBrowser) com marcas por arquivo: vence / perde para X / redundante / ocultado; ações por arquivo: "Escolher vencedor…", "Ocultar arquivo", "Mostrar", "Abrir".
3. **Conflitos**: listas "Vence", "Perde", "Redundante" agrupadas por mod oponente, com contagens e ação "Editar conflitos…".
4. **Regras**: regras deste mod (vence/perde, requer/recomenda, incompatível) com origem; adicionar/remover; estado de cada requisito.
5. **Instalação**: archive, installer usado, opções escolhidas (FOMOD: passos e opções), avisos da instalação, "Reinstalar com outras opções".
6. **Histórico**: entradas do mod.

Vários selecionados: resumo (contagem, tamanho total, habilitados) + ações em lote.

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

Consultas: `ModListView(instance, profile, filtros?)` (inclui prioridade, status, indicadores, contagens), `ModDetails(mod)`, `ModFiles(mod, janela, filtro)`, `ModConflictsSummary(mod)`, `Categories(instance)`.
Comandos: `ImportFiles`, `ImportFolder`, `SetModsEnabled`, `MoveMods` (retorna recusa com regras e alternativas), `CreateSeparator`/`UpdateSeparator`/`DeleteSeparator`, `SetModAttributes`, `SetModCategory`, `SetModType`, `ReinstallMods`, `RemoveMods`, `Deploy`, `Purge`, `SetFileExclusion`, `SetFileOverride`.

## 11. Critérios de aceite de UX

- Importar, habilitar e fazer deploy de um mod sem sair da tela e sem ler documentação.
- Com 2.000 mods: rolagem fluida, filtro por texto responde em < 100 ms percebidos.
- Arrastar mod para posição que viola regra explica a regra e oferece alternativa.
- Todo indicador de linha tem tooltip e leva ao detalhe correspondente com um clique.
- Tudo acessível por teclado (seleção, toggle, mover, inspector).
