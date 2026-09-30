# Deploy e Purge

Referências: D007, D033–D036, D038, D045; INV-DEP-*, INV-EXT-01. Vortex: `hardlink_activator`, `symlink_activator`, `symlink_activator_elevate`, `move_activator`, `LinkingDeployment`, `ExternalChangeDialog`, `FixDeploymentDialog`, `preStartDeployHook`, `stagingDirectory`, "Clean up empty directories", `vortex.deployment.json`, `.vortex_backup`.

## 1. Objetivo

Fazer os targets do jogo refletirem o estado desejado do profile ativo, alterando **somente o necessário**, sem nunca perder arquivo que não pertence ao gerenciador, e podendo ser interrompido a qualquer momento sem deixar estado irrecuperável.

## 2. Os três estados (D033)

| Estado | Fonte | Conteúdo |
|---|---|---|
| Desejado | cálculo | Para cada Location: mod vencedor (INV-CON-01), arquivo de origem na staging, método efetivo. Mais: pastas necessárias. |
| Aplicado | DeploymentManifest | O que o gerenciador implantou, com evidência. |
| Observado | filesystem | O que existe agora em cada Location relevante. |

Locations relevantes para um deploy = Locations do desejado ∪ Locations do manifesto.

## 3. Métodos de deploy

| Método | Requisitos | Evidência no manifesto | Observações |
|---|---|---|---|
| `hardlink` (padrão) | staging e target no mesmo volume NTFS | volume serial + file index | Rápido, sem espaço extra. Editar o arquivo no jogo edita a staging (é o mesmo arquivo); isso é detectado por hash/mtime como `modified`. |
| `symlink` | Modo de Desenvolvedor do Windows ligado, ou elevação (não suportada na V1) | alvo do link | Funciona entre volumes. Alguns jogos/ferramentas não seguem symlinks; o adapter pode proibir por ModType. |
| `copy` | nenhum | size + mtime + hash | Fallback explícito (nunca implícito). Usa o dobro de espaço; alterações externas detectadas por comparação. |

Seleção:
1. O método preferido da instância é escolhido em Settings › Mods (por jogo). A tela mostra por que cada método está disponível ou não (`method_unavailable` com motivo: volumes diferentes, sem Modo de Desenvolvedor, FS não NTFS).
2. O adapter pode restringir por ModType (ex.: tipo `root` só `hardlink` ou `copy`).
3. Se o método preferido não é possível para uma Location (ex.: target de outro volume), o plano mostra `method_fallback` para essas Locations e **pede decisão** (não troca sozinho).

Ao adicionar o jogo, o assistente sugere a staging no mesmo volume do jogo (paridade com "Automatically use suggested path for staging folder").

## 4. Plano de deploy

Ações por Location:

| Ação | Quando | Decisão necessária? |
|---|---|---|
| `create` | desejado tem, aplicado não tem, observado vazio | não |
| `keep` | desejado = aplicado e observado confere com a evidência | não |
| `replace_managed` | desejado tem outro arquivo que o aplicado, observado confere | não |
| `remove_managed` | aplicado tem, desejado não tem, observado confere | não |
| `backup_and_create` | desejado tem, aplicado não tem, observado tem arquivo não gerenciado | não (D034), mas listado no resumo |
| `restore_backup` | aplicado tem `backup` para a Location e o desejado não usa mais | não |
| `external_change` | aplicado tem e observado **não** confere | **sim** (core/09) |
| `method_fallback` | método preferido impossível | **sim** |
| `blocked` | target inacessível, caminho longo não suportado, permissão | **sim** (resolver fora e repetir) |
| `mkdir` / `rmdir_managed` | pastas necessárias / pastas criadas pelo gerenciador que ficam vazias (se setting ligado) | não |

Precondições globais que bloqueiam o plano inteiro (diagnóstico bloqueante, core/10):
- staging ausente ou sem marcador da instância;
- target com marcador de outra instância/gerenciador (INV-DEP-08);
- journal de deploy anterior não reconciliado;
- ciclo de regras ativo (D028);
- diagnóstico bloqueante declarado pelo adapter (ex.: jogo em execução).

Resumo do plano (mostrado no diálogo de plano, e usado pela topbar): contagens por ação, espaço extra estimado (cópia/backup), lista de decisões pendentes.

## 5. Operação `deploy`

Steps: `preflight` → `scan` → `plan` → `await_decision`? → `journal` → `apply` → `verify` → `commit` → `post`.

1. `preflight`: lock da instância; precondições globais; verifica espaço em disco para cópias/backups.
2. `scan`: observa as Locations relevantes (stat + identidade; hash só quando necessário para `copy` ou para confirmar `modified`).
3. `plan`: calcula como no §4.
4. `await_decision`: se houver decisões, a operação para e a UI abre o diálogo correspondente (plano / external changes). **Auto-deploy nunca chega aqui: ele termina antes com status `blocked` e diagnóstico (INV-DEP-06).** Decisões tomadas viram ações concretas no plano.
5. `journal`: grava o plano no DeploymentJournal (INV-DEP-03).
6. `apply`: executa ações em ordem segura:
   1. `remove_managed` e `replace_managed` (parte de remoção);
   2. `restore_backup`;
   3. `mkdir`;
   4. `backup_and_create` (move original para BackupStore, depois cria);
   5. `create` e `replace_managed` (parte de criação);
   6. `rmdir_managed`.
   Cada ação: revalida a evidência imediatamente antes de agir (corrida com ferramenta externa → a ação vira `external_change` e é pulada, registrada); marca como concluída no journal em lotes.
   Substituição de arquivo gerenciado usa criação em nome temporário + rename quando o método permite, para nunca deixar a Location vazia se possível.
7. `verify`: confere cada Location criada/substituída (existe, é link para a origem certa / cópia com size+hash).
8. `commit`: numa transação, atualiza o manifesto só com o que foi verificado (INV-DEP-05), remove o journal, grava marcador no target, emite eventos.
9. `post`: adapter aplica a serialização dependente de deploy (ex.: `plugins.txt`, core/08) como sub-step próprio com a mesma disciplina (evidência + external change); health checks; notificação de resultado.

Falhas parciais: uma ação que falha (arquivo bloqueado por antivírus, permissão) não aborta o deploy inteiro por padrão; a Location fica registrada como falha, o manifesto reflete o que realmente foi feito, e a operação termina `failed` com lista de Locations e ação "Tentar novamente". O status fica `failed` até um deploy completo.

Cancelamento: permitido em `plan`/`await_decision` (nada foi escrito) e entre lotes do `apply` (o journal registra o ponto; o próximo deploy reconcilia).

Retomada após crash: na inicialização, journal presente ⇒ diagnóstico bloqueante `deploy_interrupted` com ação "Reconciliar agora". Reconciliar = novo deploy normal: como o scan usa o **observado**, ações já feitas aparecem como `keep`/`create` para Locations que o manifesto ainda não conhece. Para isso, durante a recuperação, Locations cuja evidência observada corresponde exatamente à origem desejada (mesmo file index / alvo / hash) são adotadas como gerenciadas; qualquer outra divergência é external change. Nunca "desfazer" às cegas.

## 6. Purge

Operação `purge`: remove do jogo tudo que o manifesto registra, restaura backups, remove pastas criadas vazias.

- Mesmo pipeline (`scan` → `plan` → `journal` → `apply` → `verify` → `commit`), com plano de remoção.
- Locations cujo observado não confere (external change) **não** são removidas: purge para em `await_decision` com o diálogo de external changes. "Purge forçado" não existe.
- Resultado: manifesto vazio para os targets, marcador removido, status `never_deployed`/`pending`.
- Purge é não destrutivo para a biblioteca: deploy seguinte restaura tudo (INV-DEP-07).

Quando o sistema propõe purge: antes de parar de gerenciar um jogo, antes de mover a staging, antes de trocar o método de deploy, a pedido do usuário. Troca de profile **não** faz purge (D033).

## 7. Status de deploy (derivado)

| Status | Condição | UI (topbar) |
|---|---|---|
| `never_deployed` | sem manifesto e sem journal | "Nunca implantado" + Deploy |
| `in_sync` | desejado = aplicado e último scan sem divergência | "Sincronizado" |
| `pending` | desejado ≠ aplicado | "Deploy pendente" + Deploy |
| `blocked` | precondição global falha, ou auto-deploy parou por decisão | "Precisa de atenção" + abrir diagnóstico |
| `failed` | último deploy terminou com falhas | "Falhou" + detalhes |
| `unknown` | journal sem reconciliação, ou banco restaurado sem scan | "Verificar" + Reconciliar |

`in_sync` é otimista quanto ao observado: o scan completo roda antes de cada deploy, ao focar a janela (Locations do manifesto, com limite de custo), e sob demanda ("Verificar implantação").

## 8. Auto-deploy (D036)

Gatilhos (se setting "Implantar mods ao habilitar" ligado, padrão ligado): habilitar/desabilitar mod, mudar ModOrder, regras ou overrides que mudam vencedores, instalar/reinstalar/remover mod implantado, trocar profile, trocar mod type.
Coalescência: atraso curto após a última mudança (padrão 1,5 s). Se a instância está ocupada, roda depois.
Auto-deploy que encontra decisão: termina `blocked` sem escrever nada e publica diagnóstico `deploy_needs_decision` com ação "Revisar plano".

## 9. Deploy antes de lançar (D045)

Ao clicar Play: se `pending`, roda deploy (com o diálogo normal se houver decisões); se `blocked`/`failed`/`unknown`, mostra o motivo e oferece resolver ou "lançar mesmo assim" (exceto diagnósticos que o adapter marca como impeditivos, ex.: outro gerenciador implantou). Paridade com `preStartDeployHook`.

## 10. Staging

- Marcador `.modorchestrator-staging` com instanceId. Staging sem marcador, ou com marcador de outra instância, é recusada. Na prática (D058): uma pasta que **não existe** é criada e marcada; uma pasta **vazia** é adotada e marcada; uma pasta com conteúdo e sem marcador (`not_empty`) ou com marcador de outra instância (`other_instance`) é recusada com `staging_foreign`. Como o staging nunca é o jogo nem está dentro/ao redor de um target, o assistente recusa qualquer sobreposição (INV-LIB-03).
- ArchiveStore e BackupStore recebem o mesmo tratamento, com marcadores `.modorchestrator-archives` e `.modorchestrator-backups` e o erro `folder_foreign`. As três pastas não se sobrepõem entre si, nem com o jogo, nem com pastas de outra instância. "Parar de gerenciar" só apaga uma delas (opção explícita, com o nome digitado) se o marcador prova que é da instância.
- Mover staging (Settings › Mods): operação `move_staging`: calcula espaço, purge (se implantado) → copia/move pasta a pasta com verificação → atualiza instância → deploy. Interrompida: permanece válida na origem até o commit; a cópia parcial no destino é descartada na retomada.
- Staging e ArchiveStore podem ficar em volumes diferentes; staging e targets no mesmo volume para hardlink.

## 11. Marcadores e outros gerenciadores (D035)

- Marcador de deploy: `<target>/.modorchestrator-deployment.json` com instanceId, profileId, appliedAt e hash do manifesto. Gravado no commit; removido no purge.
- Detecção (implementada na F3, D059; calculada a cada leitura, nunca persistida): no topo de cada target, `vortex.deployment*.json` e `*.vortex_backup`, e o marcador `.modorchestrator-deployment.json` cujo dono não é esta instância (marcador ilegível ou sem dono conta como estrangeiro); no topo da raiz do jogo, uma instância portátil do MO2 (`ModOrganizer.ini`, ou as três pastas `mods` + `profiles` + `overwrite`). Uma pasta `Mods` sozinha não indica MO2, porque um jogo genérico pode ter um target com esse nome. O assistente **não** bloqueia por isso: a instância nasce e a detecção aparece como aviso com as ações abaixo; o bloqueio do deploy e o diagnóstico persistente chegam com F7/F9. Varre-se só o topo, não a árvore inteira. Resultado: diagnóstico bloqueante `foreign_deployment` com ações: abrir pasta, "Eu já removi a implantação do outro gerenciador, verificar de novo", e (instância nossa) "Adotar" quando o banco foi perdido e o marcador + observado permitem reconstruir o manifesto.

## 12. Erros

`instance_busy`, `staging_missing`, `staging_foreign`, `target_unavailable`, `foreign_deployment`, `deploy_interrupted`, `deploy_needs_decision`, `method_unavailable`, `disk_full`, `path_too_long`, `file_locked`, `permission_denied`, `verify_failed`, `game_running`.

## 13. Eventos

`deployment.planned`, `deployment.applied`, `deployment.failed`, `deployment.purged`, `deployment.status_changed`, `deployment.external_changes_detected`, `staging.moved`.

## 14. Critérios de aceite

- Deploy duas vezes seguidas: segundo plano vazio (INV-DEP-04).
- Habilitar 1 mod em setup com 1.000 mods implantados cria só as Locations desse mod (e substitui só as que ele vence).
- Arquivo do jogo base substituído vai para o BackupStore e volta no purge com o mesmo conteúdo (hash).
- Matar o processo no meio do `apply` em 20 pontos aleatórios: após reabrir e reconciliar, o observado = desejado e nenhum arquivo não gerenciado foi perdido.
- Arquivo gerenciado editado externamente não é sobrescrito nem apagado sem decisão (deploy e purge).
- Target com `vortex.deployment.json` bloqueia o deploy com diagnóstico e ações.
- Auto-deploy com external change pendente termina `blocked` sem escrever nada.
- Purge seguido de deploy restaura exatamente o estado anterior (INV-DEP-07).

## 15. Fora de escopo V1

Deploy por "move" (move_activator do Vortex), symlink com elevação, deploy para múltiplos profiles simultâneos, merge de arquivos (o Vortex permite extensões registrarem "mergers" para arquivos combináveis; contrato previsto em core/15).
