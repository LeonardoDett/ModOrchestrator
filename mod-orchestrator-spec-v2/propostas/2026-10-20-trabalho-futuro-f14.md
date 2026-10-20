# Proposta: trabalho futuro da F14

Status: **proposta** (2026-10-20). Itens 2 (D138) e 1 (D139) feitos; o item 3 aguarda.

Referências: `docs-ia/07-relatorio-f14.md` §6, D100, D101, D102, core/04 §5 e §11, core/14 §3 e §5, `00-visao-e-escopo.md` (requisitos de desempenho).

Os três itens são independentes. Cada um vira uma fase própria, com um commit por passo.

## 1. Deploy incremental abaixo de 2 s com 500 mil arquivos

**Hoje** (D102): 0,6–0,8 s com 100 mil arquivos e 3,1–4,6 s com 500 mil. O scan já é só do que muda; o que sobra é trabalho em memória proporcional ao jogo inteiro:

| Parte | Custo com 500 mil |
|---|---|
| Estado desejado a partir dos vencedores dos conflitos | 1,2 s |
| Plano sobre todas as Locations | 1,1 s |
| Comparar o manifesto inteiro ao gravar | 0,9 s |
| Inventário de plugins depois do deploy | 0,8–1,1 s |

**Opções**

- **A. Plano incremental completo.** O deploy guarda o estado desejado e o plano do último deploy; o próximo recalcula só as Locations dos mods cujo estado mudou (habilitado, prioridade, regra, Installation) e as que eles disputam no índice de conflitos. O manifesto passa a ser gravado como diferença (linhas inseridas, trocadas e removidas) em vez de reescrito. O inventário de plugins olha só o topo dos targets tocados. Estimativa: 2,6–3,4 s a menos, abaixo de 2 s com folga. Custo: fase grande (domínio `deployplan`, serviço de deploy, repositório do manifesto), com risco no invariante central (o plano incremental tem de dar o mesmo resultado do completo). Mitigação: teste de propriedade que compara plano incremental e completo em sequências aleatórias de mudanças, e um "deploy completo" sempre que o cache não bate (perfil trocado, regra global, método, manifesto não verificado).
- **B. Só os caches baratos.** Guardar o estado desejado entre deploys e invalidar por mod mudado (corta a maior parte de 1,2 s), gravar o manifesto como diferença (0,9 s) e limitar o inventário de plugins aos targets tocados (0,8–1,1 s). O plano continua completo. Estimativa: 1,8–2,6 s com 500 mil, no limite da meta. Custo: médio, sem mexer no plano.
- **C. Aceitar a meta até 100 mil.** Registrar em `00-visao-e-escopo.md` que o incremental abaixo de 2 s vale até 100 mil arquivos e que acima disso fica abaixo de 5 s. Custo: só documentação.

**Recomendação: B primeiro, medir com `TestScaleBenchmark`, e A só se B não ficar abaixo de 2 s.** B reaproveita o que A também precisa (manifesto por diferença, inventário restrito), então nada se perde.

## 2. Tamanho dos backups com banco grande

**Hoje**: o banco da escala completa tem 535 MB, metade em páginas livres deixadas pelo journal do deploy inicial. A API de backup online copia o arquivo inteiro, e a retenção de core/14 §3 (24 + 7 automáticos, 3 pré-migration, 1 de inicialização) pode passar de 15 GB.

**Opções**

- **A. `VACUUM INTO` nos backups.** O backup sai compacto (sem páginas livres) e consistente, lendo numa transação de leitura (no WAL não bloqueia as escritas do app). Mudança pequena em `sqlite.Backups.Create`; restauração e validação não mudam. Custo de tempo: o vacuum reescreve o banco (na ordem de segundos com 535 MB); o backup automático já roda fora das operações.
- **B. `auto_vacuum = INCREMENTAL` no banco** com `incremental_vacuum` depois de operações grandes. Encolhe o próprio banco, não só os backups. Ligar num banco existente exige um `VACUUM` completo único (migração lenta na escala grande) e o vacuum incremental fragmenta o arquivo.
- **C. A + medir.** Fazer A, rodar a escala completa e registrar o tamanho dos backups no relatório da F14.

**Recomendação: C.** É a menor mudança que resolve o problema medido; B fica para se o tamanho do banco em si virar queixa.

## 3. Recuperação de mods depois de perder o banco

**Hoje** (D100): "começar do zero" guarda o banco como `damaged` e abre o app vazio. A staging continua com as pastas dos mods (nome = ModID) e só tem o marcador da instância; não há metadado por mod. Um jogo implantado vira `foreign_deployment` bloqueante (nada é apagado), e "Adotar" (core/04 §11) não existe.

**O que dá para reconstruir sem o banco**: os arquivos de cada mod (pasta da staging), o archive de origem quando ainda está no ArchiveStore, e os links implantados (marcador do target + o que está no disco). **O que se perde**: nome exibido, versão, ordem, regras, perfis, categorias, tags e notas.

**Opções**

- **A. Metadado por mod daqui para frente + redescoberta + Adotar.** Gravar na pasta de cada mod um arquivo pequeno com nome, versão, origem e data (escrito no import e no reinstall, como o marcador da staging). Redescoberta: ao começar do zero (ou pela ação de pasta órfã de core/14 §5), cada pasta com ModID desconhecido vira mod de novo, com o metadado quando existe e o ModID como nome quando não. Adotar: com o marcador do target desta instância e os mods redescobertos, reconstruir o manifesto a partir do que está no disco (hardlink que aponta para um arquivo da staging) e marcá-lo como não verificado, para o próximo deploy fazer o scan completo. Custo: fase grande, toca biblioteca, import, deploy e a tela de recuperação.
- **B. Só redescoberta, sem Adotar.** Mods voltam pela staging; o jogo implantado continua pedindo purge manual (o usuário remove a implantação antiga e implanta de novo). Custo: médio.
- **C. Deixar como está** e cobrir pela tela de recuperação (restaurar backup é o caminho; com o item 2, backups ficam baratos de manter).

**Recomendação: A, como fase própria depois dos itens 1 e 2.** Precisa de decisão nova (formato do metadado por mod, o que conta como "link nosso" ao adotar) e de emendar core/04 §11 e core/14 §5 antes do código.

## Ordem sugerida

1. Backups com `VACUUM INTO` e medição (item 2, opção C): pequeno, resolve um risco real de disco.
2. Caches do deploy (item 1, opção B) e medição; plano incremental só se preciso.
3. Recuperação após perder o banco (item 3, opção A), com decisão e spec primeiro.
