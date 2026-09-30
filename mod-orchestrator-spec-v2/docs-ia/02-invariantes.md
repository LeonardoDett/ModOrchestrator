# Invariantes

Regras que **nunca** podem ser falsas, em nenhuma fase. Cada invariante tem ID estável; documentos, testes e revisões devem citá-lo (`INV-DEP-03`). Alterar ou remover um invariante exige decisão em `decisoes.md`.

Cada invariante deve ter pelo menos um teste automatizado quando sua fase for implementada. A coluna "Fase" indica quando o teste passa a ser obrigatório.

## Identidade e caminhos (INV-ID)

| ID | Invariante | Fase |
|---|---|---|
| INV-ID-01 | Nenhuma entidade usa caminho absoluto como identidade. Mods, profiles, instâncias e targets têm IDs opacos. | F1 |
| INV-ID-02 | Todo caminho relativo persistido é normalizado: separador `/`, sem `.`/`..`, sem raiz, sem ADS, sem nome reservado do Windows; comparação sem diferenciar maiúsculas. | F1 |
| INV-ID-03 | O nome da pasta de um mod na staging é derivado do `ModID`, nunca do nome exibido (renomear um mod não move arquivos). | F4 |
| INV-ID-04 | Nenhum arquivo extraído de archive é escrito fora da pasta temporária da operação (proteção contra zip-slip). | F4 |

## Biblioteca (INV-LIB)

| ID | Invariante | Fase |
|---|---|---|
| INV-LIB-01 | Mod só é `installed` se sua Installation atual existe por completo na staging. Falha ou cancelamento devolve ao último estado consistente. | F1 |
| INV-LIB-02 | Dois arquivos de uma mesma Installation nunca têm a mesma Location. | F1 |
| INV-LIB-03 | A staging nunca é a pasta do jogo nem está dentro de um target. | F3 |
| INV-LIB-04 | Importar nunca executa binário ou script contido no archive. | F4 |
| INV-LIB-05 | Remover um mod remove também suas entradas em todos os profiles, e as regras/overrides que o referenciam ficam marcadas como órfãs (não apagadas silenciosamente). | F4 |

## Profile e ordem (INV-ORD)

| ID | Invariante | Fase |
|---|---|---|
| INV-ORD-01 | Toda instância tem pelo menos um profile e exatamente um ativo. | F5 |
| INV-ORD-02 | A ModOrder de um profile contém cada mod instalado da instância exatamente uma vez (habilitado ou não). | F5 |
| INV-ORD-03 | Toda ModOrder persistida satisfaz todas as OrderRules cujos dois lados estão presentes, ou existe diagnóstico bloqueante de ciclo explicando por que não. | F5 |
| INV-ORD-04 | Uma OrderRule/PluginRule criada pelo usuário nunca fecha ciclo (D028). | F5 |
| INV-ORD-05 | O motor de ordenação é determinístico: mesma entrada ⇒ mesma saída. | F1 |
| INV-ORD-06 | ModOrder e LoadOrder nunca compartilham estrutura, armazenamento ou tela (D006). | F5 |

## Conflitos (INV-CON)

| ID | Invariante | Fase |
|---|---|---|
| INV-CON-01 | Para cada Location desejada existe exatamente um vencedor, calculado por: FileOverride válido > maior prioridade entre providers habilitados não excluídos. | F6 |
| INV-CON-02 | Nenhuma regra ou override é criado sem ação explícita do usuário ou fonte declarada (D004). | F6 |
| INV-CON-03 | Override cujo mod não fornece mais a Location (ou está desabilitado) é ignorado **e** gera diagnóstico `override_stale`. | F6 |
| INV-CON-04 | Conflitos são sempre recalculáveis a partir de profile + instância; nunca são persistidos como verdade. | F6 |

## Deploy (INV-DEP)

| ID | Invariante | Fase |
|---|---|---|
| INV-DEP-01 | O deploy só remove ou substitui arquivos que o manifesto registra como do gerenciador **e** cuja evidência observada ainda confere. | F7 |
| INV-DEP-02 | Arquivo não gerenciado nunca é apagado; se precisa ser substituído, vai para o BackupStore e é restaurado no purge (D034). | F7 |
| INV-DEP-03 | Nenhuma operação de filesystem acontece antes de o plano estar gravado no journal. | F7 |
| INV-DEP-04 | Deploy é idempotente: executar duas vezes seguidas sem mudanças produz plano vazio na segunda. | F7 |
| INV-DEP-05 | O manifesto só é atualizado para refletir operações verificadas. | F7 |
| INV-DEP-06 | Auto-deploy nunca executa um plano que exige decisão (D036). | F7 |
| INV-DEP-07 | Purge seguido de deploy restaura exatamente o estado anterior ao purge (dado o mesmo estado desejado). | F7 |
| INV-DEP-08 | Um target com marcador de outra instância ou de outro gerenciador bloqueia o deploy até decisão explícita. | F7 |
| INV-DEP-09 | Pastas só são removidas no purge/cleanup se foram criadas pelo gerenciador e estão vazias. | F7 |

## Alterações externas (INV-EXT)

| ID | Invariante | Fase |
|---|---|---|
| INV-EXT-01 | Toda divergência entre aplicado e observado nos caminhos tocados por uma operação é detectada antes dessa operação escrever neles. | F7 |
| INV-EXT-02 | Nenhuma ExternalChange é resolvida sem decisão do usuário, exceto as ações declaradas como seguras e registradas (ex.: recriar link ausente de mod habilitado em deploy explícito). | F8 |
| INV-EXT-03 | Arquivos gerados nunca são apagados automaticamente (D046). | F8 |

## Plugins (INV-PLG)

| ID | Invariante | Fase |
|---|---|---|
| INV-PLG-01 | Nenhuma load order aplicada viola restrição rígida do adapter (masters antes de dependentes, masters implícitos fixos). | F11 |
| INV-PLG-02 | O arquivo de load order do jogo só é escrito pelo adapter, a partir da LoadOrder desejada do profile ativo. | F11 |
| INV-PLG-03 | Alteração externa no arquivo de load order nunca é sobrescrita sem triagem (D040). | F11 |

## Operações, eventos e UI (INV-OPS)

| ID | Invariante | Fase |
|---|---|---|
| INV-OPS-01 | Estado e eventos correspondentes são gravados na mesma transação; publicação acontece após o commit (D020). | F0 |
| INV-OPS-02 | No máximo uma operação mutante por instância (D038). | F4 |
| INV-OPS-03 | Operação interrompida nunca aparece como em execução nem como concluída (D019). | F0 |
| INV-OPS-04 | A UI não guarda estado de domínio próprio; relê do backend após eventos (D021). | F2 |
| INV-OPS-05 | Todo erro que chega à UI tem código estável e parâmetros; a mensagem é traduzida na UI (D044). | F2 |
| INV-OPS-06 | Todo diagnóstico bloqueante tem pelo menos uma ação sugerida que leva ao lugar onde ele pode ser resolvido. | F9 |
