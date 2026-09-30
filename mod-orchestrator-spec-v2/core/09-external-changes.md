# Alterações externas e arquivos gerados

Referências: D008, D035, D040, D046; INV-EXT-*, INV-DEP-01/02. Vortex: `ExternalChangeDialog`, `externalChanges.ts`, `new-file-monitor`, `FixDeploymentDialog`. MO2: pasta `overwrite`.

## 1. Problema

O filesystem do jogo muda sem o gerenciador: ferramentas (xEdit limpando plugins, BodySlide/Nemesis/DynDOLOD gerando saídas), o próprio jogo (logs, configs), a Steam verificando arquivos, antivírus removendo DLLs, o usuário apagando ou editando à mão. O gerenciador não pode nem ignorar nem "corrigir" essas mudanças sozinho.

## 2. Classificação

Comparação aplicado × observado por Location relevante:

| Tipo | Condição | Exemplo |
|---|---|---|
| `missing` | manifesto tem, observado não existe | usuário apagou; antivírus removeu |
| `modified` | mesmo arquivo (hardlink: mesmo file index) com conteúdo diferente do registrado; ou cópia com size/mtime/hash diferente | xEdit limpou um plugin **via hardlink** (a staging também mudou) |
| `replaced` | Location existe, mas é outro arquivo (file index diferente / não é mais link / alvo diferente) | ferramenta salvou por "escrever temporário + renomear"; Steam repôs o original |
| `unexpected` | arquivo existe numa pasta gerenciada, sem entrada no manifesto, criado após o último deploy | saídas de Nemesis/BodySlide, logs |
| `permission` | não foi possível ler/verificar | arquivo bloqueado, ACL |
| `load_order` | arquivo de load order diferente da última escrita | launcher reescreveu `plugins.txt` |

Nota sobre hardlink `modified`: como staging e jogo são o mesmo arquivo, a edição já está na staging. Detecta-se comparando com o hash/tamanho registrado na Installation.

## 3. Quando detectar

- Sempre no `scan` de deploy e purge (INV-EXT-01).
- Ao focar a janela do app (varredura limitada às Locations do manifesto, com orçamento de tempo; o resto na próxima).
- Sob demanda: "Verificar implantação".
- `unexpected` só é procurado em pastas que contêm arquivos gerenciados ou pastas declaradas pelo adapter como "saídas conhecidas de ferramentas" (evita varrer o jogo inteiro).
- Monitor de arquivo de load order enquanto o app está aberto (core/08).

## 4. Decisões por tipo

| Tipo | Ações disponíveis | Padrão sugerido |
|---|---|---|
| `missing` | **Restaurar** (recria o link/cópia) · **Aceitar remoção** (cria FileExclusion para aquele mod naquela Location) · Ignorar agora | Restaurar |
| `modified` (hardlink) | **Manter alteração** (atualiza hash/size da Installation; a staging já contém a mudança) · **Reverter** (reinstala o arquivo a partir do archive, se retido) | Manter |
| `modified` (cópia) | **Salvar no mod** (copia para a staging, atualiza Installation) · **Reverter** (recopia da staging) | Salvar no mod |
| `replaced` | **Salvar no mod** · **Reverter** (move o arquivo encontrado para o BackupStore e restaura o link) · Ignorar agora | Reverter se o arquivo encontrado é idêntico ao original do jogo (Steam repôs); Salvar no mod caso contrário |
| `unexpected` | **Capturar** para mod novo ("Arquivos gerados — <data>") ou existente · **Deixar como não gerenciado** (lembrar decisão para aquela Location) · Abrir pasta | nenhum pré-selecionado; lista agrupada por pasta |
| `permission` | Tentar de novo · Abrir pasta | — |
| `load_order` | **Importar para o profile** · **Restaurar a do profile** | Restaurar |

Regras:
- Nenhuma ação é executada sem confirmação do diálogo (INV-EXT-02). A única exceção é "Restaurar" de `missing` durante um deploy **iniciado pelo usuário** quando o setting "Restaurar arquivos gerenciados ausentes automaticamente" está ligado (padrão desligado); a ação é registrada no histórico.
- "Aplicar a todos deste tipo" existe no diálogo (paridade Vortex), sempre explícito.
- "Ignorar agora" deixa a Location fora do deploy atual; o diagnóstico permanece.
- "Deixar como não gerenciado" é decisão persistida (ExternalDecision); o arquivo nunca mais é listado como `unexpected`, e nunca é apagado (D046).

## 5. Captura de arquivos gerados (D046)

- Captura move os arquivos escolhidos do target para a staging de um mod (novo, tipo e categoria "Gerados", ou existente escolhido), cria/atualiza a Installation (installer `captured`, sem archive), e o próximo deploy os implanta como links, agora gerenciados.
- Mod de captura novo entra no fim da ModOrder (maior prioridade), porque saídas de ferramentas devem vencer.
- Captura é operação com journal (move entre pastas), mesma disciplina do deploy.

## 6. Diálogo (resumo; detalhe em `ui/telas/dialogos.md`)

Modal com lista agrupada por tipo e por mod, cada linha com Location, mod, tipo, detalhes (tamanho/data antes e depois), e um **select de ação por linha** (paridade com o ExternalChangeDialog do Vortex), mais "aplicar a todos do grupo". Botão "Aplicar decisões" continua o deploy/purge que estava em `await_decision`.

Fora de um deploy, as mudanças aparecem como diagnóstico `external_changes_pending` com ação "Revisar".

## 7. Critérios de aceite

- Editar um plugin implantado via hardlink em outra ferramenta: detectado como `modified`; "Manter" atualiza a Installation; nenhum arquivo é tocado no jogo.
- Steam repondo arquivo original sobre um link: `replaced`, sugestão "Reverter", original vai para o BackupStore.
- Saídas do Nemesis em `meshes/actors/character/behaviors`: `unexpected`, agrupadas; captura cria um mod e o deploy seguinte as reimplanta como links.
- Nenhum arquivo `unexpected` é apagado em deploy ou purge.
