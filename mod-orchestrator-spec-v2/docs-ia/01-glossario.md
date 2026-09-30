# Glossário canônico

Um termo por conceito. Se um documento, prompt ou código usar sinônimo, corrija para o termo daqui. Nomes em `código` são os usados em código/DTOs; a coluna UI mostra o rótulo em pt-BR (en entre parênteses quando útil).

## Jogo e ambiente

| Termo | UI | Definição |
|---|---|---|
| `GameDefinition` | Jogo | Identidade lógica de um jogo suportado (id, nome, capabilities, regras de detecção). Vem de um adapter. |
| `GameInstance` | Jogo gerenciado | Uma instalação concreta sendo gerenciada: raiz, targets, staging, archive store, método de deploy, adapter. Um jogo pode ter mais de uma instância (ex.: duas cópias do Skyrim). |
| `Adapter` | — | Implementação que fornece GameDefinitions e capabilities. V1: `generic` e `skyrimse` (D031). |
| `Capability` | — | Algo que o adapter declara suportar (`plugins`, `load_order`, `save_games`...). O core decide comportamento por capability, nunca por identidade de jogo. |
| `DeploymentTarget` (`Target`) | Pasta de destino | Pasta da instância onde arquivos são implantados, identificada por `TargetID` (`data`, `root`...). |
| `Location` | Caminho | `Target` + caminho relativo normalizado (sem diferenciar maiúsculas). Unidade de footprint, conflito, manifesto e external change. |
| `ModType` | Tipo de mod | Categoria técnica que define para qual target e com qual método os arquivos de um mod vão (ex.: `default`→`data`, `root`→raiz do jogo). Declarado pelo adapter. |
| `Staging` | Pasta de staging | Pasta da instância onde cada mod instalado vive isolado. Nunca é a pasta do jogo. |
| `ArchiveStore` | Pasta de arquivos | Pasta da instância onde os archives importados são retidos (D032). |
| `BackupStore` | — | Pasta da instância (mesmo volume do target) onde arquivos originais substituídos pelo deploy ficam guardados (D034). |

## Biblioteca

| Termo | UI | Definição |
|---|---|---|
| `Archive` | Arquivo | Arquivo compactado (ou pasta, D048) importado. Tem hash e nome original. Não é um mod. |
| `Mod` | Mod | Unidade lógica gerenciada. Tem identidade estável (`ModID`), metadados e no máximo uma Installation atual. |
| `Installation` | Instalação | Resultado de rodar um installer sobre um archive: arquivos, destinos, installer usado e opções escolhidas. Reinstalar gera nova Installation (novo ID). |
| `Installer` | Instalador | Estratégia que transforma archive em Installation (`basic`, `fomod`, instaladores do adapter). |
| `Footprint` | Arquivos do mod | Conjunto de Locations que a Installation fornece. |
| `Variant` | Variante | Outro Mod criado a partir do mesmo archive ou de versão diferente do mesmo mod, com rótulo próprio. |
| `Category` | Categoria | Metadado hierárquico para filtro/agrupamento. Nunca afeta deploy. |
| `ModAttributes` | — | Metadados editáveis: nome customizado, versão, autor, notas, destaque (cor/ícone), tags. |

## Profile e ordem

| Termo | UI | Definição |
|---|---|---|
| `Profile` | Perfil | Configuração nomeada de uma instância: seleção, ordem, plugins, settings locais. Exatamente um ativo por instância (D037). |
| `ModEntry` | — | Estado de um mod dentro de um profile: `enabled`, `enabledAt`. |
| `ModOrder` | Ordem de mods / Prioridade | Lista do profile com todos os mods e separadores. Posição maior vence (D025). **Substitui o termo "install order".** |
| `Priority` | Prioridade (#) | Posição do mod na ModOrder (1 = menor). |
| `Separator` | Separador | Item visual da ModOrder para agrupar mods. Não tem arquivos nem efeito em deploy. |
| `OrderRule` | Regra "vence" | Restrição persistida "A antes de B" ⇔ "B vence A". Pertence à instância (D026). |
| `DependencyRule` | Requer / Recomenda | "A requer B" (obrigatória) ou "A recomenda B" (opcional). |
| `IncompatibilityRule` | Incompatível | "A é incompatível com B": não podem estar habilitados juntos sem aviso bloqueante. |
| `ModReference` | — | Forma de uma regra apontar para um mod: por `ModID` local na V1; por identidade de provider + faixa de versão no futuro. |

## Conflitos

| Termo | UI | Definição |
|---|---|---|
| `FileConflict` | Conflito | Resultado **calculado**: uma Location fornecida por dois ou mais mods habilitados. |
| `Provider` | Fornecedor | Mod que fornece uma Location. |
| `Winner` | Vencedor | Provider cujo arquivo é implantado na Location. |
| `ConflictResolution` | Como foi decidido | `order` (prioridade), `rule` (há OrderRule entre os envolvidos), `override`, `redundant` (conteúdo idêntico). |
| `FileOverride` | Escolha por arquivo | Intenção persistida: "nesta Location, o vencedor é o mod X", independente da ordem. |
| `FileExclusion` | Arquivo ocultado | Intenção persistida: "o mod X não fornece esta Location" (equivalente a esconder arquivo no MO2). |
| `ConflictReview` | Revisado | Marca de que o usuário viu o conflito entre A e B no estado atual. Só informativa (D027). |

## Plugins

| Termo | UI | Definição |
|---|---|---|
| `Plugin` | Plugin | Arquivo carregável reconhecido pelo adapter (Skyrim: `.esp/.esm/.esl`). Pode vir de mod, do jogo base ou de fora do gerenciador. |
| `PluginState` | Ativo | Plugin habilitado/desabilitado no profile. |
| `LoadOrder` | Load order | Ordem de carregamento dos plugins no profile. **Nunca** confundir com ModOrder (D006). |
| `PluginRule` | Regra de plugin | "Plugin A carrega depois de B". Pertence à instância. |
| `PluginGroup` | Grupo | Conjunto nomeado de plugins com ordem entre grupos. |
| `IndexLock` | Posição travada | Plugin fixado numa posição da load order. |
| `Master` | Master | Plugin do qual outro depende (declarado no cabeçalho). |
| `Sorter` | Ordenar | Estratégia do adapter que produz restrições para o motor de ordenação (D029/D041). |

## Deploy

| Termo | UI | Definição |
|---|---|---|
| `DesiredState` | — | Mapa Location → arquivo vencedor + método, derivado de profile + instância. Nunca persistido como verdade (anti-pattern 13). |
| `DeploymentPlan` | Plano de deploy | Diff entre desejado, aplicado e observado, com ações por Location. |
| `DeploymentJournal` | — | Registro persistido do plano em execução, para recuperação (D035). |
| `DeploymentManifest` | — | Estado **aplicado**: tudo que o gerenciador implantou, por target, com origem, método e evidência. |
| `DeploymentMethod` | Método de deploy | `hardlink`, `symlink`, `copy`. |
| `DeploymentStatus` | Status de deploy | `in_sync`, `pending`, `blocked`, `failed`, `unknown`, `never_deployed`. |
| `Purge` | Purge / Remover implantação | Remove do jogo tudo que o manifesto registra e restaura backups. Não desinstala mods. |
| `ExternalChange` | Alteração externa | Divergência entre aplicado e observado (`missing`, `modified`, `replaced`, `unexpected`, `permission`), ou arquivo de load order alterado fora do app. |
| `GeneratedFile` | Arquivo gerado | ExternalChange `unexpected` que pode ser capturado para um mod (D046). |

## Operação, diagnóstico e comunicação

| Termo | UI | Definição |
|---|---|---|
| `Operation` | Operação | Execução longa rastreável (D019). |
| `Event` | — | Fato ocorrido e persistido (D020). |
| `HealthCheck` | Verificação | Regra que produz diagnósticos a partir dos fatos atuais. Tem ID estável (`core/10`). |
| `Diagnostic` | Problema | Problema acionável: severidade, evidência, impacto, ações. **Derivado**, com chave estável para supressão. |
| `Notification` | Notificação | Entrega ao usuário de um diagnóstico novo ou de um resultado de operação. |
| `HistoryEntry` | Histórico | Ação do usuário ou do sistema legível por humanos, derivada de eventos, filtrável e às vezes reversível. |
| `Snapshot` | Ponto de restauração | Cópia do estado desejado de um profile antes de operações em massa. |
| Log técnico | Log | Registro técnico para depuração. Não é histórico nem diagnóstico. |

## Termos proibidos

| Não usar | Usar |
|---|---|
| install order | ModOrder / prioridade |
| "resolver conflito" como ato obrigatório | revisar conflito / escolher vencedor |
| load before/after (para mods) | "X vence Y" |
| desinstalar (para purge) | purge / remover implantação |
| deploy completo | deploy (é sempre por diff, D033) |
