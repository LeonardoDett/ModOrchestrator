# Biblioteca e importação

Referências: D009, D032, D038, D048; INV-ID-03/04, INV-LIB-*. Vortex: `mod_management` (InstallManager, DuplicatesDialog, removeMods, reconcileOrphanedArchive), `mod-content`, `mod-highlight`, `meta-editor`, `category_management`. MO2: pasta por mod, notas, cores, "Contains".

## 1. Objetivo

Receber archives e pastas locais, transformá-los em mods isolados na staging da instância, manter seus metadados e permitir reinstalar, criar variantes e remover sem nunca deixar um mod "meio instalado".

## 2. Entradas aceitas

| Entrada | Como chega | Nota |
|---|---|---|
| Arquivo `.zip`, `.7z`, `.rar` | botão Importar, arrastar e soltar, "Abrir com" (futuro) | vários de uma vez formam fila |
| Pasta | "Importar pasta", arrastar pasta | D048; copiada para o ArchiveStore |
| Outros formatos | recusados com `import_unsupported_format` | `.exe` nunca é aceito |

Limites de segurança (configuráveis em Settings › Mods, com defaults): tamanho extraído máximo (padrão 64 GB), número máximo de entradas (padrão 500.000), razão de compressão suspeita (zip bomb: > 1000:1 gera confirmação).

## 3. Pipeline de importação

Operação `import` (um por archive), steps:

1. `validate`: arquivo existe, legível, formato suportado, instância existe e não está ocupada (D038).
2. `hash`: hash de conteúdo do archive.
3. `dedupe`: procura Archive com o mesmo hash na instância. Se existir → **decisão** (ver §6).
4. `retain`: copia (ou move, conforme setting) para o ArchiveStore. Falta de espaço → erro `disk_full` antes de copiar (checagem prévia).
5. `inspect`: lista entradas sem extrair; detecta caminhos perigosos (`..`, absolutos, ADS, reservados, symlinks dentro do archive) → erro `archive_unsafe_path` com a lista; archive vazio/corrompido → `archive_corrupt`.
6. `select_installer`: pergunta aos installers, em ordem de prioridade, quem suporta (core/03). Resultado: installer escolhido + motivo.
7. `extract`: extrai para pasta temporária da operação (dentro da staging, em `.tmp/<operationId>`, mesmo volume, para permitir rename atômico). Nunca escreve fora dela (INV-ID-04).
8. `plan_install`: installer produz o plano de instalação (arquivos, destinos, mod type, metadados detectados). Pode parar em `await_decision` (FOMOD, root ambíguo, nenhum arquivo reconhecido).
9. `stage`: materializa o plano numa pasta `<staging>/<modFolder>.installing`, verifica, e renomeia para `<staging>/<modFolder>` (troca atômica no reinstall).
10. `commit`: grava Mod + Installation + ModEntry em todos os profiles + posição na ModOrder (§8) numa transação; emite eventos.
11. `post`: calcula conteúdo (ContentFlags), agenda health checks e auto-deploy (se habilitar ao instalar estiver ligado).

Cancelamento: permitido até `stage`. Cancelar apaga a pasta temporária; Archive retido permanece (o usuário pode instalar depois; o mod fica `imported`). Após `commit`, a operação não é cancelável.

Retomada (encontrada `interrupted`): apaga `.tmp/<operationId>` e `*.installing`; se o commit não ocorreu, o mod volta ao último estado consistente (INV-LIB-01). Nunca tenta continuar do meio.

## 4. Resolução de root (installer básico)

Objetivo: descobrir qual pasta do archive corresponde à raiz do target padrão do mod type.

Heurísticas, em ordem (o adapter pode acrescentar dicas, core/11):

1. Se o adapter reconhece a estrutura na raiz do archive (ex.: Skyrim: pastas `meshes`, `textures`, `scripts`, `interface`, `sound`, `SKSE`, arquivos `.esp/.esm/.esl/.bsa`), a raiz é a raiz.
2. Se a raiz tem **uma única pasta** e nada mais relevante (ignorando `readme*`, `*.txt`, `*.md`, imagens soltas), desce um nível e repete (pasta wrapper). Limite de profundidade: 3.
3. Se existem várias pastas candidatas no mesmo nível (ex.: `Option A/`, `Option B/`) → **decisão**: o usuário escolhe a root numa árvore ("Preparar instalação").
4. Se nada é reconhecido → decisão com alerta "nenhum arquivo reconhecido para este jogo" e opções: escolher pasta manualmente, instalar como está, ou cancelar. Paridade com o aviso do Vortex "mod não parece ser para este jogo".

A decisão é registrada em `Installation.options` (`root=<path>`) para o reinstall repetir sem perguntar.

## 5. Estados do mod

```
           import ok (sem instalar)                     remove
 [none] ─────────────────────────────► imported ─────────────────────► removed
   │                                     │  ▲
   │ import+install                      │  │ abort (sem instalação anterior)
   ▼                                     ▼  │
 installing ◄──── reinstall ──────── installed
   │  ▲                                  │
   └──┘ abort (volta a installed          └── remove ─► removed
        se havia instalação anterior)
```

- `imported`: archive retido, sem Installation (ex.: usuário cancelou o FOMOD, ou escolheu "importar sem instalar"). Aparece na lista com status "Não instalado" e ação Instalar (paridade com mods "uninstalled" do Vortex).
- `installing`: operação em curso; mod aparece com progresso e não aceita outras ações.
- `installed`: Installation completa. Habilitado/desabilitado é do profile.
- `removed`: terminal; o registro some das consultas (mantido só para histórico).

Integridade: um scan de biblioteca (sob demanda, antes de deploy, e na inicialização se configurado) compara Installation × staging. Arquivo faltando/modificado na staging gera diagnóstico `staging_file_missing` / `staging_file_modified` com ações: reinstalar (se archive retido), aceitar modificação (atualiza hash e tamanho), abrir pasta. Não é um estado do mod.

## 6. Duplicados e variantes

Ao importar archive com hash já existente, ou com mesmo nome lógico de um mod existente, pedir decisão (diálogo equivalente ao `DuplicatesDialog` do Vortex):

| Opção | Efeito |
|---|---|
| Reinstalar o mod existente | Nova Installation para o mesmo Mod; mantém entradas de profile, regras e overrides. |
| Instalar como variante | Novo Mod com `variantOf` e rótulo pedido ao usuário; entra na ModOrder logo abaixo do original, desabilitado. |
| Substituir (atualização) | Para nome igual e hash diferente: novo archive vira a origem do mod existente e ele é reinstalado; o archive antigo fica retido até o usuário removê-lo. |
| Cancelar | Nada muda; se o archive foi retido nessa operação, é descartado. |

## 7. Reinstalar, remover, abrir

- **Reinstalar**: requer archive retido. Reusa `Installation.options` (FOMOD pré-selecionado, D030; root lembrada). Troca atômica da pasta. Mantém tudo do profile/instância. Overrides e exclusões de Locations que deixaram de existir viram diagnóstico `override_stale` (INV-CON-03). Se o mod estava implantado, marca deploy pendente.
- **Remover**: diálogo com a opção "remover também o arquivo original (archive)" (paridade Vortex). Efeito: remove ModEntries e o item da ModOrder de todos os profiles, marca regras/overrides que o citam como órfãos (INV-LIB-05), apaga a pasta na staging e deixa deploy pendente. Se o mod está implantado e auto-deploy está desligado, o diálogo avisa que os arquivos continuam no jogo até o próximo deploy.
- Remoção em lote é uma operação única com lista de mods.
- **Abrir**: pasta do mod na staging, archive no ArchiveStore.

## 8. Posição inicial na ModOrder

Mod novo entra no **fim** da ModOrder (maior prioridade) em todos os profiles, exceto:
- variante: logo abaixo do original;
- regras vindas de metadados que exigem outra posição: o motor (core/05) aplica movimento mínimo e registra o motivo.

Se o usuário soltou os arquivos com um separador selecionado, os mods novos entram no fim desse bloco (conveniência de UI, parâmetro do comando).

## 9. Metadados e atributos

Detectados (sobrescrevíveis pelo usuário, que tem precedência):
- nome: `fomod/info.xml` › `Name`; senão nome do archive sem extensão e sem sufixos de versão/ID do Nexus (`-1234-1-2-3-1690000000` é reconhecido e separado).
- versão: `info.xml` › `Version`; senão extraída do nome do archive; senão vazia.
- autor, descrição, site: `info.xml`.
- ContentFlags: calculado pelo adapter a partir do footprint.

Editáveis: nome, versão, autor, categoria, notas (texto longo), destaque (cor da paleta semântica + ícone, como `mod-highlight`), tags, mod type (Avançado; troca exige confirmação porque muda destinos e pode criar/desfazer conflitos).

## 10. Categorias

Árvore por instância: criar, renomear, mover (arrastar), excluir (mods ficam sem categoria). Filtro e agrupamento por categoria na tela Mods; setting "Ocultar categoria de nível superior" exibe só o último nível (paridade Vortex). Categorias padrão iniciais: fornecidas pelo adapter (Skyrim: conjunto enxuto inspirado nas categorias do Nexus); nenhuma chamada de rede.

## 11. Erros (códigos estáveis)

`import_unsupported_format`, `archive_corrupt`, `archive_unsafe_path`, `archive_too_large`, `archive_suspicious_ratio`, `disk_full`, `staging_unavailable`, `instance_busy`, `installer_unsupported`, `installer_failed`, `no_installable_files`, `reinstall_archive_missing`, `mod_busy`, `operation_not_cancellable`, `decision_not_pending`, `category_invalid`, `mod_type_unknown`, `import_source_missing` (F4). `archive_corrupt` usa `reason`: `damaged`, `empty`, `encrypted` (D062). `archive_suspicious_ratio` não é erro: é a decisão `suspicious_ratio` (continuar/cancelar).

## 12. Eventos

`mod.imported`, `mod.installed`, `mod.reinstalled`, `mod.install_aborted`, `mod.removed`, `mod.attributes_changed`, `mod.category_changed`, `mod.type_changed`, `archive.retained`, `archive.removed`, `category.changed`. Na F4 também: `import.decision_required` (sinal para a UI reler a fila; fato "o import espera decisão") e `profile.mods_enabled_changed` (toggle de status no profile ativo, D066). Payloads são mapas de texto (código + parâmetros, D044).

## 13. Critérios de aceite

- Importar um archive com pasta wrapper instala o conteúdo correto sem perguntar.
- Importar archive com duas opções de pasta pede escolha; reinstalar não pergunta de novo.
- Archive com `../evil.dll` é recusado listando a entrada; nada é escrito fora da pasta temporária.
- Matar o processo em qualquer step deixa: nenhum `.installing`/`.tmp` após reabrir, e o mod em `imported` ou no estado anterior.
- Renomear um mod não move nenhum arquivo.
- Remover um mod com regra associada deixa a regra marcada como órfã e um diagnóstico.
- Importar 20 archives arrastados cria fila visível processada um por vez; cancelar um item não afeta os outros.

## 14. Fora de escopo V1

Download, verificação de atualização, metadados online, endorsements, changelogs (V2, core/15).
