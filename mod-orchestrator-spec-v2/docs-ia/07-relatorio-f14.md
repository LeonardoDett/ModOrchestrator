# Relatório da F14: hardening e desempenho

Data: 2026-10-08. Máquina: Windows 11, SSD NVMe, NTFS, antivírus do Windows ativo (como o usuário típico). Todos os testes rodam no stack real: SQLite em disco, NTFS, extrator, motor de deploy com hardlinks. Decisões: D099 (achados de robustez), D100 (tela de recuperação), D101 (desempenho).

## 1. Bateria de interrupções

O processo filho é morto (`os.Exit`, sem `defer` nem commit) logo depois da n-ésima escrita no disco; o pai reabre como uma nova inicialização faria (recuperação de operações, da biblioteca e das mudanças de pasta; reconciliação do journal) e confere: nenhuma operação "em execução", todo mod `installed` com todos os arquivos na staging (INV-LIB-01, INV-OPS-03), nenhum `.tmp`/`.installing`/`.replaced`/`.partial`, nenhuma pasta de mudança abandonada, deploy funciona e o purge devolve o jogo original byte a byte (nada não gerenciado perdido).

| Operação | Pontos de escrita | Rodada exaustiva (`MO_KILL_ALL=1`) | Rodada padrão |
|---|---|---|---|
| deploy | todos | 25 pontos de deploy + purge, todos passam | 20 aleatórios |
| purge | todos | (incluídos acima) | |
| import | 15 | 15, todos passam | 6 (primeiro, último, 4 aleatórios) |
| reinstall | 9 | 9, todos passam | 6 |
| mover staging | 24 | 24, todos passam | 6 |
| mover ArchiveStore | 6 | 6, todos passam | 6 |
| migration | 7 migrations × antes/depois do commit | 14, todos passam | 14 |

Migrations: depois do kill o banco está na versão anterior (kill antes do commit) ou na nova (depois), com o schema idêntico ao de um banco novo daquela versão e `integrity_check` limpo; a migração seguinte completa (core/14 §6). Migrar de cada versão antiga (v1 a v7) um banco com dados que o app gravou de fato (fixture gerada por `TestWriteMigrationFixture`) preserva todas as linhas e o backfill de `events.instance_id` bate com o que o app grava hoje.

Achados: a pasta de destino vazia de uma mudança interrompida ficava para trás; eventos de operação sem `instance_id` (D099).

## 2. Corrupção do banco

| Caso | Antes | Agora |
|---|---|---|
| Cabeçalho destruído | app encerrava sem janela | tela de recuperação, `corrupt` |
| Página danificada (índice que a inicialização não lê) após fechamento anormal | não detectado | `integrity_check` (só após fechamento anormal) → tela de recuperação |
| Schema mais novo | app encerrava sem janela | tela de recuperação, `newer_schema` |
| Restaurar pela tela | — | banco danificado guardado como `damaged`, backup aplicado no reinício; conferido no `wails dev` com um banco danificado de verdade |
| Começar do zero | — | banco guardado, app abre vazio; nada fora da pasta de dados é tocado |

## 3. Permissões, arquivos travados, volumes, caminhos

| Caso (Windows real) | Resultado |
|---|---|
| Archive travado sem compartilhamento (antivírus) | `import_source_unreadable`/`file_locked` (antes: "formato não suportado"); importa depois de liberado |
| Arquivo da staging travado, método cópia | só a Location falha (`file_locked`); o próximo deploy termina |
| Arquivo do jogo travado no purge | só ele fica; o próximo purge devolve o jogo original |
| Arquivo gerenciado somente leitura | removido normalmente (o Go limpa o atributo) |
| Pasta do jogo com ACL negando escrita | `deploy_failed`/`permission_denied`, nada escrito (antes: `internal` do passo post escondia o motivo); com a permissão de volta, termina |
| Jogo em outro volume / em FAT32 | hardlink indisponível; cópia só com consentimento no diálogo; auto-deploy não escreve nada (INV-DEP-06) |
| Caminho com mais de 260 caracteres | importa, implanta com hardlink e faz purge |

## 4. Fuzz de caminhos

| Fuzzer | Execuções | Propriedade |
|---|---|---|
| `FuzzParse` | 70 milhões | caminho aceito é normalizado e idempotente |
| `FuzzRelpathOnWindows` | 4,7 milhões | o Windows cria exatamente o arquivo aceito; mesmo arquivo no NTFS ⇒ mesma `Key` |
| `FuzzExtractStaysInside` | 108 mil | nada escrito fora do destino, só nomes que o domínio aceita (INV-ID-04) |

Achados: UTF-8 inválido aceito (dois nomes viravam um arquivo), checagem de vazio inconsistente, ZIP sem flag UTF-8 sem decodificação (D099). Os casos que falharam ficam no corpus de regressão (`testdata/fuzz`).

## 5. Benchmarks de escala

`TestScaleBenchmark` (`MO_BENCH=1`): 2.000 mods de 250 arquivos (90% próprios, 10% de um conjunto compartilhado: 18.250 pares em conflito), 3.001 plugins (8% completos, o resto light), importados como ZIP pela fila real; 492.053 entradas implantadas com hardlink. Banco: 535 MB.

| Requisito (00-visao-e-escopo) | Medido | Situação |
|---|---|---|
| Abertura < 3 s com 1.000 mods | 2,5 s com 2.000 mods (inicialização 65 ms + primeira leitura da tela Mods, que monta o índice de conflitos) | atende |
| Recalcular conflitos após habilitar 1 mod < 500 ms com 200 mil Locations | 312–319 ms com ~455 mil Locations | atende |
| Deploy inicial de 100 mil hardlinks < 60 s | 32 s medidos com 400 mods (98 mil entradas); 3.256 links/s na escala completa | atende |
| Deploy incremental de 1 mod < 2 s | com D102: 0,6–0,8 s com 100 mil arquivos; 3,1–4,6 s com 500 mil. Com D139 (2026-10-20): 1,8 s com 500 mil | atende |
| 2.000 mods / 500 mil arquivos / 3.000 plugins sem degradação perceptível | lista de mods 71 ms; lista de plugins 81 ms (2 s na primeira leitura, com os cabeçalhos frios); prévia do sort 87 ms | atende, salvo o deploy incremental |

Outros números da escala completa: import 476 s (1.049 arquivos/s, com o antivírus examinando cada arquivo criado), purge 83 s, "Verificar implantação" 9,3 s, `integrity_check` 1,2 s.

Antes e depois das correções de D101 (escala completa):

| Medida | 1ª rodada | D101 | D101 + D102 |
|---|---|---|---|
| Deploy sem mudanças | 25,4 s | 7,7 s | 3,1 s |
| Deploy desabilitando/habilitando 1 mod | 26,6 / 23,6 s | 9,2 / 9,2 s | 4,6 / 4,6 s |
| Deploy inicial | 190 s | 151 s |
| Purge | 117 s | 83 s |
| Import | 507 s | 476 s |

Com 15 mil arquivos (60 mods): deploy sem mudanças de 10,5 s para 0,2 s, purge de 27 s para 2,3 s, deploy inicial de 13 s para 4,3 s.

## 6. Pendências

1. ~~**Deploy incremental com 500 mil arquivos**~~. Resolvido na D139 (2026-10-20): o plano olha só as Locations tocadas e manifesto, conflitos e inventário de plugins deixam de montar texto por Location. Na escala completa, 1 mod a mais ou a menos de 5,6 s para 1,8 s e deploy sem mudanças de 3,3 s para 1,0 s (mesma máquina e rodada; esta rodada mediu tudo mais lento que a de 2026-10-08, e o "antes" é o desta rodada).
2. ~~**Tamanho dos backups**~~. Resolvido na D138 (2026-10-20): `VACUUM INTO` deixa de copiar as páginas livres; na escala completa o banco de 535 MB vira um backup de 289 MB em 0,9 s, e o pior caso da retenção cai de ~18,7 GB para ~10 GB.
3. **Redescobrir mods e "Adotar"** depois de perder o banco (core/14 §5–6, core/04 §11): a redescoberta foi feita na D145 (2026-10-21: metadado por mod e recuperação das pastas órfãs da staging); "Adotar" a implantação continua pendente (D100).
4. **Volumes reais**: a máquina tem um único volume; "outro volume" e FAT32 foram simulados no adapter de filesystem (o Windows real recusa o hardlink com `ERROR_NOT_SAME_DEVICE`, reproduzido). Falta rodar uma vez com um segundo disco.
5. **Import** a 1.049 arquivos/s é dominado pelo antivírus; não há requisito, mas um mod de 50 mil arquivos leva ~50 s.

## 7. Como repetir

```bash
go test ./internal/integration/ -run 'Kill' -count=1
MO_KILL_ALL=1 go test ./internal/integration/ -run 'Kill' -count=1
go test ./internal/core/domain/relpath/ -run XXX -fuzz FuzzParse -fuzztime 90s
go test ./internal/infrastructure/filesystem/ -run XXX -fuzz FuzzRelpathOnWindows -fuzztime 180s
MO_BENCH=1 MO_BENCH_OUT=bench.json MO_BENCH_PROFILE=deploy.pprof go test ./internal/integration/ -run TestScaleBenchmark -count=1 -v -timeout 120m
MO_WRITE_MIGRATION_FIXTURE=1 go test ./internal/integration/ -run TestWriteMigrationFixture
```
