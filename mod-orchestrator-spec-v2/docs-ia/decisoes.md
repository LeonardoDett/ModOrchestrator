# Decisões arquiteturais

Formato: cada decisão tem ID estável. Decisões não são apagadas; quando deixam de valer, recebem `Status: substituída por Dxxx` e a motivação original é preservada (ver `skills/maintain-ai-docs`).

Status possíveis: `vigente`, `emendada por Dxxx` (continua valendo com o ajuste), `substituída por Dxxx`.

---

## D001 — Vortex como referência operacional
Status: vigente (a D042, que a estendia ao layout, foi substituída por D119: o Vortex é referência de fluxo e comportamento, não de distribuição de tela)

Vortex é a principal referência para fluxos de usuário, deploy/purge, regras, triagem, extensibilidade e organização da aplicação. Não significa copiar a implementação interna.

## D002 — MO2 como referência de isolamento e prioridade
Status: vigente (concretizada por D025)

A biblioteca mantém cada mod isolado e o usuário deve conseguir compreender claramente qual mod está vencendo outro.

## D003 — Estado desejado vs aplicado
Status: emendada por D033

Perfil + mods + regras = estado desejado. DeploymentManifest = estado aplicado. Um deploy é uma transição entre esses estados.

## D004 — Conflito de arquivo e regra de conflito são conceitos diferentes
Status: vigente

Conflito é resultado calculado. Regra é intenção persistida. Uma regra nunca deve ser criada automaticamente apenas porque existe um conflito.

## D005 — Regra pode ser por par e por arquivo
Status: emendada por D025/D026

V1 deve suportar regra de prioridade entre dois mods e override por arquivo/caminho. Isso fecha uma lacuna importante do modelo anterior: Vortex permite resolver conflitos em nível de arquivo, não somente de mod (https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Managing-File-Conflicts).

Emenda: "regra por par" passa a ser `OrderRule` (restrição sobre a ordem de mods, D025) e "regra por arquivo" passa a ser `FileOverride`. Ambas pertencem à GameInstance (D026).

## D006 — Install order não é load order
Status: vigente (terminologia emendada por D025)

Prioridade de arquivos e ordem de plugins são camadas independentes.

Emenda: o termo "install order" é abandonado por sugerir cronologia de instalação. O termo canônico é **ordem de mods** (`ModOrder`); "prioridade" é a posição nela. Ver `docs-ia/01-glossario.md`.

## D007 — Deploy sempre reconciliável
Status: vigente (detalhada por D033/D035)

A operação deve poder ser repetida após interrupção e deve detectar divergências antes de destruir ou substituir arquivos.

## D008 — Arquivo externo nunca é presumido como pertencente ao gerenciador
Status: vigente

Alterações externas geram estado `ExternalChange` e fluxo de decisão. Vortex usa esse modelo para alterações feitas por ferramentas externas como FNIS/xEdit (https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Managing-External-Changes).

## D009 — Instaladores são domínio próprio
Status: vigente

Um arquivo compactado não é necessariamente um mod pronto. O sistema deve distinguir archive, mod root, installer e resultado de instalação.

## D010 — FOMOD preparado desde o contrato
Status: substituída por D030

Texto original: V1 pode não implementar todas as opções do FOMOD, mas o pipeline não pode assumir que todo archive é simplesmente extraível. Um instalador futuro deve poder apresentar passos, opções, requisitos e resultado determinístico.

Motivo da substituição: sem FOMOD a V1 não entrega paridade com o Vortex para jogos Bethesda, onde a maioria dos mods relevantes usa FOMOD.

## D011 — Game adapter/extension por capacidade
Status: vigente

A aplicação pergunta ao adaptador quais capacidades existem: plugins, load order, installers, mod types, save games, tools, discovery etc. Não usa `if game == ...` no core.

## D012 — Extensões como fronteira futura
Status: vigente (escopo V1 definido por D031)

Suporte específico de jogos e funcionalidades deve ser adicionável sem editar o núcleo. O Vortex possui uma arquitetura extensível e registra sistemas de mod types e load order por jogo (https://github.com/Nexus-Mods/Vortex/blob/master/packages/vortex-api/README.md).

## D013 — Downloads ficam fora da V1
Status: vigente

A biblioteca deve aceitar uma origem abstrata para permitir providers futuros, mas V1 usa apenas importação local.

## D014 — UI é orientada por problemas
Status: vigente

O usuário deve descobrir primeiro o que está impedindo o setup de funcionar, depois executar a ação. Erros não são apenas logs; devem possuir diagnóstico e ação.

## D015 — Dashboard futuro, mas shell atual extensível
Status: vigente

A navegação deve reservar áreas para Downloads, Tools, Collections e outros recursos sem criar funcionalidades falsas.

## D016 — dettmann-ui é obrigatório
Status: vigente

Toda interface deve usar os componentes, tokens, temas e padrões disponíveis na biblioteca local. Não criar um segundo design system. Quando faltar um componente genérico, ele é criado **na biblioteca** seguindo `component-authoring`, nunca no app (ver `ui/03-componentes-e-padroes.md` › Lacunas).

## D017 — Stack e estrutura modular (F0)
Status: vigente

Backend em Go com Wails v2; frontend React + TypeScript + Vite em `frontend/`. Um único módulo Go (`modorchestrator`) com pacotes por camada sob `internal/`:

- `core/domain`: entidades e invariantes puras (sem I/O, sem SQL, sem Wails);
- `core/application`: casos de uso e *ports* (interfaces) que a infraestrutura implementa;
- `infrastructure`: SQLite, event bus, relógio, IDs, diretório de dados;
- `adapters`: adaptadores de jogo/provider (F3+);
- `bridge`: transporte UI ↔ core (DTOs, queries, repasse de eventos); único pacote de runtime que importa Wails;
- `bootstrap`: composition root; único lugar que conhece todas as implementações concretas.

A regra `domain <- application <- infrastructure/adapters` é verificada por teste (`internal/architecture_test.go`). Violação quebra o build de testes.

## D018 — Persistência inicial em SQLite embutido
Status: vigente

Estado persistido fica em `state.db` (SQLite) no diretório de dados da aplicação (`%APPDATA%/ModOrchestrator` no Windows; sobrescrevível por `MODORCHESTRATOR_DATA_DIR`). Driver `modernc.org/sqlite` (Go puro, sem CGO) para não exigir toolchain C. Migrations são arquivos SQL numerados, embutidos no binário, aplicados em ordem e cada um em sua transação; um banco com schema mais novo que o build é recusado em vez de usado. Timestamps em UTC com largura fixa para ordenação lexical. O diretório de dados guarda somente estado do próprio gerenciador; pastas de jogo e staging pertencem ao `GameInstance`.

## D019 — Modelo de Operation
Status: vigente

`Operation` é agregado de domínio com status `pending | running | succeeded | failed | cancelled | interrupted`, steps declarados na criação e progresso por step (total 0 = indeterminado). Transições são validadas no domínio: um step por vez; sucesso exige todos os steps `completed` ou `skipped`; falha carrega erro estruturado (`code`, `message`, `step`, `detail`, `retryable`) e marca o step em execução como `failed`. Na inicialização, operações deixadas `pending/running` pelo processo anterior viram `interrupted`, preservando o step onde pararam; nunca parecem vivas nem concluídas. A retomada/recuperação específica de cada tipo de operação (ex.: deploy) é responsabilidade do módulo dono (D007, D035).

## D020 — Modelo de Event
Status: vigente

`Event` é um fato já ocorrido (`id`, `sequence`, `type`, `occurredAt`, `operationId?`, `subject`, `payload`). Toda transição de `Operation` gera um evento. Estado da operação e seus eventos são gravados na mesma transação (append-only, `sequence` monotônico) e publicados no event bus somente após o commit. Evento não é diagnóstico, nem notificação, nem log técnico: diagnósticos e notificações podem ser derivados de eventos, e a tabela de eventos é a base do histórico (core/10), mas os conceitos continuam separados.

## D021 — Contrato da UI bridge
Status: vigente

DTOs com tags JSON vivem em `internal/bridge`; o domínio não conhece serialização. Eventos chegam ao frontend pelo canal `operation:event` e são tratados apenas como sinal para reler o estado no backend (fonte de verdade); a UI não reconstrói estado de domínio a partir de eventos. Fora do shell Wails (browser, testes) a UI usa um backend explicitamente offline e mostra isso, sem dados inventados.

## D022 — Integração da dettmann-ui
Status: emendada por D052 (tema final definido por D043)

O frontend depende de `dettmann-ui` via `file:../dettmann-ui-vnext` (pacote local, versionado fora deste repositório). JS e tipos vêm do `dist/` da biblioteca; estilos via `@import "dettmann-ui/theme.css"` processado pelo Tailwind v4 do app (a lib continua dona dos tokens). O Vite deduplica `react`, `react-dom` e `lucide-react` porque o pacote linkado tem `node_modules` próprio. Até a fase de fundação de UI (F2, ver D024) definir o tema do produto, usa-se o tema registrado `forest` em modo dark. Consequência: o frontend não roda em CI enquanto a biblioteca não for publicada/versionada; CI cobre o core Go.

Pendência conhecida (não é decisão de produto): na versão atual da biblioteca o typecheck falha (tipagem do recipe engine para recipes sem `variants`), o que impede o `tsup` de gerar `.d.ts`. Os tipos são gerados à parte com `tsc --emitDeclarationOnly` (ver README do app). A correção pertence à biblioteca.

Atualização (F2): pendência resolvida na biblioteca. O recipe engine passou a tipar variantes por chave (sem assinatura de índice), o typecheck da lib está limpo e `npm run build` volta a gerar `.d.ts`. O tema `forest` foi trocado pelo `orchestrator` (D043).

## D023 — Navegação inicial
Status: emendada por D120 (a seção global virou o nível do app; continua valendo: sem jogo ativo não há espaço do jogo, e área reservada não vira item navegável)

Na F0 a sidebar contém apenas a seção global (Dashboard, Games, Extensions, Settings), cada uma com empty state honesto e sem ações. A seção de workspace do jogo só aparece com jogo ativo e é derivada de capabilities (F2/F3 do plano atual). Áreas reservadas (Downloads, Tools, Collections) não aparecem como itens navegáveis (anti-pattern 18); teste de navegação protege isso.

---

## D024 — Revisão 2.1 da especificação e renumeração das fases
Status: vigente

A revisão de 2026-09-30 (ver `docs-ia/06-revisao-2026-09-30.md`) reordenou o plano em **fatias verticais**: cada fase de core entrega também a tela mínima que permite demonstrá-la. Motivo: o plano anterior colocava deploy antes de perfis/conflitos (deploy depende de ambos para saber o vencedor de cada arquivo) e toda a UI no fim, o que tornava impossível o critério "a fase possui demonstração manual".

Mapa de fases antigo → novo (referências antigas em código/comentários devem ser lidas por esta tabela):

| Antigo | Novo | Conteúdo |
|---|---|---|
| F0 | F0 | Bootstrap (concluída) |
| F1 | F1 | Domínio |
| F11 | F2 | Fundação de UI (shell, tema, i18n, DataTable) |
| F2 | F3 | Jogos, adapters, discovery |
| F3 + parte F4 | F4 | Biblioteca, importação, installer básico |
| F6 | F5 | Perfis e ordem de mods |
| F7 | F6 | Conflitos, overrides |
| F5 | F7 | Deploy/Purge |
| F10 | F8 | External changes e arquivos gerados |
| F8 | F9 | Dependências, diagnósticos, notificações, histórico |
| F4 (FOMOD) | F10 | FOMOD completo |
| F9 | F11 | Plugins e load order |
| F12/F13 | F12 | Settings, Dashboard, Overview, Launch |
| F13 | F13 | Polimento de UX |
| F14 | F14 | Hardening e recuperação |
| F15 | F15 | Release V1.0 |
| F16 | — | Roadmap pós-V1 (`core/15-futuro.md`) |

## D025 — Modelo híbrido de ordem de mods
Status: vigente

Escolhido pelo usuário em 2026-09-30.

- Cada Profile possui uma **ModOrder**: lista explícita e visível de todos os mods da instância (habilitados ou não) e de separadores. Posição maior = prioridade maior = vence conflitos de arquivo (modelo mental do MO2: "quem está mais abaixo vence").
- **OrderRules** (`A antes de B`, isto é, "B vence A") são restrições persistidas, no estilo Vortex. A ModOrder de qualquer profile precisa satisfazer todas as OrderRules cujos dois lados estão presentes.
- Quando uma regra nova, um mod novo ou uma ação do usuário deixaria a ordem inválida, o motor de ordenação (D029) produz a ordem válida **com o menor deslocamento possível** a partir da ordem atual, e registra o motivo de cada movimento.
- Mover manualmente um mod para uma posição que viola regra é recusado com explicação e alternativas ("mover para a posição válida mais próxima" ou "mover e remover a regra X").
- A UI fala em "X vence Y"; o armazenamento é uma restrição de ordem. Os termos "load before/after" do Vortex não aparecem na UI de mods (ver D006).

Alternativas rejeitadas: só regras (Vortex), pela ordem opaca e pelos diálogos de ciclo frequentes; só lista (MO2), porque a lista não tem memória do porquê e regras de metadados/coleções futuras não teriam onde viver.

## D026 — Conteúdo pertence à instância; seleção e posição pertencem ao profile
Status: vigente

| Pertence à GameInstance (compartilhado por todos os profiles) | Pertence ao Profile |
|---|---|
| Mods, instalações, archives, metadados, categorias, notas | Mods habilitados (`ModEntry.enabled`) |
| OrderRules, DependencyRules, IncompatibilityRules | ModOrder e separadores |
| FileOverrides e FileExclusions | Estado enabled dos plugins |
| PluginRules, PluginGroups, atribuição de grupo | LoadOrder desejada e locks de índice |
| Tipo de mod (ModType) | Configurações de jogo locais e namespace de saves (capability) |

Motivo: regras e overrides descrevem o **conteúdo** dos mods (verdadeiro em qualquer profile); seleção e ordem descrevem **uma configuração**. Assim o Vortex armazena regras no mod, e o MO2 armazena ordem por profile. Clonar um profile nunca duplica regras.

## D027 — Todo conflito tem vencedor determinístico; conflitos não bloqueiam deploy
Status: vigente

Com ModOrder explícita (D025), todo conflito já tem vencedor: override > prioridade. O estado de um conflito é `decidido pela ordem`, `decidido por regra` (há OrderRule entre os envolvidos), `decidido por override` ou `redundante` (conteúdo idêntico). "Não revisado" (conflito novo desde a última revisão do usuário) é um diagnóstico **informativo**, nunca bloqueante. Isso supera o Vortex, onde conflito sem regra bloqueia o fluxo e força decisões sem contexto.

## D028 — Ciclos são recusados na criação
Status: vigente (emendada por D143 para dados de provedor)

Criar uma OrderRule ou PluginRule que feche um ciclo é recusado no momento da criação, mostrando o ciclo. Ciclos só podem existir se vierem de fontes externas (metadados de mod, coleções, LOOT futuro); nesse caso viram diagnóstico **bloqueante** para reordenação e deploy, com os participantes e as regras envolvidas. O motor nunca quebra ciclo arbitrariamente.

## D029 — Motor de ordenação por restrições compartilhado
Status: vigente

Mods (D025) e plugins (core/08) usam o mesmo motor de domínio: itens, restrições rígidas (arestas "antes de"), posições travadas, ordem atual como preferência, saída estável com deslocamento mínimo, explicação por movimento e detecção de ciclo com participantes. Adapters fornecem restrições (ex.: masters antes de dependentes); o motor não conhece jogos.

## D030 — FOMOD XML completo na V1
Status: vigente (substitui D010)

Escolhido pelo usuário em 2026-09-30. O instalador FOMOD (ModuleConfig.xml) é implementado por completo na V1: steps, grupos, todos os tipos de seleção, flags, dependências condicionais, visibilidade de steps, `conditionalFileInstalls`, imagens e descrições. FOMOD com script C# (`script.cs`) não é executado: gera diagnóstico `installer_unsupported` com o motivo. As escolhas ficam gravadas na Installation e são pré-selecionadas no reinstall.

## D031 — Primeiro adapter real: Skyrim SE/AE; adapters compilados na V1
Status: vigente

Escolhido pelo usuário em 2026-09-30. A V1 traz dois adapters **compilados no binário** e registrados pelo bootstrap através do mesmo contrato que extensões usarão no futuro:

1. `generic`: jogo definido pelo usuário (pasta raiz + um ou mais targets), sem plugins.
2. `skyrimse`: Skyrim Special Edition / Anniversary Edition, com mod types, plugins, load order e checagens próprias (`core/12-adapter-skyrim-se.md`).

Extensões carregadas em runtime (pacotes de terceiros) ficam pós-V1. Motivo: plugins e load order não podem ser validados só com adapter genérico, e o caso Bethesda é o mais exigente.

## D032 — Archives importados são retidos
Status: vigente

Todo archive importado é guardado no **ArchiveStore** da instância (padrão: copiar; opções: mover, ou não reter). Motivo: reinstalar, trocar opções de FOMOD e reconstruir staging dependem do archive (Vortex mantém downloads pelo mesmo motivo). Mod sem archive retido continua funcional, mas reinstall exige reimportar (diagnóstico informativo).

## D033 — Três estados: desejado, aplicado, observado
Status: vigente (emenda D003)

- **Desejado**: derivado de profile + instância (D026).
- **Aplicado**: DeploymentManifest (o que o gerenciador afirma ter feito).
- **Observado**: leitura do filesystem no momento.

Deploy é **incremental por diff** entre os três: nunca faz purge completo seguido de deploy completo como etapa normal (o Vortex faz isso na troca de profile; aqui a troca só aplica a diferença). Divergência entre aplicado e observado é ExternalChange e é resolvida antes de tocar nos caminhos afetados.

## D034 — Arquivos originais substituídos vão para backup
Status: vigente

Se um arquivo desejado ocupa um caminho com arquivo não gerenciado (ex.: arquivo do jogo base), o original é movido para o BackupStore da instância (mesmo volume), registrado no manifesto e restaurado no purge. Isso acontece sem pergunta, mas aparece no resumo do plano de deploy ("N arquivos originais serão preservados"). Paridade com `.vortex_backup` do Vortex, mas fora da pasta do jogo.

## D035 — Journal de deploy e arquivos marcadores
Status: vigente

- Antes de mexer no filesystem, o deploy grava o plano como **journal** no banco; cada operação de arquivo é marcada como feita. Deploy interrompido é detectado na inicialização e recuperado por reconciliação (novo deploy a partir do observado), nunca por "desfazer às cegas".
- Cada target recebe um marcador `.modorchestrator-deployment.json` (instância, profile, hash do manifesto); a staging recebe `.modorchestrator-staging`. Marcadores servem para recuperar evidência de posse se o banco se perder e para detectar outra instância.
- Marcadores de outros gerenciadores (ex.: `vortex.deployment.json`, pasta de staging do Vortex) geram diagnóstico bloqueante "outro gerenciador implantou neste jogo" com ações guiadas.

## D036 — Auto-deploy ligado por padrão, sem nunca decidir
Status: vigente

Paridade com "Deploy mods when enabled" do Vortex: mudanças no estado desejado disparam deploy automático (agrupando mudanças próximas). Se o plano exigir qualquer decisão (external change, unmanaged ambíguo, bloqueio), o auto-deploy para antes de tocar no filesystem e produz diagnóstico; nunca escolhe pelo usuário. Configurável em Settings.

## D037 — Profiles sempre disponíveis; um ativo por instância
Status: vigente

Diferente do Vortex, não existe toggle "Enable Profile Management": toda instância nasce com o profile `Default` e a tela Profiles está sempre acessível. Exatamente um profile ativo por instância. O profile ativo não pode ser excluído, e a instância nunca fica sem profile.

## D038 — Uma operação mutante por GameInstance
Status: vigente

Operações que alteram estado de uma instância (import/install, deploy, purge, sort, mover staging, reconciliar) adquirem um lock da instância. Uma segunda operação mutante é recusada com erro estruturado `instance_busy` (a UI desabilita a ação e mostra a operação em curso); ela não entra em fila implícita. Leituras nunca são bloqueadas. Exceção explícita: imports podem formar uma **fila visível** de instalação (paridade com instalar vários arquivos arrastados), que processa um item por vez sob o mesmo lock.

## D039 — Plataforma V1: Windows 10/11 x64
Status: vigente

Caminhos são comparados sem diferenciar maiúsculas (já implementado em `relpath`), suportam long paths (prefixo `\\?\` na infraestrutura) e nunca contêm `..`, raiz absoluta, ADS (`:`) ou nomes reservados (`CON`, `NUL`...). Linux/Proton fica pós-V1; o domínio não pode assumir Windows (a normalização é regra de domínio, a API do SO é infraestrutura).

## D040 — Load order aplicada é o arquivo do jogo
Status: vigente

Para jogos com capability `load_order`, a ordem aplicada é o que o adapter serializa (Skyrim SE: `plugins.txt`). Mudanças externas nesse arquivo (launcher, Creation Club, outra ferramenta) são ExternalChange do tipo `load_order` com triagem (importar para o profile / restaurar a do profile). Nunca são sobrescritas silenciosamente.

## D041 — Sorter nativo na V1; LOOT como provedor de dados depois
Status: emendada por D140 (o provedor LOOT entra antes da v1); detalhada por D143

O sort da V1 é nativo (D029) e usa: masters implícitos, masters antes de dependentes, flag ESM, regras e grupos do usuário, locks. A integração com dados do LOOT (masterlist: grupos, load-after, mensagens de plugin sujo) entra na V1.x como **provedor de restrições**, não como algoritmo, com revisão de licença. Motivo: libloot é C++ e o valor principal (dados) pode ser consumido sem acoplar o core ao algoritmo.

## D042 — Distribuição de telas e elementos segue o Vortex
Status: substituída por D119 (substituía a orientação "não copiar cegamente" da UI v2)

Diretriz do usuário: onde o Vortex já resolveu o problema, reproduzir a distribuição de elementos (se ele usa select, usar select; se usa modal, usar modal). Divergências só são permitidas se listadas em `ui/00-principios-e-shell.md` › Divergências aprovadas, cada uma com motivo. Divergências aprovadas nesta revisão: tela dedicada de Conflicts, tela Load Order separada de Plugins, tela Diagnostics, Profiles sempre visível (D037), Overview do jogo, linguagem "X vence Y" (D025).

## D043 — Tema do produto
Status: vigente (detalhada por D122: cor de destaque por jogo e paleta categórica)

O produto usa um tema registrado na dettmann-ui (`orchestrator`, derivado de `forest`), escuro por padrão, com orçamento 60/30/10 mapeado para os papéis semânticos da lib (`ui/04-tema-60-30-10.md`). Status nunca é comunicado só por cor (sempre ícone + rótulo), porque verde é ao mesmo tempo marca e sucesso. Modo claro existe, mas não é foco de ajuste fino na V1.

## D044 — Internacionalização desde a fundação de UI
Status: vigente

Todo texto de interface vem de catálogo i18n desde a F2. Idiomas V1: `en` e `pt-BR`. Códigos de erro, IDs de diagnóstico e eventos são estáveis e independentes de idioma; o backend envia código + parâmetros, e a UI traduz.

## D045 — Launch do jogo na V1; hotbar de tools reservada
Status: emendada por D120 (o "Play" sai da barra de título e vai para o rodapé do menu do jogo; as regras de pré-lançamento não mudam)

A barra de título tem o lançador do jogo ("Play"), como o `titlebar-launcher` do Vortex. Antes de lançar: deploy pendente é oferecido (ou executado, se auto-deploy estiver ligado), diagnósticos bloqueantes impedem o launch com explicação. Cadastro de ferramentas externas (hotbar/Starter) fica reservado: o espaço existe no layout, mas não aparece como ação até ser implementado (anti-pattern 18).

## D046 — Arquivos gerados (overwrite) nunca são apagados automaticamente
Status: vigente

Arquivos novos que aparecem nos targets depois de um deploy (gerados pelo jogo ou por ferramentas como xEdit, Nemesis, BodySlide) são ExternalChange `unexpected`. O usuário pode capturá-los para um mod novo ou existente (equivalente ao `Overwrite` do MO2), marcá-los como não gerenciados permanentemente (ignorar) ou abrir a pasta. O gerenciador nunca os apaga sem decisão explícita.

## D047 — Escopo por release
Status: vigente

As fronteiras V1.0 / V1.x / V2 estão em `00-visao-e-escopo.md`. Uma funcionalidade só muda de release com decisão registrada.

## D048 — Importar pastas além de archives
Status: vigente

Além de ZIP/7Z/RAR, a V1 importa uma pasta já descompactada (arrastar pasta ou "Importar pasta"). A pasta é copiada para o ArchiveStore como origem retida (D032) e segue o mesmo pipeline (root, installer, FOMOD).

## D049 — Categorias de estado no domínio verificadas por teste
Status: vigente

Os pacotes de domínio são classificados como **desejado** (`game`, `mod`, `profile`, `rules`, `override`, `plugin`, `settings`), **aplicado** (`deployment`), **calculado** (`conflict`, `deployplan`, `deploystate`, `externalchange`, `diagnostic`, `dependency`) e **algoritmo puro** (`ordering`, `relpath`). `internal/architecture_test.go` falha se: desejado importar aplicado/calculado; aplicado importar desejado (exceto o vocabulário `game`, `mod`, `plugin`) ou calculado; algoritmo puro importar qualquer pacote de domínio. Motivo: impede, por construção, persistir dado derivado como verdade (anti-pattern 13) e mistura de estados (D033). Origem: proposta da sessão F1 original (citada no código como "D024" sem registro), formalizada na revisão de 2026-09-30.

## D050 — Algoritmo do motor de ordenação
Status: vigente (detalha D029)

O motor (`internal/core/domain/ordering`) calcula dois candidatos a partir da ordem atual: Kahn estável "para frente" (sempre emite o item pronto de menor posição atual, empurrando para baixo quem precisa esperar) e "para trás" (preenche do fim, sempre com o item de maior posição cujos sucessores já foram colocados, puxando para cima quem precisa vir antes). Vence o candidato que move menos itens, medido pelo complemento da maior subsequência comum com a ordem atual (LIS, O(n log n)). Empate: "para frente". Locks são reinseridos nas posições travadas depois, e o resultado é revalidado; conflito entre lock e restrição é erro (`ErrLockConflict`), nunca correção silenciosa. Movimentos são explicados pelas arestas violadas na ordem atual. Separadores entram como itens sem restrições, o que os mantém no lugar e faz um mod só sair do bloco quando uma regra obriga.

Propriedades garantidas e testadas (teste de propriedade com 300 cenários aleatórios): ordem válida não muda; resultado sempre válido ou erro sem alteração; determinismo; saída é permutação da entrada.

## D051 — Ajustes de modelo na implementação da F1
Status: vigente

- O perfil ativo de cada instância é guardado pelo repositório de profiles (`ports.Profiles.Active/SetActive`), não como atributo de `game.Instance`, para `game` continuar abaixo de `profile` na hierarquia de pacotes.
- O fingerprint do estado desejado é calculado sobre o `deployplan.Desired` (Location → mod, instalação, origem, método) e gravado no manifesto; o profile não calcula fingerprint.
- Load order do profile é uma lista de nomes; o estado ativo dos plugins é um mapa separado, que sobrevive à saída do plugin do inventário (core/08 §3).
- `externalchange` não classifica `moved` (core/09 §2).
- Diagnósticos, notificações e resultados de dependência carregam código + parâmetros, sem texto (D044).
- Pacote `filerule` removido: substituído por `rules.OrderRule` (restrição de ordem) e `override.FileOverride`/`FileExclusion`/`ConflictReview` (intenção por arquivo), ambos da instância (D025/D026).

## D052 — Spec e dettmann-ui versionadas no repositório do app
Status: vigente (emenda D022)

A pedido do usuário (pendência P8 da revisão), `mod-orchestrator-spec-v2/` e `dettmann-ui-vnext/` deixaram de ser ignoradas e passam a ser versionadas junto com o app. A saída de build da lib (`node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`) continua fora do git: um clone novo precisa rodar `npm install && npm run build` em `dettmann-ui-vnext/` antes do frontend (README do app).

Consequências: a spec ganha histórico de versões; o CI pode compilar a lib e depois o frontend, o que remove a limitação "frontend fora do CI" da D022. `_historico/` da spec também fica versionado, apenas para consulta. A lib continua sendo a mesma do projeto Cayshin: mudanças feitas aqui precisam ser levadas de volta para lá (ou a lib passa a ter um único lugar de origem, decisão futura).

## D053 — Erros do bridge como código + parâmetros
Status: vigente

Detalha D044 e INV-OPS-05 no transporte. Uma chamada do bridge que falha rejeita com o JSON `{code, params, detail}`: `code` estável, `params` para montar a mensagem traduzida na UI (`error.<code>`), `detail` técnico mostrado só em "Detalhes técnicos". Erros do core são mapeados por `errors.Is` em um único lugar (`internal/bridge/errors.go`); o que não tem mapeamento vira `internal` com o detalhe. Toda falha é registrada no log técnico. O catálogo de códigos fica em core/00 §6, e um teste do frontend falha se um código do bridge não tiver mensagem no catálogo.

Motivo: o Wails só transporta a string do erro; sem um formato estruturado a UI mostraria texto em inglês vindo do Go. Alternativa rejeitada: retornar `{ok, error}` em todo DTO, que duplica o canal de erro que o Wails já tem (rejeição da promise).

## D054 — Shell da F2: slots reservados e Diagnostics fora da sidebar
Status: emendada por D120 (a barra de título com lançador e a topbar com status de deploy, problemas e operações deixam de existir; continua valendo: cada área só mostra o que já funciona)

Na F2 o shell de ui/00 §2 existe por completo, mas cada área só mostra o que já funciona (anti-pattern 18):
- Barra de título: área do lançador com o estado "nenhum jogo selecionado" (select de jogo e Play chegam com F3/F12); área de tools reservada e vazia; controles da janela só quando a janela é frameless (`ui.customTitleBar`, lido na inicialização porque exige reinício).
- Topbar: título, indicador de operações (ligado ao backend) e Ajuda. Select de profile (F5), status de deploy (F7), problemas e sino (F9) têm o lugar reservado no layout e não são renderizados até existirem: um contador de problemas sem health checks afirmaria "0 problemas" sem ter verificado nada.
- Diagnostics pertence ao workspace do jogo (ui/00 §2.2), que só aparece com jogo ativo (D023). Até a F3 as abas globais (Operações e Log) são acessadas pela Ajuda, pelo drawer de operações e pela paleta de comandos; Problemas e Histórico aparecem na F9.
- Estado de apresentação (sidebar recolhida) fica no navegador; idioma, modo e tema do app ficam em `state.db` (docs-ia/03).

## D055 — Log técnico e settings de app na fundação de UI
Status: vigente

- O log técnico de core/10 §4 é implementado com `log/slog` em JSON por linha, sobre um writer rotativo próprio (`internal/infrastructure/logging`, 10 × 10 MB em `<dados>/logs`, nível pelo setting `app.logLevel` na inicialização). O plano citava o log como já existente, mas ele ainda não existia. Registra transições de operação (assinante do event bus, ligado no bootstrap), início e fim do app, mudanças de setting e falhas do bridge. Leitura por `LogTail` (filtros de nível, operação, texto e limite; lê a rotação mais recente primeiro).
- Settings de escopo app são persistidos na tabela `settings` (migration 0002), que guarda só valores explícitos: ausência significa o default do catálogo, e resetar apaga a linha. O serviço de aplicação resolve o default derivado de `ui.language` pelo idioma do SO (port `SystemLocale`: igualdade exata, depois o idioma primário, senão `en`). Valor gravado que deixou de validar é ignorado, não usado. Settings de instância e profile e a tela completa de Settings continuam na F12.

## D056 — Tema `orchestrator` registrado na dettmann-ui
Status: vigente (executa D043)

O tema `orchestrator` foi criado na lib a partir do `forest`, com blocos claro e escuro completos. A marca pende para o verde-azulado e o sucesso para o verde-limão, para que os dois sejam distinguíveis lado a lado. O `npm run theme` da lib agora verifica contraste também do `orchestrator` e do par `success-text`/`success-subtle`. É o tema padrão do app (`theme.id`), e o `BackgroundColour` da janela acompanha o canvas escuro dele.

Na mesma fase foi corrigido na lib o contrato de tons (`data-tone` → `bg-tone*`/`text-tone-text`), cujas definições de CSS tinham se perdido: sem elas, Badge, Alert e Button com tom (inclusive o primário) ficavam sem cor. O `npm run theme` passou a falhar se algum tom de `TONES` não tiver mapeamento.

## D057 — Contrato do adapter e da descoberta na F3
Status: vigente (detalha D011/D031; core/11 §1, §3)

O port `GameAdapter` (F1) foi completado para o que o assistente precisa: `InstanceDefinition(id, targets)` (definição efetiva por instância, para o `generic`, cujos targets o usuário declara — `Definition.CustomTargets`), `Markers`, `RegistryHints`, `VersionFile`, `Targets(id, root, custom)` e `ValidateRoot` com erro tipado (`game.RootError`: `not_found`, `not_directory`, `marker_missing`, `unreadable`, `not_absolute`). O adapter recebe só `ports.FileReader` (leitura), o que torna o anti-pattern 24 uma regra de tipos. `ModType` ganhou `Priority` e `Detect []DetectRule` (regra declarativa por footprint). `StoreScanner.Scan` passou a receber as dicas de registro dos adapters e devolve toda instalação que acha; quem escolhe é o adapter. `FileSystem` ganhou `WriteFile` (atômico), `RemoveAll` (recusa raiz de unidade; o chamador prova posse) e `Drives`; `VersionReader` lê a versão do executável.

Motivo: a F1 deixou o port sem saber expressar jogo com targets do usuário, erro de pasta com motivo nem busca por registro. Alternativa rejeitada: um adapter `generic` por instância (quebraria o registro estático de definições, D031).

Consequências: novos códigos de erro em core/00 §6; teste de arquitetura `TestNoGameSpecificLiteralsOutsideAdapters` falha se um literal de string fora de `internal/adapters`, `bootstrap` e `testutil` nomear um jogo ou ferramenta (critério de aceite de core/11 §8). Testes que combinam o serviço com adapters reais vivem em `internal/adapters/gamesflow` (a camada `application` não pode importar adapters, nem nos testes).

## D058 — Pastas do gerenciador: marcadores nas três e regra de pasta existente
Status: vigente; emendada por D145 (detalha D035; core/04 §10)

Staging, ArchiveStore e BackupStore recebem marcador (`.modorchestrator-staging`, `-archives`, `-backups`) com o `instanceId` dono. Pasta inexistente: criada e marcada. Pasta vazia: adotada e marcada. Pasta com conteúdo e sem marcador, ou com marcador de outra instância: recusada (`staging_foreign` / `folder_foreign`). As três pastas não podem se sobrepor entre si, nem com o jogo ou seus targets, nem com pastas de outra instância (`game.Instance.Validate` estende INV-LIB-03). "Parar de gerenciar" com "apagar" só remove pasta cujo marcador prova a posse; marcador ausente, ilegível ou de outro dono ⇒ a pasta fica.

Motivo: o plano da F3 pede marcadores nas três pastas, e "nada não gerenciado é apagado" só vale se a posse for verificável na hora de apagar. Consequência aceita: manter as pastas ao parar de gerenciar e gerenciar o jogo de novo exige escolher pastas novas (o marcador antigo é de "outra instância"); adotar uma staging órfã fica para depois da V1. Alternativa rejeitada: adotar automaticamente pasta com marcador cujo dono não existe mais, que reaproveitaria conteúdo sem mods no banco.

## D059 — Detecção de implantação estrangeira é calculada e só avisa na F3
Status: vigente (detalha D035, INV-DEP-08; core/04 §11)

`games.Service.CheckForeign` lê o topo de cada target e da raiz a cada consulta (`GamesView`, detalhes, assistente): `vortex.deployment*.json`, `*.vortex_backup`, marcador `.modorchestrator-deployment.json` de outra instância (ilegível conta como estrangeiro), e MO2 portátil (`ModOrganizer.ini` ou `mods`+`profiles`+`overwrite`). O resultado **não é persistido** (anti-pattern 13) e, na F3, **não bloqueia o assistente**: a instância nasce e o card/Overview mostram o aviso com "abrir pasta" e "já removi, verificar de novo". O bloqueio do deploy (INV-DEP-08 completo) é da F7 e o diagnóstico persistente `foreign_deployment` da F9, que consomem esta mesma função. "Adotar" (banco perdido) fica para a F7/F14.

Interpretação registrada: core/04 §11 diz "pasta `overwrite`/`mods` de instância portátil do MO2"; exigir as três pastas (ou o ini) evita acusar um jogo genérico que tem um target chamado `Mods`. Varredura só do topo: uma busca recursiva em `Data` custaria segundos por consulta.

## D060 — Estado de app fora do catálogo de settings, e presença de deploy
Status: vigente (docs-ia/03)

Dois fatos de app não são settings do catálogo (core/13): a **instância ativa** e os **jogos ocultos** (descobertos/suportados não têm instância para guardar `hidden`). Ficam na tabela `app_state` (chave/valor, migration 0003), via `ports.AppState`, no serviço `games`. A instância ativa é validada a cada leitura (uma instância removida deixa de ser ativa). A F3 também cria `deployment_manifests` (instância → fingerprint) e `ports.DeploymentState.Deployed`, só para o guarda de "parar de gerenciar"/"alterar localização" (teste de guarda do plano): nada escreve nela antes da F7, que a substitui pelo repositório completo de manifestos. O repositório SQLite de profiles (documento JSON de `profile.Data`, restaurado por `profile.Restore`) também nasce aqui, porque toda instância nasce com o profile `Default` ativo (INV-ORD-01); a F5 é dona do conteúdo.

## D061 — Fatos externos do core/12 confirmados na F3
Status: vigente (fecha parte da pendência P3)

Confirmados em fonte primária em 2026-09-30 e registrados em core/12 §1 com as fontes: Steam `489830`; GOG `1711230643` (o `1801825368` é o pacote AE no GOG DB); Epic `AppName` `ac82db5035584c7f8a2c548d98c86b2c`; pasta de usuário da variante GOG `Skyrim Special Edition GOG` (AppData Local e Documents). **Continuam pendentes**: pasta de usuário da variante Epic e `loadorder.txt` (F11, quando o `plugins.txt` passa a ser escrito), e a observação de uma instalação GOG real do pacote AE sob `1801825368`. O adapter reconhece apenas o que foi confirmado; o resto cai em "Localizar manualmente".

## D062 — Extração de archives em Go puro (fecha a pendência P1)
Status: vigente (emendada por D097 e D098)

O port `Extractor` é implementado em `internal/infrastructure/archive` só com bibliotecas Go, sem binário externo nem CGO:

| Formato | Biblioteca | Licença |
|---|---|---|
| ZIP | `archive/zip` (stdlib) | BSD-3 (Go) |
| 7Z | `github.com/bodgit/sevenzip` | BSD-3 |
| RAR (v4 e v5) | `github.com/nwaples/rardecode/v2` | BSD-2 (implementação própria, não deriva do código do unRAR) |
| Pasta (D048) | leitura do filesystem | — |

Dependências transitivas: `klauspost/compress`, `pierrec/lz4`, `ulikunitz/xz`, `andybalholm/brotli`, `bodgit/plumbing`, `bodgit/windows` (BSD/MIT/Apache-2.0), `go4.org` (Apache-2.0) e `hashicorp/golang-lru/v2` (MPL-2.0, copyleft por arquivo: usado sem modificação; a licença acompanha o pacote de distribuição na F15).

Segurança (INV-ID-04, INV-LIB-04, core/02 §2/§3):
- As bibliotecas só **leem**. Quem escreve é o nosso código: cada entrada é normalizada pelo domínio (`relpath`) antes de qualquer `Join`, e o destino é verificado como descendente da pasta temporária da operação (anti-pattern 32).
- Entradas symlink/hardlink/dispositivo são recusadas (`archive_unsafe_path`); nada é executado.
- Limites de core/02 §2 (`import.maxExtractedSizeGB`, `import.maxEntries`, razão de compressão) são checados na listagem **e** na cópia, contando bytes realmente escritos (cabeçalho mentiroso não passa).
- Archive com senha é `archive_corrupt` com `reason=encrypted` (V1 não pede senha).

Motivo: 7-Zip embarcado exigiria distribuir e executar um binário (processo externo, códigos de saída, licença LGPL + restrição do unRAR), e libarchive exigiria CGO (rejeitado em D018). Custo aceito: descompressão LZMA em Go puro é mais lenta que o 7z.exe (ordem de 2×); revisável se a meta de desempenho de import não for atingida. Alternativa rejeitada: `mholt/archives` (camada genérica sobre as mesmas bibliotecas, superfície maior sem ganho).

## D063 — Hash de conteúdo SHA-256 (fecha a pendência P2)
Status: vigente

O port `Hasher` usa SHA-256 da stdlib (hex minúsculo). Archive: hash do arquivo. Pasta importada (D048): SHA-256 de um manifesto canônico (caminho normalizado em minúsculas, tamanho e SHA-256 de cada arquivo, ordenados por caminho), para que a mesma pasta copiada de outro lugar seja duplicada. Motivo: sem dependência, acelerado por hardware (SHA-NI) nas CPUs alvo, e o mesmo hash serve à redundância de conflitos (F6) sem risco de colisão. Alternativa rejeitada: xxhash3 (mais rápido, mas colisões são plausíveis em 500.000 arquivos e a redundância não pode errar).

## D064 — Mecânica do pipeline de importação
Status: vigente (detalha core/02 §3, §5, §7)

- **Steps** do tipo de operação `import`: `validate`, `hash`, `dedupe`, `retain`, `inspect`, `select_installer`, `extract`, `plan_install`, `stage`, `commit`, `post`. `reinstall` usa os mesmos a partir de `inspect` (os anteriores ficam `skipped`). Os dois pontos de decisão (duplicado em `dedupe`, root/nada reconhecido em `plan_install`) param a operação **no próprio step**, `running`, com a decisão pendente exposta pela consulta da fila (`ImportQueue`). Interpretação de core/00 §4: um step `await_decision` único não serve a duas decisões no mesmo import.
- **ArchiveStore**: `<archives>/<archiveId>/<nome original>`; o `archiveId` é o ID da operação de import que o reteve, o que permite à recuperação provar a posse. Cópia vai para `<archiveId>.partial` e é renomeada antes do commit. `move` nunca apaga o original antes do commit (copia, grava, e só então remove a origem).
- **Staging**: mod em `<staging>/<modId>` (INV-ID-03). Extração em `<staging>/.tmp/<operationId>/`, montagem em `<modId>.installing`, troca no reinstall renomeando o atual para `<modId>.replaced`. O estado `installing` é gravado **antes** de qualquer escrita na staging e o commit (Installation + `installed` + ModEntries + eventos) é uma transação.
- **Recuperação** (inicialização, por instância, antes de aceitar comandos): apaga `.tmp/`, `*.installing`, `<archiveId>.partial` e pastas de archive de imports interrompidos sem registro; para mod ainda `installing`, desfaz a troca (`.replaced` volta) ou apaga a pasta nova de uma primeira instalação não gravada, e chama `AbortInstall` (volta a `installed` ou `imported`, INV-LIB-01); apaga a pasta de mod `removed` que ficou. Só age dentro de pastas com o marcador da instância (D058).
- **Transação de estado + eventos** (INV-OPS-01): repositórios da biblioteca, profiles e o append de eventos rodam num `ports.UnitOfWork`; eventos de domínio (`mod.*`, `archive.*`, `category.changed`) carregam o `operationId` quando há operação e são publicados após o commit.

## D065 — Fila de importação e lock da instância
Status: vigente (detalha D038, core/00 §5)

O lock por instância saiu do serviço `games` para `application/instancelock`, compartilhado por todos os serviços mutantes (INV-OPS-02). `ImportFiles`/`ImportFolder` criam uma operação `pending` por item (visível no drawer e na fila) e a fila adquire o lock enquanto tiver itens; importar de novo com a fila ativa **acrescenta** à fila (a exceção de D038), qualquer outra operação mutante na instância recebe `instance_busy`, e importar enquanto outra operação (não-fila) detém o lock também recebe `instance_busy`. Um item pode ser cancelado enquanto `pending` ou até `extract`/`plan_install` (inclusive esperando decisão); depois disso, `operation_not_cancellable`. Cancelar um item não afeta os demais.

## D066 — Comportamentos da biblioteca não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **Habilitar ao instalar** (`automation.enableOnInstall`, escopo instância): o mod novo entra habilitado só no **profile ativo**; nos demais entra desabilitado, no fim da ModOrder (paridade Vortex, que habilita no profile atual).
2. **Mod `imported`** (sem Installation) não tem ModEntry nem posição na ModOrder; ganha ambos ao instalar. INV-ORD-02 fala de "mod instalado".
3. **"Mesmo nome lógico"** (core/02 §6): nome detectado (sem sufixo Nexus/versão) igual, sem diferenciar maiúsculas, a um mod não removido da instância.
4. **Rótulo de variante**: obrigatório no diálogo; padrão sugerido é a versão detectada ou o nome do archive.
5. **Toggle de status na F4**: habilitar/desabilitar grava `ModEntry.enabled` do profile ativo (profiles completos são da F5). Sem deploy até a F7.
6. **Remover com archive**: o archive só é apagado se nenhum outro mod (variante) o referencia; caso contrário o diálogo informa que ele fica.


Adendo a D062 (F4): um 7z com **cabeçalhos** cifrados não pode ser distinguido de um 7z danificado sem a senha; ele é recusado como `archive_corrupt` (`reason=damaged`). Cifra só no conteúdo (ZIP, RAR, 7z) é `reason=encrypted`.

Adendo a D066 (F4), itens 7 e 8, também propostos:
7. **Jogo sem dicas de root** (adapter `generic`, que não declara pastas, extensões nem regras de detecção): o instalador básico desce as pastas wrapper e instala o nível resultante sem perguntar; perguntar sempre tornaria o import de jogos genéricos inutilizável.
8. **Archive com FOMOD antes da F10**: em vez de falhar, a importação para na decisão `fomod_pending` e o usuário escolhe a pasta (o mesmo caminho alternativo de core/03 §7 para FOMOD com script). A escolha fica em `Installation.options`; quando o FOMOD existir, reinstalar com outras opções passa pelo assistente. *(Emendado por D086 itens 6–7: com a F10, `fomod_pending` deixou de existir; só o FOMOD com script usa a árvore, como `fomod_script`.)*

## D067 — Erro de operação com parâmetros
Status: vigente (emenda D019)

`operation.Error` ganhou `Params` (mapa de texto), persistido com o erro e transportado no `OperationError` do bridge. Motivo: os erros da biblioteca precisam do nome do archive, do limite excedido ou da lista de entradas perigosas para que a mensagem traduzida faça sentido (D044, INV-OPS-05); antes a UI só podia mostrar a mensagem genérica do código. `Detail` continua técnico. Alternativa rejeitada: a UI interpretar `Detail` (texto técnico não é contrato).

## D068 — dettmann-ui na F4: lacunas L3/L4 e duas correções
Status: vigente (executa D016)

Criados na lib: `StatusToggle` (L3) e `Indicator` (L4), com testes. `FileDropzone` ganhou `onBrowse` (o host abre o seletor nativo, que devolve caminhos absolutos), `actions`, `showSelection` e `dragging` controlado; a área recebe arquivos soltos pelo Wails (`--wails-drop-target`, `EnableFileDrop` em `main.go`), já que o DOM não expõe caminhos.

Correções de defeitos anteriores à F4, encontradas na verificação visual da tela Mods:
- `Button` sólido sem `tone` não recebia `data-tone` e era pintado transparente (`bg-tone` sem tom): o padrão agora é `primary`.
- As classes `z-modal`, `z-dropdown`, `z-popover`, `z-toast`, `z-overlay` e `z-sticky` não geravam CSS: o Tailwind v4 lê o namespace `--z-index-*` e as fundações expõem `--z-*`. `tokens.css` passou a declarar os aliases; modais deixam de aparecer sob o cabeçalho fixo de tabelas.

Consequência (D052): as mudanças precisam ser levadas à cópia da lib do projeto Cayshin.

## D069 — Serviço de aplicação `profiles` e o motor aplicado em toda mudança de ordem
Status: vigente (executa D025/D026/D028/D029/D037; core/05 §1–4, core/07)

- `internal/core/application/profiles` reúne ciclo de vida de profiles, comparação, transferência, snapshots, habilitar/desabilitar, ModOrder com separadores, regras e histórico de ordem. Habilitar/desabilitar saiu da biblioteca (`library.SetEnabled`, provisório da F4 por D066 item 5) para este serviço, que é dono do `ModEntry`.
- Toda mudança que pode invalidar a ordem roda o motor no mesmo commit: criar regra e reativar regra (em **todos** os profiles), instalar mod (lacuna da F4: o mod entrava no fim sem o motor, contra core/05 §4 "o motor roda"), transferir com ordem, restaurar snapshot (regras criadas depois do snapshot valem). Mover recusa posição inválida sem mudança parcial. Assim INV-ORD-03 vale para toda ordem persistida; o teste de propriedade `TestOrderInvariantUnderRandomCommands` confere INV-ORD-01/02/03 após 120 comandos aleatórios.
- Ciclo vindo de metadados (D028) não impede instalar: a ordem fica como está e o diagnóstico bloqueante é da F9.
- Configurações (limiares de snapshot) são lidas **antes** de abrir a transação: o banco tem uma conexão só (D018) e uma leitura fora da transação dentro dela trava. Regra para todo serviço: dentro de `UnitOfWork.Do` só se usam os repositórios do `Tx`.
- Códigos de erro novos (core/00 §6): `rule_not_removable`, `rule_not_found`, `snapshot_not_found`, `separator_not_found`, `order_history_stale`, `order_nothing_to_undo`; `rule_would_create_cycle` sempre traz `cycle` com os nomes ("A → B → A"). Eventos novos: `profile.notes_changed`, `rule.enabled`, `mod.enabled`/`mod.disabled` por mod (com profile).

Alternativa rejeitada: dois serviços (profiles e ordem). Todos os casos de uso leem e gravam o mesmo agregado na mesma transação; separar duplicaria o carregamento e as regras de snapshot.

## D070 — Histórico reversível de ordem a partir de `order.changed`
Status: vigente (detalha core/05 §4 e core/10 §3 para a ordem de mods)

O evento `order.changed` (sujeito: profile) guarda a ordem completa antes e depois (`before`/`after`, uma linha `m:<id>`/`s:<id>` por posição), o motivo (`move`, `rule`, `transfer`, `restore`, `revert`, `rule_removed_by_move`) e quantos itens mudaram de lugar (complemento da maior subsequência comum, a mesma medida do motor; acima de `order.snapshotMoveThreshold` há snapshot automático antes). Reverter é um comando novo que grava outro `order.changed` com `revertOf`; nada é apagado. Uma mudança só é revertível enquanto a ordem atual é exatamente a que ela produziu e ninguém a reverteu; a ordem antiga também precisa satisfazer as regras atuais (`order_violates_rules`), e um separador excluído depois torna a entrada obsoleta (`order_history_stale`). `Ctrl+Z` reverte a mais nova ainda revertível, pulando reversões, de modo que repetir volta mais um passo.

Motivo: o histórico é projeção de eventos (docs-ia/03), então a reversão precisa caber no evento. Alternativa rejeitada: guardar só os movimentos e aplicar o inverso, que fica errado quando a ordem mudou no meio. Custo aceito: ~50 KB por evento com 2.000 mods; a retenção (180 dias, core/10) limita o total. A projeção completa com filtros continua na F9.

## D071 — dettmann-ui na F5: lacuna L2 (reordenar linhas na DataTable)
Status: vigente (executa D016; ui/03 L2)

`DataTable` ganhou `reorderable` (booleano ou por linha) e `onRowsMove({ids, targetId, position})`: coluna de alça, arraste por **pointer events** da alça (carrega a seleção quando a linha arrastada está selecionada), indicador de destino (linha da cor da marca), rolagem automática perto das bordas, Esc cancela, e `Alt+↑/↓` move a seleção uma linha pelo teclado. A tabela nunca reordena sozinha: enquanto a promessa de `onRowsMove` não termina ela fica `aria-busy` e recusa outro movimento, o que permite validar no backend antes de aplicar. Lógica pura em `data-table.model.ts` (`movingRows`, `isDropTarget`, `keyboardMove`), com testes.

Motivo de não usar drag-and-drop HTML5 (`ReorderableList`): o app abre a janela com `DisableWebViewDrop` para receber arquivos soltos pelo Wails (D068), e o arraste nativo dentro do WebView2 deixa de ser confiável; pointer events também funcionam com virtualização. `ReorderableList` continua na lib para listas pequenas.

Consequência (D052): levar a mudança à cópia da lib do projeto Cayshin.

## D072 — Comportamentos da F5 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **Arrastar e separadores** só aparecem com Prioridade **crescente**, sem agrupamento e sem filtro (ui/telas/mods.md §5.2 não diz se a ordem decrescente conta); fora disso uma nota explica e oferece "Mostrar ordem de prioridade".
2. **DLG-11 como modal compacto**, não popover: depois de soltar (ou de um comando de menu) não há âncora estável numa lista virtualizada.
3. **"Mover e remover a(s) regra(s)"**: regra do usuário é removida; regra de outra origem é **desativada** (core/05 §2: só pode ser desativada).
4. **Histórico da ordem**: até a F9, o botão "Histórico" da toolbar de Mods abre o histórico de ordem do profile ativo (D070) em vez de Diagnostics › Histórico, que ainda não existe. (Encerrado na F9: D084 item 16.)
5. **Só "Ativar" usa o lock da instância** (core/07 §2); mover, regras, separadores, snapshots e transferir são comandos curtos sem filesystem e não são bloqueados por uma importação em andamento.
6. **Nome de profile** é único na instância sem diferenciar maiúsculas; **excluir** é recusado para o ativo, logo o "último" é sempre o ativo (as duas mensagens existem).
7. **Restaurar snapshot** sempre cria antes um snapshot `before_restore` do estado atual (core/07 §6 cita "restaurar outro snapshot" entre os automáticos).
8. **Transferir** na F5 oferece mods habilitados (sempre) e ordem; plugins aparecem com a F11. Comparar mostra os grupos de plugins e load order só quando há diferença (antes da F11 não há estado de plugin para comparar).
9. **Profile "vazio"** copia também os separadores do profile ativo, junto com a ordem (core/07 §2 manda copiar a ordem para preservar posições).
10. **Ciclo na UI** é exibido na direção das restrições ("A → B → A": cada um vem antes do seguinte), como o motor o encontra.

## D073 — Mecânica do cálculo de conflitos (F6)
Status: vigente (detalha core/05 §5, INV-CON-01..04)

- **Índice incremental**: o serviço `application/conflicts` mantém em memória, por instância, o footprint de cada Installation atual indexado por Location (`conflict.Index`). A cada consulta compara o `InstallationID` de cada mod com o indexado e só relê as Installations que mudaram; a avaliação de um profile visita só as Locations com 2+ fornecedores. É cache descartável (docs-ia/03 regra 2): um serviço novo recalcula o mesmo resultado (teste `TestConflictsAreRecalculable`). Medido: ~150 ms para 1.000 mods / 200.000 Locations após habilitar um mod (meta: 500 ms). `conflict.Calculate` continua como cálculo completo de vencedores para o estado desejado (F7) e o teste de propriedade garante que as duas formas concordam.
- **Redundância**: hash SHA-256 (D063) do arquivo da staging só quando todos os fornecedores têm o mesmo tamanho, calculado em segundo plano e guardado em memória por `InstallationID` + caminho de origem. Até terminar, o conflito conta como não redundante e as consultas devolvem `pendingHashes`; a UI relê a cada 1,5 s enquanto houver pendentes (D021: o backend continua a fonte). Arquivo ilegível nunca é redundante.
- **Obsoletos** (INV-CON-03): override é ignorado quando o vencedor está desabilitado (`disabled`), não fornece mais a Location ou a ocultou (`not_provider`) ou foi removido (`missing`); exclusão é obsoleta quando o mod foi removido ou não fornece mais a Location. Nada é apagado: a tela mostra a lista com "Remover"/"Reescolher" e o serviço deriva `override_stale` (warning), `conflicts_unreviewed` (info, desligável por `diagnostics.showUnreviewedConflicts`) e `mod_fully_overwritten` (info); a agregação com os demais checks é da F9.
- **Escolher vencedor** exige mod habilitado que forneça a Location (`override_not_provider`); um lote cria um override por Location.
- **Persistência** das intenções da instância: `instance_overrides.data_json` guarda Locations como `target` + caminho normalizado em texto (como os arquivos de Installation); a serialização direta de `game.Location` perdia o caminho (defeito da F1, sem dados reais afetados).
- Códigos novos: `override_nothing_selected`, `location_invalid`. Eventos: `override.set`/`override.cleared`/`exclusion.set`/`exclusion.cleared` com `count` e o primeiro caminho; `conflict.reviewed` com `pairs` e `reason` (`user`, `rule`, `override`).

## D074 — dettmann-ui na F6: lacuna L5 (Tree com seleção em lote e coluna extra)
Status: vigente (executa D016; ui/03 L5)

`Tree` ganhou `checkedIds`/`onCheckedIdsChange`, `renderEnd` e `labels`, todos opcionais (o uso existente não muda). A seleção guarda só folhas: pasta marcada = todas as folhas; parcial = `aria-checked="mixed"`; folhas desabilitadas nunca mudam por marcação de pasta. Lógica em `tree.model.ts` (`toggleTreeCheck`, `treeCheckState`, `treeLeafIds`), com testes. `FileBrowser` não foi usado: lista de arquivos separada da árvore não permite o select por nó. Consequência (D052): levar à cópia da lib do projeto Cayshin.

## D075 — Comportamentos da F6 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **Lista de pares é par a par**: uma Location com 3+ fornecedores aparece em cada par envolvido; "vencedor" do par é quem implanta mais Locations dele. A forma em grupo "B vence A, C" (ui/telas/conflicts.md §3) fica para quando houver demanda; o detalhe de cada arquivo já lista todos os fornecedores.
2. **"Decidido por" do par** junta as resoluções por arquivo ignorando as redundantes: uma só → ela; várias → "misto"; só redundantes → "redundante".
3. **Revisão automática** (core/05 §5.4) acontece ao salvar decisões de par (DLG-08 e ações da tela Conflicts) e ao escolher vencedor por arquivo (pares do vencedor com os outros fornecedores). Criar regra pelo diálogo "Gerenciar regras" (DLG-10) não revisa, por não partir de um conflito.
4. **"Pela ordem (sem regra)"** no DLG-08 remove a regra do usuário entre os dois e desativa (não apaga) a de outra origem, como D072 item 3. Salvar o DLG-08 aplica todas as escolhas numa transação; se uma fecharia ciclo, nada é salvo e o ciclo é mostrado.
5. **Busca** da tela Conflicts (nome de mod ou caminho) roda no backend; "Agrupar por Mod" agrupa os pares pelo vencedor.
6. **Indicador "totalmente sobrescrito"** conta arquivos ocultados como não fornecidos: um mod que perde o que sobra e ocultou o resto é totalmente sobrescrito.

## D076 — Licença GPL-3.0-or-later e modelo de contribuição
Status: vigente (emendada por D096: contribuições à `dettmann-ui`)

Escolhido pelo usuário em 2026-10-01. O projeto é open source sob **GPL-3.0-or-later** (`LICENSE` na raiz), incluindo a `dettmann-ui` (`dettmann-ui-vnext/`), que continua versionada no mesmo repositório (D052). Contribuições entram por PR sob a mesma licença (inbound = outbound, termos do GitHub); não há CLA. O app é gratuito; não existe sistema de chave/ativação.

Consequências:
- Toda dependência nova precisa ser compatível com GPL-3.0 (permissivas e MPL-2.0 são; ver D062). Código copiado de terceiros só com licença compatível e atribuição.
- Os textos de licença das dependências acompanham o pacote (`THIRD_PARTY_NOTICES`, gerado no pipeline de release; `plano-de-publicacao.md`).
- Sendo gratuito e não comercial, a restrição NC da masterlist do LOOT (pendência P4) deixa de bloquear, mas a licença ainda precisa ser confirmada antes da V1.x.
- Qualquer pessoa precisa conseguir compilar e testar um PR só com o repositório: o CI cobre core e frontend (com o build da `dettmann-ui`), e `CONTRIBUTING.md` descreve o passo a passo.

Alternativas rejeitadas: MIT (permite fork fechado; a comunidade de gerenciadores de mods, Vortex e MO2, usa GPL-3.0); app fechado gratuito ou pago (contraria o objetivo de aceitar PRs; ativação paga exigiria rede, contrariando a privacidade da V1).

## D077 — Distribuição e confiança do executável (SmartScreen e antivírus)
Status: vigente (os requisitos da SignPath Foundation precisam ser confirmados antes da inscrição)

Objetivo: o usuário não pode achar que está instalando um vírus, e o projeto não gasta dinheiro com isso. Regras:

1. **Assinatura gratuita para open source**: binário e instalador assinados pela SignPath Foundation, a partir de build no GitHub Actions. Nunca se assina na máquina de alguém. Certificado autoassinado é proibido (não ajuda no SmartScreen e parece suspeito). Até a aprovação, as releases saem sem assinatura e o README explica o aviso.
2. **Isolamento da assinatura**: só um workflow de release, disparado por tag `v*` na `master`, com ambiente protegido (aprovação manual) acessa o que assina. O CI de PR usa `pull_request` com `permissions: contents: read`; `pull_request_target` com checkout do código do PR é proibido.
3. **Sem elevação**: instalador por usuário (`%LOCALAPPDATA%`), sem UAC; o app nunca pede administrador. O método de deploy padrão continua hardlink (sem privilégio); symlink só quando disponível (core/13 `deploy.method`).
4. **Binário limpo**: sem packer/compressor de executável (UPX e similares); build com `-trimpath` e versão via `-ldflags`; metadados de versão e empresa preenchidos no executável.
5. **Verificável**: cada release publica `SHA256SUMS` e notas de versão; o executável é conferido no VirusTotal antes de publicar, e falsos positivos são reportados ao Microsoft Defender e ao fornecedor.
6. **Canais**: GitHub Releases (fonte da verdade), winget e Scoop (em geral sem o aviso do SmartScreen); a página no Nexus aponta para a release.
7. **Atualização do app** (opt-in, única chamada de rede da V1, 00-visao-e-escopo) só aceita pacote cujo hash confere com o `SHA256SUMS` da release e, quando houver, com assinatura válida.

Motivo: o aviso do SmartScreen vem de executável sem assinatura ou sem reputação, e os falsos positivos de antivírus vêm de heurísticas (binário Go empacotado, pedido de elevação, injeção de DLL). A arquitetura já evita injeção (links reais, não VFS) e execução de scripts (INV-LIB-04). Custo aceito: as primeiras releases mostram o aviso até a reputação se formar, mesmo assinadas. Alternativas rejeitadas: certificado OV/EV ou Azure Trusted Signing (pagos); distribuir só o código-fonte (exclui o usuário comum).

Detalhamento e etapas: `plano-de-publicacao.md`.

## D078 — Mecânica do deploy, do journal e da recuperação (F7)
Status: vigente (detalha D033–D036, core/04 §4–§11, core/14 §5)

- **Assentamento por observação** (`deployment.Settle`, domínio puro): o commit de um deploy e a recuperação de um deploy interrompido fazem a mesma pergunta para cada ação do journal: "o efeito pretendido está no disco?". Um link só é registrado se a Location tem exatamente o arquivo planejado (hardlink: mesmo file id da staging; symlink: alvo = caminho absoluto da staging; cópia: tamanho + data da staging); um backup só se o original está no BackupStore com a mesma identidade (o rename no volume preserva o file id); uma remoção quando o nosso arquivo não está mais lá. Ações que não se confirmam não entram no manifesto (INV-DEP-05). Assim "reconciliar" (core/04 §5) = assentar o journal, apagar o journal na mesma transação do manifesto e rodar o mesmo deploy (ou purge, se o journal era de purge) a partir do observado. Nada é desfeito às cegas.
- **Journal**: tabela por ação com estado `pending`/`done`/`skipped`, marcado em lotes de 256. `skipped` = nada foi escrito (corrida com ferramenta externa detectada na revalidação, ou pasta que apareceu antes do `mkdir`); a recuperação ignora. Falha de escrita conta como `done` (tentada): o verify observa o efeito parcial em vez de presumir.
- **Ordem do apply**: remoções, restaurações, `mkdir` (de fora para dentro), `backup_and_create`, criações e substituições, `rmdir_managed` (de dentro para fora). A substituição de arquivo gerenciado cria o novo em `<caminho>.modorchestrator-tmp` e renomeia por cima (MoveFileEx com substituição), por isso não tem "parte de remoção" separada e roda junto com as criações: a Location nunca fica vazia. A recuperação remove o temporário só se ele é provadamente o arquivo planejado.
- **Backup de original**: `<BackupStore>/<target>/<caminho>` (sufixo `.backupN` se já existir algo lá; backup existente nunca é sobrescrito). Se o link falha depois de mover o original, o original volta para a Location.
- **Fingerprint do desejado** calculado dos **insumos** (`deployplan.InputFingerprint`: profile, método, staging, targets, mods habilitados na ordem com Installation e tipo, overrides e exclusões), não dos arquivos: o status compara fingerprints sem carregar Installations. Mesmos insumos ⇒ mesmo desejado; insumos diferentes com o mesmo resultado só custam um deploy que não escreve nada. Execução incompleta grava `partial:<fp>` (status `pending`/`partial`).
- **Persistência** (migration 0005): manifesto como cabeçalho + uma linha por entrada (salvar após o deploy de 1 mod reescreve só as entradas que mudaram; o status lê só o cabeçalho); journal como cabeçalho + linhas de ação. `Deployed` = manifesto com entradas. SQLite passa a `synchronous=FULL` em todo o banco (core/14 §2 pede FULL para manifesto/journal; com uma conexão só, por transação não compensa). O caminho do banco é escapado na URI (`#`, `?` e `%` em nomes de pasta cortavam o nome — encontrado pelo teste de interrupção).
- **Operações**: `deploy`/`purge` com steps `reconcile`, `preflight`, `scan`, `plan`, `await_decision`, `journal`, `apply`, `verify`, `commit`, `post` (`post` não escreve `plugins.txt` antes da F11). `move_staging` (`validate`, `purge`, `copy`, `save`, `cleanup`) e `change_method` (`validate`, `purge`, `save`) fazem o purge dentro da própria operação e, se havia implantação, disparam um `deploy` separado ao terminar (para que uma decisão use o diálogo normal). O movimento da staging fica registrado em `app_state` (`deployment.stagingMoves`) até o fim; a recuperação descarta o lado que perdeu, só com marcador da instância. Mesmo volume: os arquivos são hardlinks verificados por file id; outro volume: cópia verificada por tamanho.
- **Marcador de deploy** gravado antes da transação do manifesto em todo target com entradas e removido (só se for nosso) dos que não têm.
- **Disponibilidade de método**: hardlink exige staging e target no mesmo volume NTFS; symlink é provado por uma tentativa real dentro da staging (pasta da instância, nunca o jogo), feita no deploy só quando symlink é o método preferido (symlink nunca é proposto como fallback), e em Settings › Mods ao listar os métodos; cópia sempre funciona.
- **Auto-deploy**: assinante do barramento de eventos (`AutoDeployer`), coalescência por `automation.deployDelayMs`, instância resolvida só quando o timer dispara; instância ocupada é tentada de novo após o atraso.
- **Teste de interrupção** (`internal/integration/deploy_kill_test.go`): um processo filho real roda o deploy/purge sobre o banco em arquivo e morre (`os.Exit`) logo após a k-ésima escrita em disco; 20 pontos aleatórios por execução (14 deploy, 6 purge; semente registrada, `MO_KILL_SEED` repete). O pai reabre, confere `deploy_interrupted`, reconcilia e verifica observado = desejado e que o purge final devolve o jogo original byte a byte.
- Códigos novos (core/00 §6): `deploy_failed` (params `count`, `first`, `reason`, `locations`, `codes`), `io_error`, `external_change_raced`, `nothing_to_purge`, `purge_incomplete`, `nothing_to_reconcile`, `method_unchanged`, `staging_unchanged`, `rule_cycle` como erro de operação, e os motivos de `folders_invalid` (`not_absolute`, `overlap`, `other_instance`, `not_directory`). Evento novo: `deployment.method_changed`; `deployment.applied` traz `reconciled=true` quando vem de uma recuperação. Portas novas: `FileSystem.VolumeFormat` (NTFS para hardlink) e os tipos de falha `ErrFileLocked`/`ErrDiskFull`/`ErrPathTooLong`/`ErrPermission`.

Alternativas rejeitadas: desfazer o journal na recuperação (precisa saber o estado anterior de cada Location e contraria D035); adotar qualquer arquivo que coincida com a origem sem consultar o journal (não recupera backups nem restaurações em andamento); fingerprint dos arquivos (o status teria de recalcular todos os vencedores a cada leitura).

## D079 — Comportamentos da F7 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **Decisões da F7**: external changes e Locations bloqueadas só têm "deixar intocado nesta execução" (o "Ignorar agora" de core/09 §4); as demais ações da triagem chegam com a F8 (DLG-15). Grupos de `method_fallback` são aceitos ou deixados de fora. Fechar o diálogo cancela a operação sem escrever nada.
2. **Status depois de deixar algo intocado**: o manifesto grava `partial:<fp>` e as external changes vistas ficam contadas em memória ⇒ `blocked`/`external_changes` até o próximo scan. Reiniciar o app esquece a contagem (o observado nunca é persistido); "Verificar implantação" recalcula.
3. **Auto-deploy** age em `pending`, `never_deployed` e `blocked` por decisão/external change; nunca em `unknown` nem com outra precondição falhando. Quando encontra decisão, a operação termina `failed` com `deploy_needs_decision` (visível no drawer) e o status fica `blocked`/`needs_decision` (o diagnóstico persistente é da F9).
4. **Purge que deixou arquivos** (external changes): o manifesto fica com `partial:purge` e o marcador continua. Purge completo esquece pastas criadas pelo gerenciador que ainda guardam arquivos de terceiros (nunca as remove).
5. **Cancelar durante o apply** para entre lotes, registra o que foi feito (não sobra journal) e termina `cancelled`.
6. **Corrida de pasta**: uma pasta que aparece entre o plano e o `mkdir` não é adotada; na recuperação, um `mkdir` pendente cuja pasta existe é adotado (quase sempre foi o próprio deploy).
7. **Status `failed` após reiniciar** é lido do erro da última operação de deploy/purge da instância.
8. **Settings › Mods** mostra também `automation.deployOnChange` (aba Interface no catálogo) até a F12 montar a aba Interface completa; o método é trocado por DLG-18, nunca editado no lugar.
9. **Toolbar de Mods**: `[Deploy ▾]` com "Ver o que o deploy vai fazer" e "Purge" no menu, em vez de dois botões soltos.
10. **DLG-03 / alterar localização** com algo implantado oferecem "Purge" no próprio aviso; o backend continua recusando enquanto houver entradas.

## D080 — Mecânica da triagem de alterações externas (F8)
Status: vigente (detalha D008, D046, core/09 §2–5)

- **Classificação** (`externalchange.Classify`, domínio puro) compara a entrada de link do manifesto com o observado: ilegível ⇒ `permission` (nunca "ausente"); ausente ⇒ `missing`; pasta ou evidência que não confere ⇒ `replaced` (hardlink/symlink) ou `modified` (cópia); hardlink com o mesmo file id mas tamanho, data ou hash diferentes do registrado na verificação ⇒ `modified`. Um link ausente numa Location que o desejado **não** quer mais não pede decisão: o deploy/purge só esquece a entrada (nada é escrito ali) e restaura o original, se houver.
- **`unexpected`**: arquivos filhos diretos das pastas que contêm links do manifesto, mais as pastas que o adapter declara em `Definition.ToolOutputs` (com subpastas), que não estão no manifesto nem no desejado, não foram marcados "não gerenciado" e cuja data de modificação **ou de criação** é posterior ao início da implantação. O início fica em `app_state` (`deployment.baseline.<instância>`), gravado no primeiro deploy depois de "nunca implantado"/purge e apagado no purge completo (sem ele, vale a data do manifesto). Marcadores e temporários do gerenciador nunca entram. `Definition.UnmanagedHints` (Skyrim: `*.log` na raiz do Data) faz "Deixar não gerenciado" vir sugerido; nos demais nada é pré-selecionado.
- **Decisões como resoluções do plano** (`deployplan.Input.Resolve`: `forget`, `adopt` (+`relink`), `set_aside`). Restaurar ⇒ forget ⇒ `create`. Aceitar remoção ⇒ FileExclusion (serviço de conflitos) + forget. Manter alteração (hardlink) ⇒ nova Installation com tamanho/hash novos + evidência observada adotada no manifesto. Reverter hardlink ⇒ evidência adotada agora e reinstalação do mod a partir do archive retido quando a operação libera a instância (só oferecido com archive retido). Salvar no mod ⇒ cópia do arquivo observado para a staging (temporário + rename) + nova Installation + adoção; se era `replaced`, `replace_managed` religa a Location à staging (o conteúdo já está salvo). Reverter cópia ⇒ adoção + `replace_managed`. Reverter `replaced` ⇒ o arquivo encontrado vai para o BackupStore: vira o original (`backup_and_create`) se nenhum original estava guardado; senão é posto de lado pela ação nova de journal `set_aside` (não registrado, nunca apagado) e o link volta; num purge, o original guardado é restaurado. "Ignorar agora" e linhas sem decisão ficam intocadas na execução (`partial:`).
- **Installations são imutáveis**: as decisões geram Installation nova (`UpdateInstalledFiles`, evento `mod.files_updated`) e o deploy em curso remapeia em memória as entradas do manifesto para ela (mesmos arquivos de staging), sem religar o mod inteiro. O manifesto é salvo por delta contra o manifesto **lido**, não contra o adotado.
- **Captura** (`RegisterCapture`, installer `captured`, sem archive, evento `mod.captured`): um mod novo por (nome, target), com o mod type do target (o `default` se for dele), categoria procurada/criada pelo nome que a UI envia ("Gerados"), habilitado no profile ativo no fim da ModOrder; ou Installation nova de um mod existente cujo tipo implanta naquele target (senão `capture_target_mismatch`; arquivo de mesmo destino é substituído). O journal da captura é um registro em `app_state` (`deployment.captures`) gravado antes do primeiro movimento; mover = rename no volume, ou cópia confirmada por tamanho e só então remoção do original; a recuperação na inicialização conclui a captura (a decisão foi do usuário) e registra o que a staging tem. Depois da captura o mesmo deploy relê os insumos e implanta os arquivos como links.
- **Aplicação**: decisões só são executadas dentro de um deploy/purge (o motor é o único que escreve no jogo, anti-pattern 24). `ResolveDecision` recebe uma ação por linha; a revisão fora de um deploy (`ResolveChanges`) inicia um deploy com as decisões já dadas e, se ainda faltar decisão, ele para em `await_decision` como sempre. Ação não oferecida para a alteração ⇒ `external_decision_invalid`, nada escrito. Eventos: `deployment.external_changes_decided` (contagem por ação) e `deployment.external_missing_restored` (restauração automática pelo setting `deploy.autoRestoreMissing`, só em deploy iniciado pelo usuário, a exceção de INV-EXT-02).
- **Varredura ao focar** (`ScanOnFocus`, setting `deploy.verifyOnFocus`): links do manifesto a partir de um cursor por até 250 ms; as pastas (arquivos novos) quando a volta pelo manifesto se completa; instância ocupada é pulada; a UI pede no máximo uma a cada 5 s. "Verificar implantação" e a revisão fazem a varredura completa. Contagens mudando emitem `deployment.external_changes_detected` (a UI relê o status).
- **Persistência** (migration 0006): `external_unmanaged` (instância, Location, data). A divergência nunca é persistida. Porta nova `ports.ExternalDecisions`; `ports.FileInfo.Created`.
- Códigos novos: `external_decision_invalid`, `capture_target_mismatch`.

Alternativas rejeitadas: captura como operação separada com journal de deploy próprio (exigiria registrar a Installation antes de os arquivos existirem na staging); reverter edição por hardlink extraindo um único arquivo do archive (o caminho no archive depende do installer, FOMOD incluso); apagar o arquivo encontrado ao reverter `replaced` (viola INV-DEP-01).

## D081 — Comportamentos da F8 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **Arquivos novos (`unexpected`) não param o deploy** nem deixam o status `blocked`: têm contagem própria (`newFiles`) no popover de status e no Overview, com "Revisar alterações", e entram no DLG-15 quando um deploy para por outro motivo. Só alterações em arquivos gerenciados exigem decisão (INV-EXT-01 trata dos caminhos que a operação toca). Do contrário, cada execução do Nemesis bloquearia o auto-deploy.
2. **"Aplicar decisões" fora de um deploy roda um deploy**, que também aplica o que mais estiver pendente no desejado, porque o motor de deploy é o único que escreve no jogo.
3. **O DLG-14 abre o DLG-15 por cima automaticamente** quando o deploy espera por alterações externas; "Aplicar decisões" continua a operação (ou volta ao DLG-14 se ainda houver fallback de método a decidir); "Cancelar operação" cancela sem escrever.
4. **"Abrir pasta"** aparece nas linhas `unexpected` e `permission` (core/09 §4) como botão de ícone, não como ação do select (não é decisão).
5. **"Deixar não gerenciado" não tem desfazer na V1** (nenhuma tela prevista); a tabela permite remover no futuro.
6. **Nome sugerido do mod de captura** ("Arquivos gerados — <data e hora>") e a categoria "Gerados" vêm do catálogo i18n da UI; trocar o idioma depois não renomeia.

## D082 — Mecânica de diagnósticos, notificações e histórico (F9)
Status: vigente (detalha core/06, core/10, INV-OPS-06)

- **Checks puros** no domínio (`domain/health`): `RuleChecks` deriva `rule_cycle`, `mods_incompatible`, `mod_requirement_missing`, `mod_recommendation_missing` e `rule_orphan` de regras + fatos dos mods do profile ativo; `EnableImpact` responde "também habilitar"/"quem depende" (core/06 §6). Os demais checks são montados pelo serviço `application/diagnostics` a partir das fontes que já existem: status de deploy (um só lugar deriva staging, journal, implantação estrangeira, decisão, falha, pendência e alterações externas), métodos de deploy, biblioteca (`installer_required`, `mod_archive_missing`, staging), jogo (`game_not_found`, `game_running`, `game_version_changed`), espaço livre e os checks do adapter. Os de conflitos continuam em `application/conflicts` (D073). Plugins ficam para a F11.
- **Avaliação por instância**, recalculada a cada leitura e nunca persistida; um grupo de checks cujos fatos não podem ser lidos é pulado e a lista vem `partial`; `game_not_found` interrompe os demais grupos. Ordem estável: bloqueante, erro, aviso, informação, depois código e key.
- **Ação** (`diagnostic.Action`) é comando do backend ou lugar (`NavigateTo`). `ExecuteDiagnosticAction(instância, key, id, índice)` reavalia antes de agir: diagnóstico resolvido ⇒ `diagnostic_not_found`; ação não oferecida ou de navegação ⇒ `diagnostic_action_invalid`. INV-OPS-06 é testado dos dois lados: `diagnostic.New` exige ação em todo erro; `TestEveryErrorLeadsToResolution` confere que toda ação está em `diagnostics.Commands()` ou `Places()`; o teste de UI confere que todo `Navigate*` do backend tem lugar em `PLACES`.
- **Bloqueio no deploy**: incompatíveis habilitados e jogo em execução entram no preflight (`mods_incompatible` com os dois nomes; `game_running` também no purge) e no status (`blocked/mods_incompatible`, `blocked/game_running`), então o auto-deploy também para. Processos: porta `ProcessProbe` (Windows: snapshot ToolHelp), interface opcional `ProcessDeclarer` do adapter e o executável do jogo genérico.
- **Adapter**: interface opcional `HealthCheckProvider` (core/11 §1 `healthChecks()`), que recebe só leitura de disco e devolve specs que o core valida. Skyrim implementa `framework_missing` (core/12 §7).
- **Entrega**: tabela `diagnostic_presence` (key, código, severidade, desde quando) por instância; um warning+ visível notifica só na transição ausente → presente. Um assinante do barramento reavalia as instâncias 600 ms depois de qualquer evento (coalescido); a primeira avaliação roda na inicialização, fora do caminho da janela. Notificações, presença e os eventos `diagnostics.changed`/`notification.created` gravam na mesma transação (INV-OPS-01); a bridge repassa esses sinais no canal de operações com `data` (a UI só relê).
- **Histórico**: projeção de `events` com filtros (instância, profile, mod — sujeito ou citado no payload —, prefixos de tipo, origem, período, paginação por sequência). `events.instance_id` (migration 0007) é resolvido ao gravar (payload `instance`, sujeito, mod, profile, operação), para o filtro por jogo sobreviver a exclusões. **Tags de evento** por contexto (`ports.WithEventTags`): `origin` (`auto` no auto-deploy) e `revertOf` (reversões) entram no payload de todo evento da transação. Os payloads ganharam o que o inverso precisa: `rule.removed` com a definição da regra, `override.set` com os vencedores anteriores, `override.cleared` com os vencedores removidos, lotes de override/exclusão com todas as Locations, `mod.attributes_changed` com os atributos anteriores. Reverter é comando novo (`profiles.SetModsEnabledIn`, `RestoreRule`, `RevertOrderChange`, conflitos, `Activate`, `SetAttributes`); entrada revertida não é revertida de novo (`history_already_reverted`).
- **Pacote de diagnóstico**: o serviço monta o relatório (versão, schema, settings sem caminhos e, por jogo, profile ativo, status, mods com prioridade/habilitado/tipo e diagnósticos) e as substituições de caminho; `infrastructure/supportbundle` grava `report.json` + `logs/` num zip por arquivo temporário renomeado no fim, aplicando as substituições também às formas escapadas em JSON dos logs.
- Persistência (migration 0007): `diagnostic_suppressions`, `diagnostic_presence`, `notifications`, `events.instance_id` (com backfill). Portas: `Suppressions.DeleteAll` devolve a contagem; `Notifications.Get/List(limit)`; `Presence`; `History`; `Tx.Notifications/Presence`.
- Códigos novos: `diagnostic_not_found`, `diagnostic_action_invalid`, `diagnostic_not_suppressible`, `history_entry_not_found`, `history_not_reversible`, `history_already_reverted`, `history_stale`; `mods_incompatible` e `game_running` como erro de operação. Eventos: `diagnostics.changed`, `diagnostics.suppressed`, `diagnostics.unsuppressed`, `notification.created`, `notification.updated` (fora do histórico).

Alternativas rejeitadas: persistir diagnósticos com estado "resolvido" (anti-pattern 13; a presença guarda só desde quando existe); notificar a cada recálculo (core/10 §2); guardar no histórico só o "depois" e calcular o inverso pelo estado atual (erra quando algo mudou no meio, a mesma razão de D070); resolver a instância do evento só na leitura (perde mods e profiles excluídos).

## D083 — dettmann-ui na F9: ação no Toast
Status: vigente (executa D016; ui/03 L7)

`Toast` ganhou `action?: { label, onClick }`: botão dentro do toast que executa e fecha o toast (teste em `toast.test.tsx`). Usado pelo "Também habilitar: X, Y" de core/06 §6 e ui/02. Consequência (D052): levar a mudança à cópia da lib do projeto Cayshin.

## D084 — Comportamentos da F9 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **Requisitos** só são avaliados enquanto o mod que requer está habilitado; alvo removido ou ainda não instalado é `missing` (erro com "Importar…"), não regra órfã; órfã é a regra cujo mod de origem (ou um lado de ordem/incompatibilidade) foi removido. Regras desativadas não são avaliadas, nem como órfãs.
2. **`method_unavailable`** é erro **sem** `blocks`: o deploy da F7 já oferece fallback de método como decisão do plano (D078/D079), e bloquear contradiria isso. O catálogo de core/10 diz "Bloqueia: deploy".
3. **`external_changes_pending`** é warning sem `blocks` no modelo (só erros bloqueiam, core/01): o deploy já deixa os caminhos afetados intocados (D079).
4. **`deploy_pending`** só para o status `pending` (não para "nunca implantado").
5. **`game_version_changed`** compara com a versão **reconhecida** (`app_state`), gravada em silêncio na primeira leitura; "Marcar como visto" atualiza. A spec diz "desde a última execução", mas o Play é F12; quando existir, o lançamento passa a registrar a versão.
6. **`disk_space_low`**: menos de 2 GiB livres no volume da staging ou da pasta do jogo.
7. **Staging**: pasta do mod ausente é verificada sempre; arquivo a arquivo só em "Verificar agora" e com `library.verifyStagingOnStartup` (resultado em memória por Installation). Modificado = tamanho diferente. "Aceitar arquivos atuais" grava nova Installation sem os ausentes e com os tamanhos novos (hash descartado); "Reinstalar" só aparece com archive retido.
8. **`game_not_found`** bloqueia deploy, purge, importar, instalar e lançar ("tudo da instância"), e os demais checks daquele jogo não rodam enquanto ele existir.
9. **Notificação de diagnóstico** só para warning/erro/bloqueante que **aparece** (não a cada recálculo; volta a notificar se o problema sumiu e voltou), agregada por jogo + código em 30 s ("e mais N parecidos"). Dispensar não suprime.
10. **Notificação de operação**: falha e cancelamento sempre; sucesso exceto o do auto-deploy; agregadas por tipo + resultado + jogo em 30 s ("3 × Importar concluído"). O auto-deploy parado por decisão aparece como falha com `deploy_needs_decision`.
11. **Desktop**: operação de 10 s ou mais, `ui.desktopNotifications` ligado e janela sem foco; o texto é traduzido pela UI e enviado à bridge (`SendDesktopNotification`), que usa a notificação nativa do Wails.
12. **"Novo"** é relativo à última vez que o usuário saiu da aba Problemas daquele jogo.
13. **Histórico**: ficam fora `operation.*`, `diagnostics.*`, `notification.*`, `deployment.planned` e `deployment.status_changed`; origem `auto` no auto-deploy, `system` reservada, o resto `user`. Reversíveis: habilitar/desabilitar, ordem, regras (criar/remover/desativar/reativar), overrides e exclusões, ativar profile, atributos do mod. Reverter algo cujo estado mudou depois é recusado (`history_stale`), nunca adivinhado. Confirmação acima de 10 itens. A retenção apaga na inicialização os eventos mais antigos que `history.retentionDays` (inclusive os de operações).
14. **Pacote**: `report.json` + logs; com "anonimizar caminhos" (padrão), as pastas de cada jogo (raiz, targets, staging, ArchiveStore, BackupStore) e a pasta do usuário viram marcadores (`<game1>`, `<home>`), também nos logs. Settings do tipo caminho ficam fora. A load order entra com a F11.
15. **Faixas de problemas**: Overview (todos os erros/bloqueantes, menos `game_not_found`, que já tem alerta próprio) e Mods (regras, biblioteca e jogo; menos `rule_cycle`, que já tem faixa própria); até 3 itens com as duas primeiras ações e "Ver tudo". Conflicts não ganhou faixa: a lista de escolhas obsoletas da própria tela já cobre `override_stale`.
16. **Toolbar de Mods**: "Histórico" abre Diagnostics › Histórico filtrado pelo mod do Inspector (encerra D072 item 4); o histórico da ordem (D070) foi para o menu "…".
17. **Dashboard**: na F9 entra só o dashlet "Precisa de atenção" (os demais são F12). Uma ação de navegação de outro jogo ativa esse jogo antes de abrir o lugar.
18. **Problemas e Histórico são por jogo**: sem jogo ativo, as abas explicam isso (Operações e Log continuam globais, D054).
19. **Dependências ao habilitar**: o toast "Também habilitar" segue requisitos `requires` de forma transitiva (recomendações nunca); ao desabilitar, um aviso lista os habilitados que dependem do mod. Nada é bloqueado nem habilitado sem pedido.

## D085 — Colisão de destino no plano FOMOD: fase, depois prioridade
Status: vigente (confirmada pelo usuário em 2026-10-08; emenda core/03 §2)

core/03 §2 dizia "o de maior `priority` vence; empate → o último declarado". Os FOMODs reais e a suíte "FOMOD Compliance Tests" usada pelo instalador do Vortex (casos `test_steps_ignore_required_priority`, `test_conditionals_ignore_priority`, `test_conditionals_ignore_required_priority`) mostram outra precedência: as instruções são aplicadas em **fases** — `requiredInstallFiles`, depois as opções dos passos visíveis, depois `conditionalFileInstalls` — e uma fase posterior vence a anterior qualquer que seja a prioridade. A prioridade só desempata **dentro** da fase; empate de prioridade → o último declarado (na ordem de exibição) vence.

Motivo: FOMODs reais usam `conditionalFileInstalls` para substituir arquivos obrigatórios com prioridade padrão; com a regra antiga o substituto perderia para o obrigatório de prioridade maior e o mod ficaria instalado diferente do Vortex/MO2. Alternativa rejeitada: prioridade global (texto antigo de core/03 §2).

Consequências: `fomod.Resolve` ordena por (fase, prioridade, declaração); teste `TestResolvePhasesPriorityAndFlags`. INV-LIB-02 continua garantido (um arquivo por destino).

## D086 — Comportamentos da F10 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08; emenda D066 item 8)

1. **Estado de plugin nas condições antes da F11**: um arquivo citado por `fileDependency` está presente se um mod habilitado do profile ativo o fornece no target de plugins (estado desejado) ou se existe nesse target (observado). Presente é `Active`, exceto quando o profile registra o plugin como desabilitado (`PluginsEnabled`), que é `Inactive`. A F11 troca isso pelo PluginState completo.
2. **Padrões de um grupo não visitado**: opções `Required` (travadas) e `Recommended`; em grupo de escolha única só a primeira recomendada. `SelectExactlyOne` e `SelectAtLeastOne` sem nenhuma marcada recebem a primeira opção utilizável (paridade Vortex). `NotUsable` nunca fica marcada, nem vinda de escolha gravada.
3. **Ordem**: sem atributo `order`, vale o padrão do esquema (`Ascending`), por nome sem diferenciar maiúsculas e estável.
4. **Destinos**: `file` sem atributo `destination` vai para o caminho da origem; `destination=""` em `file` é o nome do arquivo na raiz do mod; `folder` com `""` é a raiz. Nada vai para `fomod/` na raiz do mod. Pasta vazia citada não gera aviso.
5. **Flags e passos**: a visibilidade de um passo e o tipo de suas opções leem só as flags dos passos anteriores visíveis; `conditionalFileInstalls` lê as flags finais. Flag não definida vale `""` (FOMODs reais testam `value=""`).
6. **Reinstall**: sempre abre o assistente com as escolhas anteriores (o botão "Instalar com as escolhas anteriores" pula os passos). Uma instalação feita pelo `basic` antes da F10 (`fomod_pending`) também passa pelo assistente. As opções gravadas são a seleção efetiva de todos os grupos dos passos visíveis, por posição **e** nome; escolha que não corresponde mais ao instalador é descartada com aviso e o grupo volta ao padrão.
7. **FOMOD com script** (`fomod/script.cs` sem `ModuleConfig.xml`): decisão `fomod_script`, que reusa a árvore de pastas do DLG-05 com o aviso e instala com o `basic`; substitui a `fomod_pending` de D066 item 8. Archive com os dois usa o XML.
8. **Requisitos detectados**: só `fileDependency` `Active`/`Inactive` alcançadas por `And` a partir de `moduleDependencies`. O mod alvo é o mod instalado (outro que não o próprio) que fornece o arquivo no target de plugins, o primeiro por nome. A caixa "criar regra de requisito" vem desmarcada (INV-CON-02); a regra é `requires`, `source=metadata`, nota = arquivo, e não é duplicada no reinstall. Arquivo sem mod que o forneça aparece só como informação.
9. **Versões**: jogo pelo `VersionFile` do adapter; gerenciador (`fommDependency`) = versão do app; `foseDependency` (script extender) desconhecida → verdadeira com aviso.
10. **Cancelar o assistente** cancela a operação; o mod fica `imported` com o archive retido (comportamento existente do pipeline) e "Instalar" reabre o assistente.
11. **XML**: qualquer declaração `<!ENTITY` é recusada (`fomod_invalid_xml`); entidades HTML comuns em descrições são aceitas.
12. **Imagens**: servidas como data URL só se referenciadas pelo módulo ou por uma opção, existentes no archive, até 16 MB, png/jpg/gif/bmp/webp (`fomod_image_unavailable` caso contrário).
13. **Fixtures reais**: tiradas de archives de Skyrim SE da pasta de downloads do usuário (escolha do usuário em 2026-10-02) por `tools/fomodfixtures`; só a listagem e os XML de `fomod/` entram em `internal/integration/testdata/fomod`, nunca conteúdo do mod. Planos esperados conferidos à mão contra os XML.

## D087 — dettmann-ui na F10: Stepper interativo acessível
Status: vigente (executa D016)

`Stepper.Step` ganhou `disabled` e, quando o `Stepper.Root` é `interactive`, vira botão de teclado (`role="button"`, `tabIndex`, Enter/Espaço, `aria-current="step"`, `aria-disabled`, anel de foco do tema). Usado pela coluna de passos do DLG-06 ("navegável para passos já visitados"). Teste em `stepper.test.tsx`. Consequência (D052): levar a mudança à cópia da lib do projeto Cayshin.

## D088 — Mecânica de plugins e load order (F11)
Status: vigente (detalha core/08, core/12 §5–7, D029, D040, D041; INV-PLG-01..03)

- **Adapter** (core/11 §1): interfaces opcionais `ports.PluginSupport` (alvo de plugins, reconhecimento, cabeçalho, implícitos, restrições rígidas como arestas `adapter:*`, índices e limites), `ports.LoadOrderSupport` (local do arquivo como pasta conhecida + caminho, ordem manual, `Serialize`/`Parse`) e `ports.PluginArchives` (`bsa_without_plugin`). O core resolve pastas conhecidas pela porta `KnownFolders` e é o único que escreve o arquivo (anti-pattern 24). Skyrim: TES4 (flags `0x1`/`0x200`, `MAST`/`SNAM`/`CNAM`/`HEDR`, subrecord `XXXX`), implícitos = 5 masters + `Skyrim.ccc`, master antes de dependente e flag master antes do resto, índices `00`–`FD` / `FE:000`, `plugins.txt` em Windows-1252 com CRLF e comentário no topo; lido como UTF-8 quando válido.
- **Domínio** (`domain/plugin`): `Constraints` = rígidas (adapter) + suaves (regras e grupos) + fixos (implícitos, travados no topo por ordem) + `IndexLock` (posição na lista completa, ativos e inativos). `Sort` aplica tudo; `Settle` só rígidas + fixos + locks (mantém a ordem do usuário). `Place` move um bloco entre os não travados e recusa com a posição válida mais próxima (`NearestIndex` reproduz a alternativa). `Merge` tira da ordem o que saiu do inventário (o `PluginState` fica) e acrescenta os novos no fim, na ordem natural do inventário. Grupos são transitivos (um grupo vazio no meio ainda ordena os outros). Regras, grupos e atribuições recusam ciclo também contra as arestas rígidas (INV-ORD-04). Teste de propriedade: `TestEngineNeverBreaksHardConstraints` (INV-PLG-01).
- **Inventário** (calculado): vencedores do desejado no alvo de plugins (cálculo de conflitos só sobre os arquivos de plugin das Installations), não gerenciados do disco (exceto os do manifesto que saem no próximo deploy), implícitos marcados pelo adapter (`base_game` se não vieram de mod). Plugins de mods desabilitados ou perdedores ficam numa lista à parte. **Cache de cabeçalho**: em memória e em `<dataDir>/cache/plugin-headers.json`, chave = caminho absoluto + tamanho + data de modificação (as Installations não guardam hash; ler o hash de um `.esm` de centenas de MB a cada consulta custaria mais que o cabeçalho). "Reconstruir cache" apaga o arquivo.
- **Estado por profile**: o arranjo (merge + Sort se auto-sort, senão Settle) é persistido por toda escrita: comandos de plugin, sincronização em segundo plano (eventos que mudam o inventário, coalescidos em 400 ms; instância ocupada é tentada de novo) e o `post` do deploy. Plugin nunca visto ganha o estado padrão da origem (`plugins.enableOnModEnable` / `plugins.enableExternallyAdded`); implícito é sempre ativo e não pode ser desativado (`plugin_implicit`). As consultas mostram o mesmo arranjo antes de ele ser gravado.
- **Escrita do arquivo** (INV-PLG-02/03): só a partir do arranjo do profile ativo, recusada se alguma aresta rígida quebrar (`order_violates_constraints`). Disciplina de journal: `PendingHash` é gravado antes da escrita (atômica, temporário + rename) e vira `FileHash` depois; um arquivo com qualquer dos dois hashes é "nosso". Diferente ⇒ alteração externa: nada é escrito. O arquivo substituído é guardado em `<BackupStore>/load_order/` na primeira escrita e sempre que era externo (nunca sobrescrito, sufixo `.backupN`). O registro guarda a ordem escrita anterior ("Restaurar load order anterior"). Operação `apply_load_order` (steps `check`, `write`) com o lock da instância; o `post` do deploy escreve sob o lock do deploy; purge não escreve.
- **Triagem** (D040): `ResolveLoadOrderChange(import_load_order | restore_load_order)`. Importar: a ordem e as marcas `*` do arquivo viram o profile passando pelo motor (Sort com auto-sort, senão Settle), com snapshot `before_restore` antes; o arquivo encontrado é guardado no BackupStore, adotado como última escrita, e o que o motor mudou é escrito em seguida. Restaurar: escreve a ordem do profile. "Importar ordem…" (texto) usa o mesmo caminho sem adotar arquivo.
- **Monitor**: a cada 2 s compara tamanho/data do arquivo de cada instância; mudou ⇒ recalcula o estado externo e emite `loadorder.external_change_detected` na transição (diagnósticos e telas releem). Instância com lock é pulada.
- **Diagnósticos** (puros em `domain/health/plugins.go`, agregados pelo serviço de diagnósticos): `plugin_missing_master` (ações: habilitar o mod instalado que fornece o master, ou Importar; Desativar), `plugin_disabled_master`, `plugin_limit_exceeded` (por tipo), `plugin_header_unreadable`, `plugin_rule_orphan` (regra cujo plugin não existe no inventário nem em mod instalado), `plugin_rule_cycle` (bloqueia o sort), `plugin_lock_conflict`, `plugin_from_losing_file`, `load_order_external_change`, `plugin_master_order` (só sobre a ordem externa), `bsa_without_plugin`. Lugares novos: `plugins`, `plugins.rules`, `load_order`, `load_order.review`.
- **Persistência** (migration 0008): `instance_plugin_rules` (documento por instância, D026). `applied_load_orders.body_json` ganhou `pendingHash`, `prevOrder`, `prevEnabled`, `original`. Porta `Tx.PluginRules()`.
- Códigos novos: `plugin_not_found`, `order_violates_constraints`, `index_lock_conflict`, `load_order_file_locked`, `plugins_unsupported`, `plugin_implicit`, `plugin_rule_self_reference`, `plugin_group_invalid`, `plugin_group_not_found`, `plugin_group_exists`, `plugin_rule_cycle`, `load_order_external_change`, `load_order_no_external_change`, `loadorder_nothing_to_undo`, `loadorder_nothing_to_restore`, `loadorder_manual_disabled`, `loadorder_import_empty`. Eventos: `plugins.inventory_changed`, `plugin.enabled`/`disabled`, `loadorder.changed`/`sorted`/`applied`/`imported`/`locked`/`external_change_detected`, `plugin_rule.created`/`removed`, `plugin_group.created`/`updated`/`deleted`/`assigned`; a bridge repassa `plugins.*`, `plugin*.`, `loadorder.*` como sinais (a UI só relê).

Alternativas rejeitadas: hash SHA-256 como chave do cache (custo de ler arquivos inteiros a cada consulta); arranjo só calculado na leitura, sem persistir (estados padrão de plugins novos mudariam com a setting e "Desfazer" não teria base); escrever `plugins.txt` pelo adapter (anti-pattern 24); quebrar ciclo escolhendo uma aresta (D028).

## D089 — Comportamentos da F11 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **`load_order_external_change` não bloqueia o deploy**: core/08 §8 diz "blocking do deploy até triagem"; core/10 §1.1 diz warning que bloqueia o apply da load order. Segue core/10: o deploy implanta os arquivos e o `post` não escreve o `plugins.txt` (INV-PLG-03 mantido); a escrita fica recusada até a triagem e o diagnóstico leva a ela. Bloquear o deploy inteiro pararia o auto-deploy cada vez que o launcher reescreve o arquivo (mesmo motivo de D081 item 1).
2. **Primeira escrita sobre um `plugins.txt` que o gerenciador nunca escreveu** e cujo conteúdo difere do que seria escrito é tratada como alteração externa (triagem: importar ou restaurar). Assim a ordem que o usuário já tinha antes de gerenciar o jogo não se perde.
3. **Escrita automática da load order** segue `automation.deployOnChange`: ligado, mudanças de plugin (ativar, ordenar, regras, sync) gravam o arquivo sem operação própria (evento com origem `auto`); desligado, a tela Load Order mostra "Diferente da aplicada" com "Aplicar", e o próximo deploy grava.
4. **IndexLock é a posição na lista completa** (ativos e inativos, coluna "#" da tela Load Order), não o índice de carregamento hexadecimal; um lock que contradiz as restrições é ignorado no arranjo e gera `plugin_lock_conflict`.
5. **Prévia de sort (DLG-25)** aparece quando o sort moveria mais que `order.snapshotMoveThreshold` (padrão 20) plugins, o mesmo limite do snapshot automático `before_sort`; abaixo dele, aplica direto com toast "N plugins movidos" + Desfazer. "Desfazer última ordenação" guarda a ordem anterior ao último sort em `app_state` por profile.
6. **Arrastar e regras**: com ou sem auto-sort, um movimento manual precisa respeitar todas as restrições (rígidas, regras, grupos e locks); fixos e travados não são arrastáveis.
7. **Caminho Epic do `plugins.txt`**: `%LOCALAPPDATA%\Skyrim Special Edition EPIC\plugins.txt` (convenção do Vortex), ainda **(verificar)** antes do release.
8. **Exportar** copia a lista em texto UTF-8 (`*` = ativo, sem implícitos); o pacote de diagnóstico inclui a mesma lista por jogo (encerra D084 item 14).
9. **Plugins de mods desabilitados** aparecem numa seção sob a tabela, ligada pelo filtro "Plugins de mods desabilitados", com o motivo (mod desabilitado / perde o arquivo).
10. **Condições FOMOD** (D086 item 1) continuam lendo o estado registrado no profile; agora todo plugin do inventário tem estado registrado após o primeiro arranjo.

## D090 — Mecânica de Settings, backups, launch, Overview e Dashboard (F12)
Status: vigente (detalha core/13, core/14 §3–4, core/11 §6, core/04 §9, D045)

- **Catálogo** (`domain/settings`): campos `ReadOnly` (só exibido: `app.dataDir`, padrão derivado do `dataDir` real) e `ByOperation` (valor vive na `GameInstance` e muda só por operação com prévia: `mods.stagingPath`, `mods.archiveStorePath`, `deploy.method`; nunca listado nem gravado como setting, `setting_read_only`). Tipo novo `list` para `ui.dashboard.dashlets`: ids separados por vírgula, prefixo `-` (oculto) ou `+` (fixado: "Primeiros passos" continua visível depois de completo); ids que faltam entram no fim, visíveis (dashlet novo de uma versão futura aparece sem resetar o layout). `ui.reduceMotion` deriva do Windows (`SPI_GETCLIENTAREAANIMATION`, porta `Preferences`). Reinício: o processo guarda os valores `RestartRequired` lidos na inicialização; `RestartState` lista os que mudaram e a restauração pendente; "Reiniciar agora" inicia um novo processo com `--restart-after=<pid>`, que espera o antigo sair antes de abrir o banco.
- **Backups** (`application/backups`, porta `DatabaseBackups` com a API de backup online do SQLite em `sqlite/backup.go`): arquivos `<dataDir>/backups/state-<UTC>-<tipo>.db`, a pasta é a fonte da lista. Tipos `auto` (a cada 1 h com `total_changes()` diferente do último backup, e no `Close`), `pre_migration` (antes de migrar um banco existente; falha registrada, não fatal), `manual`, `startup` (após abrir sem erro), `pre_restore`. Retenção: auto 24 + o mais novo de cada um dos últimos 7 dias; pre_migration 3; pre_restore 3; startup 1; manual todos. Falha ⇒ `backups.lastFailure` em `app_state` e `backup_failed` (sucesso apaga). Restaurar: backup do atual, validação (`integrity_check`, schema 1..atual) e cópia para `<dataDir>/state.restore-pending.db`; na próxima inicialização, antes de abrir, o pendente substitui `state.db` (+ `-wal`/`-shm`); interrompido, completa na seguinte. Depois de aplicar, toda instância fica `unknown/not_verified` (`deployment.unverified.<id>` em `app_state`) até um scan completo (Verificar ou o `scan` do deploy).
- **Launch** (`application/launch`): interface opcional `ports.LaunchSupport` (`LaunchOptions`: executável, args, pasta relativos à raiz, um padrão); Skyrim: loader do SKSE na raiz ⇒ `skse` (padrão) + `game`; jogo genérico: o executável declarado. `ProcessLauncher` virou `Start` (só inicia). A checagem é calculada a cada leitura: `running` > sem opção > bloqueio (diagnóstico visível que bloqueia `launch`) > instância ocupada > deploy pendente (`pending`/`never_deployed`) > avisos (status `blocked`/`failed`/`unknown` exceto `game_running`, e códigos marcados "launch (aviso)" em core/10, `diagnostic.WarnsBeforeLaunch`) > pronto. Operação `launch` (steps `check`, `deploy`, `start`) sem lock da instância: com deploy, inicia um `deploy` normal (decisão no diálogo de sempre) e espera o fim; depois rechecagem de bloqueios. Sucesso grava `game.launched`, reconhece a versão do jogo (D084 item 5) e marca o último uso; não notifica. Monitor de processo (2 s) grava `game.running_changed` só nas transições (fora do histórico; a bridge repassa `game.*` e `deployment.external_changes_detected` como sinais).
- **Mover ArchiveStore**: operação `move_archives` (`validate`, `copy`, `save`, `cleanup`) no módulo de deploy, com o mesmo mecanismo verificado de `move_staging` (registro em `app_state`, hardlink no mesmo volume/cópia conferida, remoção só com marcador); sem purge (archives não são implantados). Código `archives_unchanged`, evento `archives.moved`.
- **Overview/Dashboard** (`application/overview`): `InstanceOverview` agrega, a cada leitura, detalhes, status, diagnósticos visíveis agrupados por código, mods (instalados, habilitados, tamanho, arquivos), conflitos (pares, não revisados, overrides), plugins (ativos e limites) e 5 entradas do histórico; parte ilegível volta nula ("Indisponível"), nunca zero. Primeiros passos derivados de fatos (instância, mod instalado, manifesto ou `deployment.applied`, `game.launched`). Jogos recentes por `games.lastUsed.<id>` (ativar, gerenciar, lançar). Layout: regras do backend (completo some salvo `+`; "Precisa de atenção" travado com bloqueante; sem jogos só Primeiros passos e Novidades).
- **Limpar temporários**: `<staging>/.tmp` e `*.installing`, só com marcador da staging e só em instâncias sem operação (as ocupadas são puladas e contadas).
- Códigos novos: `setting_read_only`, `backup_failed`, `backup_not_found`, `backup_invalid`, `restore_not_pending`, `archives_unchanged`, `launch_unavailable`, `launch_blocked`, `launch_needs_confirmation`, `launch_deploy_failed`, `launch_option_unknown`, `launch_start_failed`. Eventos: `game.launched`, `game.running_changed`, `archives.moved`.

Alternativas rejeitadas: `VACUUM INTO` (a API de backup online é a que core/14 pede e copia o WAL junto); restaurar com `NewRestore` no banco aberto (serviços com estado em memória exigiriam reinício de qualquer forma, e uma escrita concorrente poderia se misturar); launch segurando o lock da instância (bloquearia o deploy que ele mesmo dispara); publicar a transição de processo sem persistir (D020).

## D091 — Comportamentos da F12 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **`app.updateCheck` e `app.updateChannel`** existem no catálogo com o default, mas não aparecem em Settings › Aplicação até o mecanismo de atualização existir (F15, `plano-de-publicacao.md`): um switch que não faz nada seria botão quebrado (anti-pattern 18). *Cumprido na F15: aparecem com a D104.*
2. **`mods.useSuggestedStaging` desligado**: o assistente (DLG-01) deixa a staging em branco, com "Usar a sugerida" e "Alterar…", e não avança sem ela; as outras pastas continuam sugeridas.
3. **Settings por jogo** usam um único select de jogo compartilhado entre as abas (padrão: o jogo ativo); Interface › Automação e Diagnóstico também são por jogo e ficam sob o select. A aba Plugins só lista jogos com `plugins`.
4. **`backup_failed`** aparece em todos os jogos (diagnósticos são por instância), com a mesma chave; ação "Abrir Configurações › Soluções".
5. **Overview**: números levam à tela com filtro inicial (Mods: habilitados; Plugins: ativos; Conflitos: não revisados); "Tamanho" leva a Mods. O cabeçalho tem Play; o Deploy fica na faixa de status logo abaixo (já existente). Arte do jogo não existe na V1 (ícone).
6. **Play no estado `blocked`** fica clicável e abre o DLG-26 só com as ações; `running`, `busy` e sem executável ficam desabilitados com o motivo no tooltip.
7. **`deploy needed` inclui `never_deployed`** (o primeiro Play de um jogo implanta antes), diferente de `deploy_pending` (D084 item 4), que continua só para `pending`.
8. **Novidades** é uma lista curta de destaques da V1 no catálogo i18n, com a versão instalada; não há changelog por versão até o release (F15).
9. **"Reconstruir cache de cabeçalhos"** é de app (o cache é um só), aparece se algum jogo tem `plugins`.

## D092 — dettmann-ui na F12: Input.Number
Status: vigente (executa D016)

`Input.Number`: stepper numérico da família Input (botões − e + com nome acessível, `type=number`, setas ↑/↓ e Enter confirmam, Esc descarta). Digitação é rascunho confirmado no blur/Enter, com `min`/`max` aplicados, para "12" não gravar "1" no caminho; rascunho vazio volta ao valor. Usado pelos limites de Settings ("stepper numérico para limites"). Teste em `input-number.test.tsx`. Consequência (D052): levar a mudança à cópia da lib do projeto Cayshin.

## D093 — dettmann-ui na F13: ContextMenu por teclado, Inspector com fechar/Esc, contraste do ui/04
Status: vigente (executa D016, D043)

- `ContextMenu`: abre com `Shift+F10` e com a tecla de menu, posicionado sob o elemento em foco ou sob o `aria-activedescendant` dele (a linha focada de uma `DataTable`); foca o primeiro item habilitado; `↑/↓/Home/End` navegam; `Tab` e `Esc` fecham; fechar por teclado ou escolher um item devolve o foco a quem abriu.
- `Inspector`: props `onClose` e `closeLabel` renderizam o botão de fechar e fecham com `Esc` de qualquer ponto da página (a lista detalhada costuma ter o foco), exceto quando o `Esc` pertence a outro: campo de edição em foco, diálogo modal, menu ou popup aberto.
- `theme:check` passou a verificar os requisitos de ui/04 §3 no tema `orchestrator` (claro e escuro): texto principal ≥ 7:1 sobre canvas/surface/brand-subtle, `fg-tertiary` ≥ 3:1, foco ≥ 3:1 contra canvas, surface e brand-subtle. Os valores atuais passam sem ajuste.
- Testes em `context-menu-inspector.test.tsx`. Consequência (D052): levar as mudanças à cópia da lib do projeto Cayshin.

## D094 — Comportamentos da F13 não fixados pela spec
Status: vigente (confirmada pelo usuário em 2026-10-08)

1. **`Ctrl+1..7`** seguem a ordem dos itens da seção do jogo como o backend os oferece (por capability; sem Plugins/Load Order a numeração encurta). Navegar pelo teclado (atalho ou paleta) leva o foco ao conteúdo (`<main>`); há link "Pular para o conteúdo" no início do shell.
2. **`Ctrl+I`** abre o seletor de arquivos do jogo ativo de qualquer tela (só se o jogo tem Mods); com arquivos escolhidos, abre Mods para mostrar a fila.
3. **Teclas de linha**: `Espaço` habilita/desabilita a linha em foco (Mods, Plugins; num separador, recolhe/expande); a seleção continua em `Ctrl+Espaço`. `Delete` pede a remoção da seleção (ou da linha em foco, se ela não está selecionada) sempre pelo DLG-07; nunca remove direto. `Shift+F10`/tecla de menu abrem o menu da linha.
4. **Atalhos com diálogo aberto**: só `Ctrl+K` e `F5` agem; os demais esperariam atrás do modal.
5. **Estado "ocupado"** (ui/00 §4): faixa com o nome da operação que detém o lock da instância (`DeployStatus.busy`), em Overview, Mods, Conflicts, Plugins, Load Order e Profiles, para operações longas (deploy, purge, mover staging/arquivos, trocar método, remover mods, aplicar load order, importação — que diz que novas importações entram na fila). Comandos curtos não são anunciados. Os botões que já se desabilitavam com `busy` continuam assim; os demais seguem habilitados e o backend recusa com `instance_busy` (D038) e o toast traduzido — desabilitar cada ação mutante de cada tela exigiria a disponibilidade por ação vinda do backend, que não existe na V1.
6. **Carregamento**: skeleton só na primeira leitura de uma tela ou lista; releituras (eventos, `F5`) mantêm os dados na tela até a resposta, sem piscar. Spinners pequenos ficam em diálogos, Inspector e botões.
7. **Multi-seleção de Plugins** aparece com ≥ 2 selecionados (ui/00 §2.6), como em Mods; as duas usam o `ActionBar` da lib.
8. **"Nenhum resultado"** em tabela filtrada (Mods, Plugins, Conflicts) sempre oferece "Limpar filtros".
9. **Textos pt-BR**: "profile" virou "perfil" em todo o catálogo (glossário: `Profile` → Perfil); "Backend offline" → "Backend desconectado"; "Auto-sort" → "Ordenação automática". Termos mantidos em inglês por serem do domínio de modding: Deploy, Purge, Mod, Plugin, Load order, Staging, Master, Light, Flags.

## D095 — Adoção da dettmann-ui v2 (fundação)
Status: emendada por D107 (itens 2 e 4: o app migrou para a v2)

1. **v2 com ruptura**: sem camada de aliases para tokens, `data-tone` ou `variant`/`tone` do Button. A fundação (motor de tema por sementes, contrato `emphasis × intent`, movimento, orçamento 60/30/10, playground) vive em `dettmann-ui-vnext/`; decisões detalhadas em `dettmann-ui-vnext/docs/decisions.md` (D-011 em diante).
2. **App congelado em `dettmann-ui-v1`** até o subprojeto 4 (migração do `frontend/`). Até lá, nenhuma tela usa a v2; as tabelas de substituição estão em `dettmann-ui-vnext/docs/migration.md`.
3. **Quatro subprojetos**: (1) fundação (motor de temas, contrato de ênfase, primitivas; concluída), (2) ícones animados, (3) revisão dos componentes com personalidade e micro-interações, (4) integração no Mod Orchestrator (migração do `frontend/`).
4. **Skills novas** `dettmann-ui-use`, `dettmann-ui-author` e `dettmann-ui-improve` (instaladas em `.claude/skills` e `.cursor/skills` por `npm run skills:install`) valem para o trabalho em `dettmann-ui-vnext/`. O `frontend/` continua com as skills v1 (`theme-first`, `composition`, `component-authoring`, `ui-review`, em `dettmann-ui-v1/.cursor/skills/dettmann-ui/`) até o subprojeto 4, quando as novas as substituem (inclusive os caminhos citados na D016); o `AGENTS.md` roteia por pasta.
5. **Escolhas de design do usuário**: forma `balanced` (controle 8, card 12, painel 16 px); movimento `expressive` com intensidade por ênfase (menu responsivo, CTA expressivo); tipografia Plus Jakarta Sans + JetBrains Mono; tema por sementes + botões de personalidade (com `overrides` por papel como válvula de escape); família `secondary` removida (a estrutura vem de neutros tingidos pela marca).

## D096 — Contribuições à dettmann-ui licenciadas também sob MIT
Status: vigente (emenda D076)

Escolhido pelo usuário em 2026-10-08. O projeto continua inteiro sob **GPL-3.0-or-later** (D076), mas contribuições de terceiros nas pastas `dettmann-ui-v1/` e `dettmann-ui-vnext/` entram sob GPL-3.0-or-later **e** MIT (cláusula em `CONTRIBUTING.md`). Motivo: o autor quer reutilizar a `dettmann-ui` como base de projetos comerciais separados, possivelmente fechados. O código que ele mesmo escreveu já pode ser usado assim por ser o titular; o código de outras pessoas recebido só sob GPL impediria esse uso.

Consequências:
- Não há CLA; a cláusula vale ao abrir o PR (inbound declarado no `CONTRIBUTING.md`). Quem não aceitar MIT não altera essas pastas.
- Revisão de PR: mudança em `dettmann-ui-*` só entra se o autor do PR for o autor do código (ou o código tiver licença compatível com MIT, com a atribuição preservada).
- A licença de distribuição da `dettmann-ui` não muda: dentro do Mod Orchestrator ela continua GPL-3.0-or-later.

Alternativas rejeitadas: CLA no repositório todo (afasta contribuidores; o Vortex, referência do projeto, é GPL-3.0 sem CLA); lib fechada ou só com código compilado (impede compilar e contribuir só com o repositório, contrariando D076); MPL-2.0 ou MIT na lib inteira (o usuário preferiu uma licença única para o projeto).

Proteção do nome: nenhuma licença protege o nome "Mod Orchestrator"; isso depende de registro de marca (INPI), fora do repositório.

## D097 — ZIP com método LZMA (14)
Status: vigente (emenda D062)

`archive/zip` só lê Store e Deflate, mas o 7-Zip grava ZIP com LZMA (método 14), e mods reais do Nexus vêm assim (FSMP 4.1.1: 46 de 78 entradas), recusados como `archive_corrupt`. O extrator lê o método 14 com `github.com/ulikunitz/xz/lzma` (BSD-3), que já era dependência transitiva aprovada em D062 e passa a direta: abre a entrada crua (`OpenRaw`), valida o prefixo do APPNOTE 5.8.8 (versão do SDK, tamanho das propriedades = 5, 5 bytes de propriedades), remonta o cabeçalho LZMA clássico com o tamanho do diretório central (o marcador de fim, bit 1 da flag, é aceito com ou sem) e confere tamanho e CRC-32 como o `archive/zip` faz. O caminho da entrada continua validado antes de abrir o conteúdo (INV-ID-04) e os limites de tamanho valem igual.

Motivo: suporte por leitor, sem registrar descompressor global e sem dependência nova. Alternativas rejeitadas: `zip.RegisterDecompressor` (o descompressor não recebe o tamanho, e LZMA sem marcador de fim precisa dele); Deflate64 (método 9), suspeita inicial, não apareceu nos archives reais: continua `archive_corrupt` até aparecer um caso.

## D098 — Cópia corrigida do rardecode em `third_party/`
Status: vigente (emenda D062)

`nwaples/rardecode/v2` v2.4.1 (a versão mais recente) corrompe entradas RAR maiores que a janela de decodificação: (1) um match que cruza o fim da janela perde o resto (`bad file checksum`); (2) um filtro lido enquanto um bloco de filtro que cruza o fim da janela está sendo montado recebe offset errado (`invalid filter`). Em archive sólido, todos os arquivos seguintes falham. Visto num mod real (Demon - 3BA, RAR 5 sólido, janela de 128 MiB, BSA de 516 MB).

O app usa uma cópia do v2.4.1 em `third_party/rardecode` com as duas correções em `decode_reader.go` (descritas em `PATCHES.md`), ligada por `replace` no `go.mod`; o import continua `github.com/nwaples/rardecode/v2`. A licença BSD-2 e a atribuição acompanham a cópia (D076). Teste de regressão: fixture sintética `rar5-wrap.rar`, que falha com o upstream e com cada correção isolada.

Motivo: sem a correção, archives RAR grandes (comuns em mods de texturas) não importam, e não existe versão corrigida publicada. Custo aceito: manter a cópia até o upstream corrigir; a correção deve ser proposta ao upstream e a cópia removida quando houver release equivalente. Alternativas rejeitadas: fork publicado em outro repositório (mais um repositório para manter, mesmo efeito); 7-Zip/unRAR externo (rejeitado em D062).

## D099 — Hardening da F14: caminhos, archives e erros de arquivo
Status: vigente (executa INV-ID-02, INV-ID-04, D039; emenda D062)

Achados dos testes da F14 e o que passou a valer:

1. **UTF-8 inválido é recusado** por `relpath.Parse`: o Windows troca cada byte inválido por U+FFFD, então dois nomes diferentes viravam o mesmo arquivo. A checagem de "vazio" passou a ser feita depois da normalização (antes, `" /"` era recusado e `" "` aceito).
2. **ZIP sem a flag UTF-8** tem os nomes decodificados em CP437 (padrão do APPNOTE, apêndice D) com `golang.org/x/text/encoding/charmap`; o módulo já estava no grafo como dependência indireta e passa a direta (nenhum módulo novo). RAR e 7z já trazem Unicode.
3. **`Key` dobra mais que o NTFS**: `strings.ToLower` junta alguns caracteres que o NTFS mantém distintos (`İ`/`i`, `K` Kelvin/`k`, `Å` Angstrom/`å`). Aceito: dois arquivos assim contam como uma Location (um conflito a mais), nunca o contrário. O fuzz com o Windows como oráculo (`FuzzRelpathOnWindows`) verifica a direção perigosa: mesmo arquivo no disco implica mesma `Key`.
4. **Origem que não pode ser lida** (arquivo em uso por outro programa, como um antivírus, ou sem permissão) falha o import com `import_source_unreadable` (`reason` = `file_locked` ou `permission_denied`), em vez de `import_unsupported_format`.
5. **Falha do passo `post` não esconde `deploy_failed`**: quando Locations já falharam, o resultado da operação é `deploy_failed` com o motivo, e a load order acompanha o próximo deploy. Erros do SO em `Stat`, `ReadDir`, `Open` e `WriteFile` passam a ser classificados (permissão, arquivo travado, disco cheio, caminho longo), como já eram nas escritas.
6. **Mover staging ou ArchiveStore interrompido** antes de o marcador ser escrito deixava a pasta de destino vazia; o registro da mudança guarda se a operação criou a pasta (`created`) e a recuperação a remove se estiver vazia.
7. **Eventos de operação** são gravados com `instance_id` pelo mesmo escritor do unit of work (antes ficavam vazios, ao contrário do backfill da migration 0007). Sem efeito visível: o histórico esconde `operation.*`.

## D100 — Tela de recuperação do banco (core/14 §2, §5)
Status: vigente; lacuna resolvida em parte por D145 (confirmada pelo usuário em 2026-10-09)

O app encerrava sem janela (`log.Fatalf`) quando o banco estava danificado, era de uma versão mais nova ou uma migration falhava. A spec pede a tela de recuperação, mas não a desenha; esta é a forma adotada:

- **Fechamento anormal**: o arquivo `<dataDir>/state.session` existe enquanto o app roda e é apagado no fechamento normal. Encontrado na inicialização, roda `PRAGMA integrity_check` (1,9 s num banco de 535 MB com 2.000 mods e 500 mil arquivos implantados; não roda depois de um fechamento normal).
- **Falha ao usar o banco** vira `StartupFailure` com `reason`: `corrupt` (não é banco, página danificada, integrity_check falhou), `newer_schema`, `migration_failed` (a migration é desfeita e o banco fica na versão anterior; há backup pré-migration) ou `startup_failed` (qualquer outra). A janela abre só a tela de recuperação; o idioma vem do SO (não há settings sem banco) e o tema é o padrão.
- **Ações**: restaurar um backup validado (recomendada: o banco atual vai para a pasta de backups como `damaged`, e a cópia é aplicada na inicialização seguinte como uma restauração normal, com as instâncias "não verificadas"); começar do zero (o banco vai para backups como `damaged`; nada fora da pasta de dados é tocado); abrir as pastas de backups e de logs; fechar. Backups `damaged` aparecem na lista como inválidos e a retenção guarda os 3 últimos. A poda de backups remove também os `-wal`/`-shm` que a validação deixa ao lado.
- **Lacuna registrada**: redescobrir mods pelas pastas da staging e "Adotar" uma implantação depois de perder o banco (core/14 §5 e §6, core/04 §11) não existem. A tela diz, ao começar do zero, que jogos e mods precisam ser adicionados de novo e que arquivos implantados antes bloqueiam um novo deploy até serem removidos (`foreign_deployment`, nada é apagado). Fica para uma fase própria. **Atualização (D145)**: os mods voltam pela staging (metadado por mod + redescoberta), gerenciando o jogo de novo com a mesma staging; "Adotar" a implantação continua fora.

## D101 — Desempenho da F14
Status: vigente

Medido com 2.000 mods, 500 mil arquivos e 3.000 plugins (relatório em `docs-ia/07-relatorio-f14.md`). Correções, sem mudar comportamento:

- **Marcas do journal**: cada lote de 256 ações era gravado com uma transação por ação, e cada transação faz `fsync` (`synchronous=FULL`). Agora um lote é uma transação. A recuperação não muda: entre uma escrita no disco e sua marca sempre houve uma janela, e a reconciliação observa o disco (D078).
- **Manifesto**: `Owns`/`Backup` faziam busca linear (o plano ficava quadrático); agora há um índice por tipo e Location, e a ordenação monta cada chave uma vez. O serviço de deploy guarda o último manifesto lido de cada instância e o reusa enquanto o cabeçalho gravado (operação, fingerprint, profile, entradas, data) for o mesmo; todo save o descarta e guarda o manifesto recém-gravado.
- **Inventário de plugins**: depois de cada deploy lia o manifesto inteiro e percorria todos os arquivos de todos os mods; agora pergunta ao repositório só pelos plugins não gerenciados que encontra no disco (`OwnsLink`) e guarda, por Installation (imutável), os arquivos do topo do target de plugins.
- **Stat no Windows**: um handle só (atributos, tamanho, datas e identidade) em vez de um stat mais uma segunda abertura; links simbólicos e arquivos que não abrem seguem o caminho antigo, e um teste compara os dois.
- **Stage do import**: uma criação de pasta por pasta, não por arquivo.

Efeito na escala completa: deploy sem mudanças de 25,4 s para 7,7 s, com 1 mod a mais ou a menos de 26,6/23,6 s para 9,2 s, purge de 117 s para 83 s. O que resta no deploy incremental é o scan completo de core/04 §5, cuja mudança depende de decisão do usuário (relatório §6).

## D102 — Deploy incremental observa só o que toca
Status: vigente (escolhida pelo usuário em 2026-10-09; emenda core/04 §5 e §7)

Com 500 mil arquivos, o scan completo antes de cada deploy custava 5 dos 9 s de um deploy incremental (relatório da F14, §6), contra a meta de 2 s de `00-visao-e-escopo.md`. Agora, sobre um manifesto **verificado**, o deploy observa só:

- Locations desejadas que ainda não são o link registrado (mod, Installation, origem e método iguais);
- links registrados que deixam de ser desejados;
- as divergências que o último scan (foco da janela ou "Verificar implantação") encontrou;
- as Locations com decisão ou "deixar como está" nesta execução;
- as pastas acima das Locations desejadas entre essas.

Os demais links entram no plano como o manifesto os registrou, e arquivos novos (core/09 §3) não são procurados: a contagem do último scan continua no status. INV-EXT-01 continua valendo, porque toda Location em que o deploy vai escrever é observada antes.

Fazem o scan completo: purge, reconciliação de journal, operações de manutenção (mover staging, trocar método), revisão de alterações fora de um deploy (pode capturar arquivos gerados), primeiro deploy (sem manifesto ou depois de purge) e manifesto restaurado de backup e ainda não verificado. Só o scan completo marca o manifesto como verificado.

Consequência aceita: uma divergência numa Location que o deploy não toca (arquivo apagado ou trocado por outra ferramenta) só aparece no próximo scan ao focar a janela ou em "Verificar implantação", e então entra no próximo deploy. `deploy.autoRestoreMissing` também depende de o scan ter visto o arquivo ausente.

Efeito medido: 0,6–0,8 s com 100 mil arquivos (antes 2,3–2,7 s) e 3,1–4,6 s com 500 mil (antes 7,7–9,2 s). Com 500 mil a meta ainda não é atingida: resta trabalho em memória proporcional ao jogo (estado desejado, plano, comparação do manifesto ao gravar, inventário de plugins), registrado no relatório da F14.

Alternativa rejeitada: manter o scan completo e rever a meta. Teste: `TestIncrementalDeployObservesOnlyWhatItTouches`.

## D103 — Instalador por usuário e desinstalação que preserva dados (F15)
Status: vigente (executa D077 item 3 e `plano-de-publicacao.md` etapa 2)

O template NSIS do Wails 2.12 pede administrador e registra o desinstalador no HKLM (PUB-2, confirmado). O projeto tem o próprio `build/windows/installer/project.nsi` (o `wails build -nsis` o mantém e regenera só o `wails_tools.nsh`):

1. **Por usuário, sem UAC**: `RequestExecutionLevel user`, pasta padrão `%LOCALAPPDATA%\Programs\ModOrchestrator`, registro só em `HKCU\...\Uninstall\ModOrchestrator` (com `InstallLocation`, que a reinstalação/atualização reaproveita). Atalho no menu Iniciar sempre; na área de trabalho opcional (marcado). Página final com "Executar". Idiomas en e pt-BR (o NSIS escolhe o do sistema).
2. **Executável em uso**: antes de copiar, o instalador espera o `ModOrchestrator.exe` ser liberado (até ~10 s, para o caso da atualização, em que o app está fechando) e depois pede para fechá-lo (Repetir/Cancelar).
3. **Desinstalação**: remove só o que instalou (executável, `LICENSE.txt`, desinstalador, atalhos, chave do registro) e a pasta se ficar vazia; nunca `RMDir /r` na pasta de instalação, que o usuário pode ter escolhido. A opção "apagar também configurações, banco, backups e logs" (`%APPDATA%\ModOrchestrator` e o cache do WebView2) vem **desmarcada** e pede confirmação explicando que arquivos ainda implantados ficam nos jogos como não gerenciados. Staging, ArchiveStore, BackupStore e pastas de jogo nunca são tocados: o desinstalador não tem como provar posse deles sem o banco (INV-DEP-01/02), e o caminho seguro é o Purge no app.

Alternativa rejeitada: oferecer "apagar staging" no desinstalador (exigiria ler o banco no NSIS, e apagar a staging com arquivos implantados deixaria links órfãos nos jogos). Teste: instalação e desinstalação silenciosas (`/S`) em 2026-10-09, sem UAC, só HKCU, dados mantidos.

## D104 — Atualização do app (F15)
Status: proposta (implementada na F15; aguarda confirmação do usuário)

Detalha a etapa 6 do `plano-de-publicacao.md` e a D077 item 7.

1. **Só com o setting**: `app.updateCheck` desligado = nenhuma chamada de rede (o serviço recusa com `update_check_disabled`). Ligado: verifica ao abrir e a cada 24 h com o app aberto, e em "Verificar agora". O resultado vive em memória (status no Settings); não é estado de domínio.
2. **Fonte**: API de releases do GitHub do repositório (`updates.Repository`, alterável por `-ldflags` num fork). O cliente só fala HTTPS com `api.github.com`, `github.com`, `objects.githubusercontent.com` e `release-assets.githubusercontent.com`, inclusive em redirecionamentos.
3. **O que é oferecido** (domínio `appupdate.Select`, puro): a maior versão semver maior que a instalada, sem rascunhos, sem tag que não é versão, sem release que não tenha `ModOrchestrator-amd64-installer.exe` **e** `SHA256SUMS`; no canal estável, sem prerelease (pela flag ou pela versão). As notas mostradas são as de todas as versões oferecíveis mais novas que a instalada.
4. **Notificação**: uma por versão (`info`, código `app_update_available`, abre Settings › Aplicação); lida ou dispensada, não volta. Sem notificação do Windows.
5. **Instalar** só por ação do usuário, depois de ver as notas: recusado com operação em andamento (`instance_busy`) e, enquanto baixa e até o app fechar, nenhuma operação começa (`instancelock.Freeze`, holder `app_update`). Baixa o `SHA256SUMS` (até 64 KB) e o instalador (até 512 MB, via `.part`) para `<dataDir>/cache/updates/<versão>/`, confere o SHA-256 (`update_checksum_mismatch`, arquivo apagado) e a assinatura Authenticode (WinVerifyTrust com revogação de toda a cadeia): assinatura presente precisa ser válida (`update_signature_invalid`), e **se o app em execução é assinado, o instalador também precisa ser** (`update_signature_missing`), para não aceitar um rebaixamento silencioso de assinado para não assinado. Passando, abre o instalador (por usuário, D103) e fecha o app.
6. **Migrations** depois da atualização seguem core/14 (backup pré-migration), sem nada específico.

Teste: `domain/appupdate` (semver, seleção, SHA256SUMS, confiança), `application/appupdate` (setting desligado não chama a rede, canal, notificação, recusas com o congelamento desfeito), `infrastructure/updates` (TLS local, hosts e redirecionamentos, limite, assinatura válida/ausente/adulterada), `instancelock` (Freeze), UI em `F12.test.tsx` › F15.

## D105 — Pipeline de release e notas de versão (F15)
Status: vigente (executa D077 itens 1, 2, 4 e 5 e o `plano-de-publicacao.md` etapa 3)

1. **`release.yml`** dispara por tag `v*` num commit da `master`: *build* (sem segredos: testes completos, `THIRD_PARTY_NOTICES`, `wails build -nsis -trimpath` com a versão da tag em `-ldflags`), *sign* (ambiente protegido `release-signing` com aprovação manual; só roda com a variável `SIGNPATH_ORGANIZATION_ID`; assina o executável, refaz o instalador em volta dele com `makensis` e assina o instalador), *publish* (zip portátil, `SHA256SUMS`, notas, GitHub Release **em rascunho**). Sem a SignPath configurada, a release sai sem assinatura (D077 item 1). Actions fixadas por SHA. Os slugs da SignPath no workflow são os previstos e devem ser conferidos na inscrição (PUB-1).
2. **Versão única**: tag `vX.Y.Z[-pre]` = `wails.json` › `info.productVersion` (sem a parte de prerelease, que o recurso de versão do Windows não tem) = seção `## [X.Y.Z...]` do `CHANGELOG.md`. `go run ./tools/release version <tag>` falha o build se divergirem.
3. **Notas de versão**: `CHANGELOG.md` no formato Keep a Changelog, em inglês, escrito para o jogador. A seção da versão é o corpo da GitHub Release e, por isso, o "o que há de novo" do atualizador (D104).
4. **Avisos de terceiros** sem ferramenta externa: `tools/release notices` lista os módulos Go linkados no executável do Windows (`go list -deps`) e os pacotes npm de produção do frontend, com o texto da licença, e **falha** com licença fora da lista compatível com GPL-3.0 (D076) ou não reconhecida.
5. **CI**: o job de frontend passa a compilar a `dettmann-ui-v1`, que é a que o `frontend/` consome (D095); antes compilava a `dettmann-ui-vnext`. (Revertido por D107: CI e release voltam a compilar a `dettmann-ui-vnext`.)

## D106 — Itens "(verificar)" do adapter Skyrim SE na F15
Status: proposta (registro de lacuna; aguarda confirmação do usuário sobre a correção)

Confirmados em fonte primária e atualizados no core/12: a pasta de dados da variante Epic é `Skyrim Special Edition EPIC` (libloadorder `src/game_settings.rs`; SKSE64 `skse_version.h`), e o Skyrim SE não usa `loadorder.txt` (libloadorder usa o método "asterisk", só `plugins.txt`). Continua pendente o registro da GOG Galaxy para o pacote Anniversary Edition (`1801825368`), que só uma instalação real responde.

Lacuna encontrada: o adapter escolhe a pasta do `plugins.txt` pela loja em que a instalação foi descoberta. Uma instalação GOG ou Epic achada só pelo registro ou localizada manualmente usa a pasta da Steam, e o jogo não lê a load order escrita. libloadorder decide pelos arquivos da raiz (`Galaxy64.dll` ⇒ GOG, `EOSSDK-Win64-Shipping.dll` ⇒ Epic). Proposta: o adapter detectar a variante pelos mesmos arquivos quando a loja não for `gog` nem `epic`, guardando-a na instância. Não foi feito na F15 porque muda o contrato `LoadOrderFile` (hoje sem acesso a disco) e o dado da instância.

## D107 — App migrado para a dettmann-ui v2 (subprojeto 4 da D095)
Status: vigente (emenda D095 itens 2 e 4 e D105 item 5)

1. **Dependência**: `frontend/package.json` aponta para `file:../dettmann-ui-vnext`. CI e `release.yml` compilam a `dettmann-ui-vnext`; o README também. A `dettmann-ui-v1/` fica só como referência, sem consumidor.
2. **Substituições mecânicas** pelas tabelas de `dettmann-ui-vnext/docs/migration.md`: `variant`/`tone` → `emphasis`/`intent`; tokens neutros (`bg-page` → `bg-canvas`, `ring-ring` → `ring-focus`, `hover:bg-hover` → `hover:bg-state-hover`, `shadow-lg` → `shadow-overlay`); raios pelo tamanho em px da forma `balanced` (`rounded-xl` → `rounded-card`, `rounded-lg`/`rounded-md` → `rounded-control`, `rounded` → `rounded-chip`).
3. **Ícones**: glifo com equivalente no catálogo vira o ícone animado de `dettmann-ui/icons` (inclui `RotateCcw`/`Undo2` → `UndoIcon`, `RefreshCw` → `RefreshIcon`, `UploadCloud` → `UploadIcon`); os demais passam por `<Icon icon={X} />`, nunca lucide solto. O tamanho vai pela prop `size` (o `cn` da v2 não resolve conflito de classes, então `h-4 w-4` não sobrepõe o tamanho padrão); ícone em `startIcon`/`endIcon` usa `size="sm"`. Tipos públicos `LucideIcon` viram `IconComponent`.
4. **Estados contínuos**: `Loader2` com `animate-spin` vira `<Loader decorative>` quando o texto ao lado já anuncia o estado, ou `<Loader label>` quando é o único indicador (passo de operação em execução).
5. **Redução de movimento**: o app só escreve `:root[data-reduce-motion]` (core/13); a regra CSS própria que zerava animações saiu do `app.css`, porque a lib transforma o movimento em fade curto a partir do mesmo atributo.
6. **Testes**: o `Input.Select` deixou de ser `<select>` nativo; os testes escolhem a opção pelo rótulo com `chooseOption` (`frontend/src/test/select.ts`) e verificam o valor exibido com `toHaveTextContent`. `testTimeout` do Vitest subiu para 15 s, porque renderizar o app inteiro passa de 5 s com todos os arquivos em paralelo.
7. **Dev**: `<BudgetInspector />` montado na raiz só no servidor de desenvolvimento (fora de testes e builds); `server.fs.allow` do Vite inclui `../dettmann-ui-vnext` para servir as fontes da lib.
8. **Skills**: o `frontend/` passa a seguir `dettmann-ui-use`, `dettmann-ui-author` e `dettmann-ui-improve` (AGENTS.md, protocolo, consult-ai-docs e ui/03 atualizados); `theme-first`, `composition`, `component-authoring` e `ui-review` da v1 deixam de valer para o app.

Fora de escopo (subprojeto 3 e polimento): redesenho das telas, micro-interações (`playKey`, `Presence`, `useFlip`) e ajuste do orçamento 60/30/10. Medição inicial no Dashboard sem jogo, tema escuro: low 80%, medium 20%, high 0% (meta 60/30/10 ± 8 p.p.).

## D108 — Redesenho dos componentes da dettmann-ui (subprojeto 3 da D095), onda 1
Status: vigente (executa D095 item 3; detalhes em `dettmann-ui-vnext/docs/decisions.md` D-032 a D-034)

Escolhas do usuário em 2026-10-09: redesenho completo de tudo o que o `frontend/` importa da lib, com a personalidade "ferramenta profissional densa" (superfícies calmas, destaque só na ação principal, micro-interações curtas), em quatro ondas que seguem o Design Atômico (controles e entradas; feedback e overlays; dados; estrutura e telas). Spec: `dettmann-ui-vnext/docs/specs/2026-10-09-v2-components-design.md`.

Onda 1 (controles e entradas), efeitos no app:
1. Nenhuma mudança de API nem de código no `frontend/`: `Button`, `Input.*`, `Checkbox`, `Radio`, `Switch`, `SegmentedControl`, `StatusToggle`, `Badge`, `Tag`, `Indicator` e `Kbd` mudam só de aparência (sem sombra, borda de 1 px, anel de foco único, desabilitado por tokens, opções de menu com 32 px).
2. Duas variações novas ficam disponíveis para as telas: `Input.Select multiple` e `Input.Password`. Campo sensível escrito à mão (`type="password"` com botão de revelar) passa a ser proibido; a `dettmann-ui-improve` aponta.
3. Pendências que ficam para a onda 4: logo da barra de título como máscara pintada com `bg-fg` (o PNG é branco e some no tema claro) e o orçamento 60/30/10 tela a tela (medição inicial na D107).

A pasta `IconesAnimados/` (vídeos de referência dos ícones, fora do git) foi apagada a pedido do usuário. O plano de crescimento do catálogo da lib é entrega separada, depois da onda 4.

## D109 — Redesenho dos componentes da dettmann-ui, onda 2 (feedback e overlays)
Status: vigente (continua D108; detalhes em `dettmann-ui-vnext/docs/decisions.md` D-035)

Efeitos no app, sem mudança de código no `frontend/`:
1. `Alert` e toasts mostram o ícone do intent (status nunca só por cor); os papéis ARIA não mudaram.
2. `Modal` e `Drawer` animam entrada e saída; durante a saída o painel fica inerte, e foco, rolagem e Esc são liberados na hora. `Menu`, `ContextMenu` e `Popover` animam só a entrada.
3. Itens de menu e opções da paleta de comandos são linhas compactas de 32 px com 2 px de intervalo (aprovado pelo usuário em 2026-10-10). Na paleta, as setas pulam itens desabilitados.
4. `Skeleton` e `Progress` usam a camada de movimento da lib (respeitam `ui.reduceMotion`, core/13).

## D110 — Redesenho dos componentes da dettmann-ui, onda 3 (dados)
Status: vigente (continua D109; detalhes em `dettmann-ui-vnext/docs/decisions.md` D-036)

Efeitos no app:
1. Todas as tabelas (`DataTable`) passam a ter linhas de 32 px na densidade confortável e 28 px na compacta (eram 40 e 30). A preferência de densidade do usuário continua valendo; o app não fixa `rowHeight`.
2. Linha selecionada: fundo `selected` com barra da marca. Linha arrastada: fundo rebaixado, sem transparência. Reordenar, ordenar e filtrar deslizam as linhas visíveis (respeita `ui.reduceMotion`).
3. Abas mostram o indicador da marca na aba ativa; o painel da aba e o conteúdo do acordeão entram animados.
4. Única mudança de código no `frontend/`: a lista de dashlets do Dashboard passa os rótulos de arrastar e mover pelo i18n (`dashboard.customizeDrag`, `dashboard.customizeMoveUp`, `dashboard.customizeMoveDown`), que antes vinham em inglês fixo da lib.

## D111 — Redesenho dos componentes da dettmann-ui, onda 4 (estrutura e telas)
Status: vigente; continua D110; detalhes em `dettmann-ui-vnext/docs/decisions.md` D-037

1. **Logo da barra de título**: o PNG é branco e sumia no tema claro. A `TitleBar` passa a pintá-lo como máscara CSS sobre `bg-fg` (`role="img"`, nome do app pelo i18n), então ele segue o tema sem arquivo novo.
2. **Camadas do shell**: a barra de título declara `data-layer="medium"` (já usava `bg-structure`, mas não contava no orçamento). A `Sidebar` passa à variante padrão (`bg-structure`); o item atual é `bg-selected` com a barra da marca.
3. **`Card`**: `variant` deu lugar a `emphasis`/`interactive`; a lista de perfis usa `interactive`. Cartões não têm sombra.
4. **Orçamento 60/30/10** (meta: low 60% e medium 30%, ± 8 p.p.; high ≤ 12%). Medição em 2026-10-13, app real em `wails dev`, janela de 1280 x 800, sem jogo gerenciado, amostragem de 8 px:

   | Tela | low | medium | high |
   |---|---|---|---|
   | Dashboard | 75,3% | 24,7% | 0% |
   | Jogos | 73,9% | 25,2% | 0,9% |
   | Extensões | 72,7% | 27,3% | 0% |
   | Configurações | 72,2% | 27,8% | 0% |

   Antes (D107): Dashboard low 80%, medium 20%. O medium entrou na faixa (22% a 38%) nas quatro telas. O low ficou de 4 a 7 pontos acima do teto de 68%, porque nessas telas quase não há elemento `high`. **Aceito pelo usuário em 2026-10-13** para o estado sem jogo: forçar o número em telas vazias pintaria cartões só para a conta fechar. As telas com jogo (Mods, Plugins, Conflitos, Perfis, Diagnóstico) não foram medidas, porque o ambiente de desenvolvimento não tem jogo gerenciado; a medição passa a ser critério de aceite de cada tela do redesign (pendência P1 em `dettmann-ui-vnext/docs/plans/2026-10-13-catalog-growth.md`, que também lista as demais pendências da lib e o plano de crescimento do catálogo).

## D112 — Escopo de jogo: capability e contrato 1:1, e checagem em toda fase
Status: vigente (detalha D011; análise em `docs-ia/09-proposta-multi-jogo-e-extensoes.md`, fase A)

O Mod Orchestrator começa pelo Skyrim, mas não é só dele, e extensões de terceiros são objetivo futuro (D012). Para que "o processo X não existe neste jogo" seja sempre o caso normal:

1. **Regra de processo.** Todo resumo de fase declara o escopo de jogo da mudança: vale para todo jogo, ou depende de qual capability e o que acontece sem ela. A regra entrou em `prompts/00-protocolo.md` e no `AGENTS.md`.
2. **Capability e interface opcional são a mesma coisa.** Cada interface opcional do adapter tem uma capability e vice-versa; `games.NewRegistry` recusa o adapter em que as duas discordam. `InstallerProvider`, `HealthCheckProvider`, `CategoryProvider` e `ProcessDeclarer` ganharam as capabilities `adapter_installers`, `health_checks`, `default_categories` e `running_detection`. `installer` continua significando "o jogo instala mods pelo pipeline", que todo jogo tem.
3. **Matriz de suporte derivada.** `Registry.Support()` lista, por jogo, cada capability como `available` ou `not_applicable`, a partir dos adapters registrados; nada é mantido à mão.
4. **Fato de jogo inclui nome de arquivo e extensão.** O teste de literais passou a vigiar também `plugins.txt`, `loadorder.txt`, `.esp`, `.esm`, `.esl` e `.bsa`. O backup do arquivo de load order passa a usar o nome do arquivo que o adapter declara (para o Skyrim os nomes não mudam).
5. **Caminho "sem a capability" testado.** Uma instância do adapter `generic` importa, habilita e implanta; todo comando de plugins responde `plugins_unsupported`.

Motivo: só três das dez capabilities eram lidas pelo código e as interfaces opcionais eram resolvidas só por type assertion, então um adapter podia declarar o que não implementa sem ninguém notar; e a lista de literais vigiava nomes de jogo, mas não o vocabulário de formato, por onde `plugins.txt` entrou no núcleo.

Alternativas rejeitadas: generalizar já o modelo de plugin para "unidades ordenáveis" (com um jogo só a abstração seria um chute; fica para quando houver um segundo adapter com ordem de carga); ligar `installer` a `InstallerProvider` (o `generic` declara `installer` sem ter instaladores próprios, e o sentido atual é o do pipeline).

Consequências: capability nova exige entrada no catálogo e, se servida por código, uma linha em `games.contracts`. O port `GameAdapter` não mudou. Não foi feito nesta decisão: tirar da UI as decisões por capability (espera o subprojeto de componentes) e expor a matriz no bridge (entra com o registro de jogos).

## D113 — Registro de jogos como dado: descoberta, nível de suporte e classe dos recursos
Status: vigente (emenda D057; detalha D011 e D112; desenho em `propostas/2026-10-13-registro-de-jogos.md`, fase R1)

A lista de jogos com suporte passa a ser dado da `GameDefinition`, e não métodos de cada adapter:

1. **Descoberta é dado.** `game.Definition.Discovery` traz os ids do jogo por loja (`Stores`), as dicas de registro (`Registry`), os arquivos marcadores (`Markers`) e o executável de versão (`VersionFile`). O serviço de jogos casa as instalações do `StoreScanner` com `Discovery.Matches(loja, id)` e confirma a pasta com `ValidateRoot` do adapter. Saíram do port `GameAdapter`: `Markers`, `RegistryHints`, `VersionFile` e `Detect`. `ports.RegistryHint` virou alias de `game.RegistryHint`.
2. **Nível de suporte.** `Definition.Support`: `full` (adapter dedicado), `declared` (jogo descrito só por dados, ainda sem nenhum) ou `custom` (definido pelo usuário; hoje o `generic`). Sem valor declarado, `SupportLevel()` deduz `custom` de `CustomTargets` e `full` do resto.
3. **Classe dos recursos.** `game.Describe(capability)` classifica cada capability como `base` (sempre ligada: `filesystem_mod_target`, `multiple_mod_types`, `installer`, `external_change_strategy`, `adapter_installers`, `health_checks`, `default_categories`, `running_detection`) ou `optional` (`plugins`, `load_order`, `launch`, `save_games`, `game_settings`, `tools`), com dependências (`load_order` exige `plugins`). Capability fora do catálogo é `optional`. `Definition.Validate` recusa definição que declara um recurso sem o que ele exige.
4. **Consulta única.** `Registry.Support()` (D112) ganhou `Support`, `Stores` e, por recurso, `Class`, `Requires` e `Default`. O bridge expõe em `GamesSupport()`.

Decisões do usuário (2026-10-13) que valem para as fases seguintes: ligar e desligar recurso é **por instância**; desligar **não apaga nem reverte** arquivos do jogo, o app só para de gerenciar; jogo personalizado poderá ser exportado e importado; o Skyrim é o primeiro jogo publicado nesse formato.

Motivo: os ids de loja e os marcadores estavam em constantes e métodos privados de cada adapter, então a lista de suportados só sabia nome e id, e um jogo simples exigiria escrever código de detecção. Com a descoberta em dado, a mesma definição serve ao adapter dedicado, ao jogo declarado e ao personalizado.

Alternativas rejeitadas: manter `Detect` como interface opcional (nenhum adapter precisa, e a D112 pede uma capability por interface; volta com capability própria se um jogo exigir detecção por código); guardar classe e dependências em cada definição (são propriedades do recurso, não do jogo; por jogo só varia o que é oferecido).

Consequências: adapter novo declara `Discovery` em vez de implementar quatro métodos. Nesta fase nada muda para o usuário: nenhum recurso pode ser desligado ainda (R2), a UI não consome `GamesSupport()` (espera o subprojeto de componentes) e o `generic` continua com um único id de jogo (R3 e R4).

## D114 — Segundo adapter dedicado: Valheim
Status: vigente (emenda D031, que previa só `generic` e `skyrimse`; detalhes em core/16)

O Valheim entra como segundo jogo com adapter próprio (`internal/adapters/valheim`), escolhido pelo usuário em 2026-10-13 por estar instalado e em uso com o r2modman. Declara launch, instaladores próprios, health check e detecção de execução; **não** declara `plugins` nem `load_order`.

1. Targets `bepinex` (`<root>/BepInEx`, padrão) e `root`; ModType `bepinex` para o pacote do framework.
2. Três instaladores do adapter: pacote do framework, pacote de mod com `manifest.json` e DLL solta.
3. `framework_missing` é reutilizado com `framework = BepInEx`, exigindo proxy e preloader na raiz.
4. O Mod Orchestrator continua implantando dentro da pasta do jogo.

Motivo: provar com um caso real que o núcleo aceita um jogo sem os processos do Skyrim. O adapter não exigiu nenhuma mudança em `internal/core`, no bridge nem nas telas: só o registro no bootstrap e rótulos no catálogo i18n.

O que ele **não** prova: a ordem de carga genérica (item 1 de `docs-ia/09`), porque o BepInEx não tem ordem editável. Essa generalização continua adiada até existir um jogo que a exija.

Alternativa rejeitada: entrar só como jogo declarado (D113). Um pacote de mod precisa de roteamento por pasta e o framework ausente precisa de check, e os dois são código.

Consequências: rótulos do adapter foram para o catálogo i18n do app, o que repete o acoplamento 8 de `docs-ia/09` (texto de jogo no catálogo do app) até o adapter poder trazer os próprios textos. Dependências do `manifest.json` ficaram fora (core/16 §8).

## D115 — Recursos ligáveis por instância
Status: vigente (detalha D011, D112 e D113; desenho em `propostas/2026-10-13-registro-de-jogos.md`, fase R2)

Um recurso de jogo tem três camadas: **oferecido** (a definição do jogo declara a capability), **ligado** (escolha do usuário, por instância) e **efetivo** (calculado).

1. **O core só vê o efetivo.** `ports.InstanceDefinition(adapter, instância)` é o único lugar que pede ao adapter a definição de uma instância; ele devolve `Definition.Effective(instância.Features)`. Um recurso desligado se comporta exatamente como um que o jogo não tem: a tela some da navegação, os comandos respondem o código de capability ausente, o passo do deploy é pulado. Teste de arquitetura (`TestInstanceDefinitionIsAskedThroughThePort`) impede chamada direta ao adapter fora de `ports` e de `games/features.go`.
2. **Cálculo.** Efetivo = oferecido, e (se `optional`) não desligado pelo usuário, e tudo o que ele exige efetivo. Recurso `base` ignora a escolha. A escolha nunca acrescenta o que o jogo não oferece. Sem escolha, o padrão é ligado.
3. **Onde fica.** `game.Instance.Features` (capability → ligado), na tabela `instance_features` (migração 0009), gravada junto com a instância e apagada com ela. O efetivo não é persistido.
4. **Operação.** `games.SetFeature(instância, recurso, ligado)` sob o lock da instância. Recusas com código: `feature_unavailable` (o jogo não oferece), `feature_locked` (recurso `base`), `feature_requires` (ligar algo cujo requisito não está efetivo). Desligar um requisito não muda a escolha dos dependentes: eles ficam ligados e não efetivos, e `Features()` diz por quem estão bloqueados.
5. **Desligar não toca no jogo** (decisão do usuário em 2026-10-13). Nada é apagado nem revertido; o app só para de gerenciar aquela parte. Com `load_order` desligado, o deploy deixa o arquivo de load order como está. Religar não escreve nada por si; o que estiver no disco aparece pela triagem de alteração externa que já existe (D040).
6. **Bridge.** `InstanceFeatures(id)` e `SetInstanceFeature(id, recurso, ligado)`. `Workspace()` e os detalhes da instância já refletem o efetivo, porque usam a mesma definição.

Motivo: capability respondia só "o jogo suporta?". Faltava o lado do usuário, para quem prefere cuidar da load order por outra ferramenta ou não quer o Play, sem que isso exigisse um `if` novo em cada serviço.

Alternativas rejeitadas: guardar a escolha no catálogo de settings (chaves estáticas, não comportam recurso de extensão); escolha por jogo em vez de por instância (duas cópias do mesmo jogo podem querer coisas diferentes, e as settings já são por instância); desligar em cascata gravando a escolha dos dependentes (perderia a escolha do usuário ao religar o requisito); reverter o que foi aplicado ao desligar (escreveria no jogo sem plano de deploy).

Consequências: `launch` desligado tira o Play, mas a detecção de jogo em execução continua, porque `running_detection` é `base`. O jogo `generic` não oferece nenhum recurso `optional`, então nada muda para ele. A UI ainda não tem a tela de recursos (espera o subprojeto de componentes); as telas que hoje decidem por `capabilities` passam a receber as efetivas.

## D116 — Manifesto de jogo: formato de entrada só de dados
Status: vigente (detalha D113; desenho em `propostas/2026-10-13-registro-de-jogos.md`, fase R3, parte de domínio)

`game.Manifest` é a forma serializada (JSON, `schema: 1`) de um jogo descrito só por dados: identificação, descoberta (lojas, registro, marcadores, executável de versão, processos), layout (targets relativos à raiz, mod types com detecção, dicas de root, saídas de ferramenta, padrões de "não gerenciar") e opções de lançamento. Jogos declarados e jogos criados pelo usuário usam o mesmo formato.

1. `ParseManifest` recusa o arquivo inteiro se o `schema` não é o desta versão (`ErrManifestSchema`), se há campo desconhecido, conteúdo depois do documento, mais de 256 KiB ou qualquer caminho que não seja relativo e interno à pasta do jogo.
2. O manifesto não declara capabilities, nível de suporte nem origem: `Manifest.Definition(support)` deriva as capabilities do conteúdo (`launch` se há opção de lançamento, `running_detection` se há processos, `multiple_mod_types` com mais de um tipo, `external_change_strategy` com saídas ou padrões) e quem carrega diz o nível. Um arquivo não consegue alegar um processo que exige código.
3. `Marshal` só exporta manifesto válido, e o que o app exporta volta a importar.

Motivo: é a base para o jogo personalizado com identidade própria e para exportar/importar (decisão do usuário em 2026-10-13). Alternativa rejeitada: aceitar `features`/`support` no arquivo (o arquivo vem de fora; o que o app oferece tem que sair do que ele consegue verificar).

Consequências: nesta decisão só existe o formato, com testes e fuzz. Ainda não feito (R3 restante e R4): o adapter `generic` interpretar manifestos, o repositório de entradas do usuário, o registro composto, a migração das instâncias `generic` e o bridge de exportar/importar. Dois pontos em aberto para essa etapa: a checagem capability↔interface da D112 precisa aceitar um adapter cujas definições chegam em runtime, e `games.Registry` deixa de ser imutável.

## D117 — Jogo personalizado como entrada do registro
Status: vigente (emenda D031 e D057; detalha D113 e D116; desenho em `propostas/2026-10-13-registro-de-jogos.md`, resto da R3 e R4)

Todo jogo que o usuário adiciona passa a ser uma **entrada**: um manifesto (D116) com id próprio no espaço `user.`, guardado no banco e servido pelo adapter `generic`.

1. **Adapter `generic` versão 2.** Além do jogo modelo `generic` (o ponto de partida do assistente "adicionar qualquer jogo"), ele serve uma definição por manifesto: targets, mod types, dicas de root, marcadores em `ValidateRoot`, opções de lançamento (`LaunchSupport`) e processos (`ProcessDeclarer`). É o único adapter que implementa `ports.EntryHost`.
2. **Registro composto.** `games.Registry` tem adapters fixos e definições que mudam: `SetEntries` troca as entradas do usuário e relê as definições. Entrada fora do espaço `user.` é recusada, e adapter que não hospeda entradas não pode definir jogo nesse espaço, então uma entrada nunca toma o id de um jogo embutido, hoje ou no futuro. Mudança recusada mantém o que estava sendo servido.
3. **Exceção na D112.** O adapter que hospeda entradas pode implementar uma interface opcional sem que nenhum jogo a declare ainda, porque os jogos dele chegam com o app rodando. A outra direção continua valendo: capability declarada sem interface não registra.
4. **Fonte de verdade.** Tabela `game_entries` (migração 0010), um manifesto por jogo, o mesmo documento que é exportado. Entrada que esta versão não consegue ler (outro `schema`, linha danificada) fica guardada, é registrada no log e as instâncias dela aparecem como indisponíveis; nunca é apagada.
5. **Assistente.** `Manage` com o jogo modelo cria a entrada a partir do nome, dos targets e do executável informados (o executável vira opção de lançamento, processo e arquivo de versão) e a instância nasce pertencendo a essa entrada. Se o resto falhar, a entrada é desfeita. O id sai do nome (`user.valheim`, `user.valheim-2`). A UI não mudou: continua enviando `gameId: "generic"`.
6. **Migração.** Na inicialização, toda instância que ainda pertence ao jogo modelo ganha uma entrada montada dos seus targets (relativos à raiz) e do executável; só mudam `game` e `adapter_version` (1 → 2). Instância com target fora da raiz não é migrada e continua funcionando pelo caminho antigo.
7. **Exportar, importar, excluir.** `ExportEntry` devolve o manifesto; `ImportEntry` lê o documento inteiro ou recusa (`entry_invalid`, `entry_schema`), move o id para `user.` e recusa id já existente (`entry_exists`): importar nunca substitui um jogo. `DeleteEntry` recusa entrada com instância (`entry_in_use`). Parar de gerenciar não apaga a entrada: o jogo continua na lista de suportados e pode ser gerenciado de novo.
8. **Target criável (D118).** O manifesto aceita `creatable` em cada target, menos na raiz. As entradas criadas pelo assistente e pela migração não marcam nenhum, para não mudar o comportamento de quem já usa.

Motivo: antes todo jogo fora da lista era o mesmo `generic`, definido instância por instância, sem identidade, sem detecção e sem como sair do PC. Com id próprio, o jogo personalizado é detectado por loja e marcador quando o manifesto os traz, tem recursos ligáveis (D115) e poderá receber extensões.

Alternativas rejeitadas: migrar por SQL (montar o manifesto exige a mesma validação do domínio); apagar a entrada junto com a última instância (perderia a descrição que o usuário fez; a lista tem "esconder" e a entrada pode ser excluída); substituir ao importar um id existente (mudaria os targets de um jogo com mods implantados).

Consequências: `Instance.Executable` continua existindo e preenchido, mas o lançamento e a detecção de execução das entradas vêm do manifesto. Falta a UI (R5): tela para exportar, importar e excluir, reconhecimento de pasta e modelos prontos. O bridge já expõe `GameEntries`, `ExportGameEntry`, `ImportGameEntry` e `DeleteGameEntry`.

## D118 — Target criável e metadados do mod vindos do instalador
Status: vigente (detalha D011/D057; origem em `docs-ia/09` §11, itens 14 e 15)

O teste de ponta a ponta do Valheim numa instalação real mostrou duas suposições do núcleo que só valiam para o Skyrim.

1. **Target criável.** `game.Definition.CreatableTargets` lista os targets cuja pasta o app pode criar. No deploy, um target ausente continua `target_unavailable`, exceto se estiver na lista, estiver abaixo da raiz do jogo, a raiz existir e nada ocupar o caminho. A pasta é criada no começo do `apply`; a criação é gravada antes (`app_state`, `deployment.createdTargets`). Quando o manifesto deixa de usar o target, a pasta é removida **só se foi criada pelo app e está vazia** (INV-DEP-09); com qualquer arquivo dentro, fica.
2. **Metadados do instalador.** `installer.Plan.Metadata` leva nome, versão, autor, descrição e site lidos pelo instalador. Precedência: atributos do usuário, depois o instalador, depois `fomod/info.xml`, depois o nome do archive.

Motivo: no Skyrim `Data/` sempre existe, e o nome do mod vem do FOMOD ou do padrão de nome do Nexus. No Valheim a pasta `BepInEx` só existe depois do primeiro mod, e o nome está no `manifest.json` do pacote.

Alternativas rejeitadas: criar qualquer target ausente (perderia a proteção contra pasta ou unidade que sumiu); o adapter usar a raiz como target único com caminhos prefixados (esconde o limite, e o jogo declarado ou personalizado cairia no mesmo caso); registrar a pasta criada como entrada do manifesto (a `Location` não representa a raiz de um target).

Consequências: jogo declarado ou personalizado pode usar o mesmo campo quando o manifesto de jogo (D116) o expuser; isso não foi feito aqui. O adapter do Valheim declara `bepinex` como criável e devolve os metadados do `manifest.json`.

## D119 — O design v1 é o layout base das telas
Status: vigente (substitui D042; aprovada pelo usuário em 2026-10-14 junto com `propostas/2026-10-14-plano-implementacao-redesign.md`)

A distribuição de telas e elementos passa a seguir o design v1 aprovado (canvas "Redesign das telas do Mod Orchestrator", fechamento em `propostas/redesign-telas-v1-fechamento.md`), transcrito tela a tela em `ui/telas/`. O Vortex deixa de ser a referência de layout e continua sendo a referência de fluxo e comportamento (D001); o MO2 continua a de isolamento e prioridade (D002).

1. Onde o design e o Vortex divergem, vale o design. A tabela "Divergências aprovadas" de `ui/00` §6 deixa de existir: diferença de layout em relação ao Vortex não precisa mais de justificativa.
2. Tela sem artboard aprovado mantém o layout atual dentro da casca nova até ganhar um. Tela nova sem artboard não é implementada.
3. O que o design mostra e o backend não entrega não vira dado inventado: ou entra como fase com contrato, ou sai da tela (anti-pattern 18).
4. O canvas é a referência visual; o contrato de cada tela é o seu documento em `ui/telas/`, reescrito a partir do artboard antes de a tela ser implementada. Os mockups não entram no repositório.
5. Continuam valendo sem mudança: a UI não decide (D021), status nunca só por cor (D043), tudo por teclado, i18n (D044), dettmann-ui obrigatória (D016).

Motivo: a D042 mandava reproduzir o Vortex elemento por elemento. O redesign aprovado em 2026-10-13 e 2026-10-14 organiza o app em biblioteca e espaço do jogo, troca o Inspector lateral do mod por modal com abas e a toolbar de ícone e rótulo por ações só com ícone, o que a D042 classificaria como bug de UI.

Alternativas rejeitadas: manter a D042 e listar o redesign inteiro como divergências (a tabela deixaria de ser exceção e viraria a regra); tratar o canvas como contrato direto (ele traz dados de exemplo e não diz o que vem do backend; o documento da tela diz).

Consequências: `ui/00` reescrito; `ui/01` passa a apontar o artboard e a fase do plano de cada tela; cada `ui/telas/*.md` é reescrito na fase que implementa a tela e, até lá, descreve a tela atual. O anti-pattern 34 muda de sentido (reinventar tela sem artboard aprovado). A paridade com o Vortex (`docs-ia/08`) passa a ser de recurso, não de layout. A organização das abas de Settings (core/13) fica como está até o artboard de Configurações ser aprovado.

## D120 — Dois níveis: app e espaço do jogo
Status: vigente (emenda D023, D045 e D054; detalha D119; contrato em `ui/00` §2)

O app passa a ter dois níveis de navegação, no lugar de uma sidebar única com seção global e seção do jogo.

1. **Nível do app**: Início, Biblioteca (com Adicionar jogo), Extensões e Configurações. Vale para todos os jogos e usa a cor da marca.
2. **Espaço do jogo**: ao entrar num jogo, a janela inteira olha só para ele. Barra superior com "‹ Biblioteca", seletor de jogo, seletor de perfil, sino com contagem, ajuda e controles da janela. Menu lateral recolhível, em grupos (Visão geral; Conteúdo; Setup; Saúde).
3. **O backend monta o menu.** Grupos, itens, selos e nível de atenção de cada item vêm da consulta do workspace, pelas capabilities efetivas da instância (D115). A UI não testa capability (D112).
4. **"Jogar" e implantação no rodapé do menu.** O botão "Jogar" sai da barra de título; o cartão "Implantando" fica preso acima dele. As regras de pré-lançamento da D045 e do core/11 §6 não mudam.
5. **O sino concentra o que pede atenção.** O status de deploy, o contador de problemas e o indicador de operações da topbar deixam de existir como elementos próprios: viram notificação com contagem, ou estado do cartão de implantação. Diagnóstico, notificação, histórico e log continuam sendo conceitos separados (core/10); muda só onde aparecem.
6. **Cor de destaque por jogo** no espaço do jogo, com padrão do app. O contrato de tema é decisão própria, junto com o componente.
7. **Paleta de comandos** (`Ctrl+K`) ganha um botão só com ícone na barra superior, com a dica do atalho, já que a busca saiu do menu lateral (resposta do usuário em 2026-10-14).

Motivo: com vários jogos gerenciados, a seção do jogo dentro de uma sidebar global misturava o que é do app com o que é do jogo ativo, e a barra de título acumulava lançador, status e contadores.

Alternativas rejeitadas: manter o lançador na barra de título (o desenho aprovado usa a barra para contexto e navegação, e o "Jogar" precisa ficar junto do estado de implantação que o condiciona); manter contadores separados de problemas e operações ao lado do sino (três indicadores para a mesma pergunta, "algo pede minha atenção?").

Consequências: o `frontend/` muda na fase RD4 do plano; até lá roda o shell anterior. A consulta do workspace passa a devolver grupos, selos e atenção. O drawer de operações continua existindo, aberto a partir do cartão de implantação e das notificações. Sem jogo gerenciado só existe o nível do app. O ponto de entrada dos Ajustes da instância é fixado quando a Visão geral for transcrita (RD13).

## D121 — Detalhe do mod em modal com abas
Status: vigente (emenda `ui/03` §4; detalha D119)

O detalhe de um mod deixa de ser o Inspector lateral e passa a ser um modal grande com cinco abas: Resumo, Conflitos, Arquivos, Histórico e Instalação. Esc fecha e devolve o foco à linha.

Motivo: o conteúdo do mod (conflitos por arquivo, árvore de arquivos, escolhas do instalador) não cabe num painel estreito sem rolagem em dois eixos, e é o desenho aprovado.

O que não muda: o detalhe continua abrindo sem trocar de página, e a lista continua atrás. Telas cujo artboard mostra painel lateral (Plugins, Ordem de carga, Diagnóstico) seguem com painel. A regra "modal só para decisão curta, destrutiva ou assistente" de `ui/03` §4 ganha esta exceção, e só esta.

Alternativa rejeitada: página de detalhe com rota própria (perderia a posição e a seleção na lista).

Consequências: o Inspector de Mods é removido na fase RD9 do plano; `ui/telas/mods.md` §6 é reescrito nela.

## D122 — Cor de destaque por jogo e paleta de categorias no tema
Status: vigente (detalha D043 e D120 item 6; executa a RD2 do plano do redesign; detalhes da lib em `dettmann-ui-vnext/docs/decisions.md` D-038)

1. **Cor do jogo.** O espaço do jogo usa o tema `orchestrator` com outra semente de marca: `withSeed(PRESETS.orchestrator, corDoJogo, id)` passado a um `ThemeScope` que envolve o espaço do jogo. Forma, densidade, movimento e neutros continuam os do app; o motor recalcula os papéis e garante as mesmas metas de contraste para qualquer semente (teste de propriedade). Semente ausente ou inválida volta ao tema do app. O nível do app continua com a cor da marca.
2. **De onde vem a cor.** É dado da definição do jogo, servido pelo backend com padrão do app para quem não declara (jogo personalizado). O campo entra na RD4, junto com a casca; a UI nunca escolhe a cor por id de jogo.
3. **Paleta de categorias.** Categorias e tags usam 16 cores sem significado de status, geradas pelo motor (`CATEGORY_COLORS`), com contraste de texto garantido e vizinhas diferentes também em luminosidade. O usuário escolhe pelo id da cor; o app nunca grava hex. Status continua só nos intents (`success`, `warning`, `danger`, `info`).

Motivo: o design v1 troca o teal do app pela cor do jogo dentro do espaço do jogo e pinta categorias e tags com uma paleta própria. Sem isso no motor, o app teria de escrever cores à mão, o que a lib proíbe (D016, D043).

Alternativas rejeitadas: um preset por jogo (não serve a jogo personalizado nem a cor declarada por dados); reaproveitar os intents de status para categorias (uma categoria "vermelha" seria lida como erro); hex livre escolhido pelo usuário (sem garantia de contraste nos dois modos).

Consequências: o id da cor de categoria é o que o backend guarda (RD5). A largura padrão da `Sidebar` passou a 232 px aberta e 60 px recolhida, os valores do design; o app atual herda isso até a RD4.

## D123 — Categorias com cor e ícone, tags definidas e visão da lista de mods
Status: vigente (detalha D026 e core/02 §9–10; executa a RD5 do plano do redesign)

1. **Categoria** continua árvore por instância (o desenho aprovado cria subcategorias com "Dentro de") e ganha `Color` e `Icon`, ambos opcionais. A cor é um id da paleta categórica (`mod.Colors`, os mesmos 16 ids que o tema gera com contraste garantido, D122); o ícone é um id de ícone (slug minúsculo) que a UI mapeia para um glifo. O backend nunca guarda valor de cor.
2. **Tag** é definida por instância (`tags`, migração 0011: nome, cor da paleta, ordem) e um mod carrega quantos nomes quiser (`Attributes.Tags`, como já era). Nome sem definição continua valendo como tag sem cor. Renomear muda o nome em todos os mods na mesma transação; renomear para um nome que já existe (definido ou só usado em mods) é recusado (`tag_exists`), porque seria mesclar; excluir tira o nome de todos os mods. Comparação sem diferenciar maiúsculas.
3. **Linha da lista** traz `CategoryColor`, `CategoryIcon` e `Tags`. **Arquivos por extensão** (`ExtensionCounts`) agrupa a instalação atual por extensão, sem dado do adapter, então vale para qualquer jogo.
4. **Visão da lista** é a setting de instância `mods.view` (`list`, `nested`, `tabs`; padrão `list`). As visões Aninhada e Abas agrupam só a exibição pela categoria; a prioridade (ModOrder) não muda por causa delas e só se arrasta na Lista (resposta do usuário em 2026-10-14).
5. **Escolhas do FOMOD legíveis**: o detalhe da instalação devolve as escolhas gravadas (passo, grupo, nomes das opções), que já eram guardadas em forma legível.
6. **Resumo do mod** (`overview.Mod`): adversários em conflito, contra quantos vence e para quantos perde, e requisitos presentes sobre o total, cada número do seu dono; parte que não pôde ser lida não vem.

Motivo: o design v1 pinta categorias e tags, separa as duas (uma categoria, várias tags) e mostra arquivos por tipo e números do mod.

Alternativas rejeitadas: lista plana de categorias (o artboard aprovado tem subcategoria); tag só como texto livre no mod, sem definição (não teria onde guardar a cor nem como renomear em lote); arquivos por tipo de conteúdo do adapter (o jogo genérico não classifica nada).

Consequências: a UI dessas partes chega nas RD8 e RD9. O id da cor é o contrato com o tema; trocar a paleta exige migrar os ids guardados.

## D124 — Fila de instalação: "instalar todos" e organizar ao instalar
Status: vigente (detalha D038 e D065; executa a RD5 do plano do redesign)

1. **Instalar todos** (`InstallAll`) põe na fila a instalação dos mods importados escolhidos com a marca de não perguntar: a instalação que chegaria a uma pergunta (assistente FOMOD, escolha de pasta raiz) é cancelada naquele ponto, o mod continua importado e a fila segue para o próximo. Nada é instalado com escolha presumida. Os que ficaram aparecem para o usuário escolher depois.
2. **Organizar ao instalar**: a resposta do assistente pode trazer categoria e tags. Na conclusão da instalação, a categoria só é aplicada se ainda existir; as tags são normalizadas e somadas às que o mod já tem, sem repetir.

Motivo: o desenho da fila tem "Instalar" por item e "Instalar todos" que pula os que pedem escolhas sem travar os outros, e o resumo do FOMOD tem categoria e tags.

Alternativa rejeitada: instalar os FOMOD com as opções padrão no "instalar todos" (decidiria pelo usuário, contra D036 e o espírito de D030).

## D125 — Dependências entre pacotes declaradas pelo instalador
Status: vigente (detalha D118 e core/03 §2; fecha core/16 §8; executa a RD6 do plano do redesign)

1. **Contrato**: `installer.Plan` ganha `Package` (`mod.Package`): a identidade de pacote que o mod declara e os pacotes que ele exige (`PackageRef`: nome e versão mínima). Fica separado de `Plan.Requirements`, que continua sendo de arquivos (FOMOD) e pede confirmação no resumo. Só o instalador do adapter preenche; o `generic` e o FOMOD não declaram pacote.
2. **Guardado no mod**: `Mod.Package` vem da instalação mais recente (reinstalar atualiza; instalador que não declara limpa).
3. **Casamento**: na transação da instalação, cada pacote exigido vira `DependencyRule` `requires` com `source=metadata` para o mod presente que declara aquele nome (sem diferenciar maiúsculas; havendo vários, o mais antigo, por causa das variantes), com nota "Nome versão". Instalar um pacote também liga os mods que já o exigiam. Regra que já existe entre os dois, de qualquer origem ou estado, não é repetida: reinstalar não duplica e regra desativada pelo usuário continua desativada.
4. **Requisito sem dono**: pacote exigido que nenhum mod da biblioteca declara aparece como `mod_requirement_missing` (catálogo atual, `target` = nome do pacote, `version` quando houver), só enquanto o mod que exige está ativo, com a ação de importar. Some quando um mod declara o pacote. O resumo do mod (B13) conta esses pacotes no total de requisitos.
5. **Versão** é guardada e mostrada, não comparada: os formatos de versão variam por site e uma comparação errada geraria problema falso.
6. **Valheim**: o pacote é o `name` do `manifest.json` e as dependências são `Autor-Nome-versão` (o nome fica entre o primeiro e o último hífen). O pacote do framework (`BepInExPack_Valheim`) não vira requisito: a presença do framework já é o diagnóstico do próprio adapter.
7. **Autor pelo nome do archive**: fica fora. O instalador não recebe o nome do archive, e o manifesto não traz o autor; trazer exigiria contrato novo no `installer.Context`.

Motivo: o design v1 mostra requisitos do mod e o Valheim publica dependências só por pacote, nunca por arquivo.

Alternativas rejeitadas: misturar pacote em `Plan.Requirements` (arquivo pede confirmação, pacote não; dois significados no mesmo campo); casar pelo autor também (o manifesto do pacote exigido não diz o autor); criar regra para pacote ainda ausente (a regra precisa de um mod alvo).

Consequências: outro jogo com pacotes declara do mesmo jeito no seu adapter. A tela de Regras e o detalhe do mod mostram essas regras na RD9 e na RD11.

## D126 — Sugestão de vencedor e par travado em conflitos
Status: vigente (detalha D004, D027 e D028; executa a RD7 do plano do redesign; resposta à pergunta 1 do plano)

1. **Sugestão** (`rules.Set.Suggest`): o vencedor que os fatos indicam para um par, calculado a cada leitura e nunca gravado. Os fatos, nesta ordem: (a) regra de dependência ativa entre os dois (`requires` ou `recommends`), em que vence o mod que depende, porque patch e complemento existem para sobrescrever a base; (b) regra de ordem ativa de `source=metadata` entre os dois, em que vence o vencedor dela. Regra do usuário é decisão, não fato. Sem fato, ou com fatos que discordam, não há sugestão (e a tela não mostra o selo). Cada sugestão traz o motivo (`requires` ou `metadata_rule`) e a regra que é o fato.
2. **Aceitar** é o mesmo comando das decisões por par (`ApplyPairDecisions`): cria a regra de ordem do par, que é recusada como qualquer outra se fecharia um ciclo. Nada é criado sozinho.
3. **Decidir todos os arquivos de um par (B3)** já é a regra de ordem do par: ela decide toda Location que os dois disputam. Override por arquivo continua valendo mais e o par fica "misto". Não há comando novo.
4. **Par travado (B4)**: sem regra direta ativa, mas com regras ativas que põem um abaixo do outro através de outros mods (`rules.Set.Chain`, caminho mais curto, desempate por id), o par traz `Lock` com o vencedor e as regras do caminho, cada uma com os dois mods. Escolher o outro vencedor ali fecharia ciclo; a tela manda alterar pelas regras do caminho.
5. As visões por par e por adversário (`PairView`, `OpponentView`) trazem `Suggestion` e `Lock`; a ponte expõe `suggestion` e `lock`.

Motivo: o design v1 tem o selo "Sugerido", o "Para todos os N" e a linha travada com "altere por lá".

Alternativas rejeitadas: sugerir pelo mais novo, pelo maior ou por tipo de arquivo (palpite, não fato; levaria a regra errada aceita no automático); gravar a sugestão (ficaria velha quando as regras mudassem); comando em lote novo para o par (a regra do par já cobre).

Consequências: vale para todo jogo e não lê plugin. No `generic` sem regras de dependência não há sugestão. Conforme a RD6 traz dependências de pacote e o Skyrim traz masters como regra de metadados, as sugestões aparecem sem nada novo.

## D127 — A prancha aprovada é a especificação de cada tela
Status: vigente (2026-10-14, pedido do Leonardo: "o redesign SIGA o DESIGN")

1. Cada tela do redesign reproduz a prancha aprovada: organização, espaços, colunas, opções de filtro, textos e ações. Controle que a prancha não tem sai da tela; o que ela tem e a lib não faz entra na lib (D-040 da dettmann-ui).
2. Antes do commit, um screenshot do app em 1440×900 é comparado com o artboard renderizado; diferença só com motivo aprovado pelo Leonardo.
3. Consequências já aplicadas na tela de Mods: a lista não tem mais coluna de prioridade, alça de arrastar nem separadores (a ordem continua sendo a prioridade do perfil, mudada por "Mover para…" e pelo detalhe do mod); o seletor de colunas e os selects na barra saíram (categoria e conflito ficam no botão "Filtros"); a coluna Conflitos diz "Vence N", "Perde N", "A resolver · N", "Instalando", "Na fila" (o backend passou a contar adversários vencidos e perdidos por mod). Na casca: perfil como botão "Perfil ▾", sem busca na barra (Ctrl+K continua), card de implantação só quando há algo a mostrar, e Jogar como um botão só (as outras opções no menu de contexto).

Motivo: a primeira versão das telas adaptou as pranchas aos componentes existentes e ficou muito diferente do aprovado (auditoria em `propostas/2026-10-14-auditoria-fidelidade.md`).

Consequência: a numeração reservada no plano do redesign avança um número (importação Vortex/MO2 passa a D128, assistente do jogo a D129).

## D130 — Ajustes da instância no menu do jogo e a Visão geral sem Jogar
Status: vigente (2026-10-14; executa a RD13 pela regra da D127)

1. "Ajustes da instância" é uma tela do espaço do jogo para todo jogo (`instance_settings`), no grupo Saúde depois de Diagnóstico, como nas pranchas (`JogoAjustesRecursos`; as demais pranchas do jogo põem Diagnóstico no grupo Saúde). Abas Geral, Recursos, Pastas e Implantação; Recursos segue a prancha: opcionais com chave e estado (ligado, desligado, bloqueado, não se aplica), "Sempre ligados" sem chave, "Como fica o menu deste jogo" e o aviso de recurso bloqueado com "Ligar X". Tudo vem de `InstanceFeatures`.
2. A Visão geral não tem botão Jogar nem faixa de implantação: Jogar é o botão do menu lateral e a implantação pendente aparece como linha de "Precisa de atenção" e no card lateral.

Motivo: as pranchas aprovadas.

Consequências: `games.WorkspaceItems` sempre inclui `instance_settings`; o teste da navegação fixa o grupo Saúde com os dois itens.

## D128 — Importar de Vortex e MO2
Status: vigente (2026-10-20; executa a RD15; respostas 3 e 4 do plano do redesign; emenda D047, detalha D035 e D048)

1. **O que se lê**: do MO2, a instância (`ModOrganizer.ini` com os caminhos e `%BASE_DIR%`, `mods/<mod>/` com `meta.ini`, `categories.dat`, `overwrite/`, e por perfil `modlist.txt` e `lockedorder.txt`); do Vortex, o banco de estado (`state.v2`, LevelDB com chaves `a###b###c` e valores JSON), a staging de cada jogo (`installPath`, padrão `{USERDATA}\{game}\mods`) e a pasta de cada perfil. O estudo confirmou que o estado do Vortex é legível com segurança: o banco é copiado para uma pasta temporária e aberto só para leitura, então o Vortex pode estar aberto. Nada é escrito nas pastas do outro gerenciador (teste compara a árvore antes e depois).
2. **Onde fica cada fato**: formato e nome de arquivo de gerenciador ficam no leitor, em `internal/infrastructure/managers/{mo2,vortex}` (port `ManagerReader`); o domínio (`migration`) só tem dados com as chaves do gerenciador. A lista de plugins que cada perfil guarda é a do jogo: o nome vem de `LoadOrderSupport.LoadOrderFile` e quem lê é `Parse`, do adapter (D112). Achar a fonte é por caminho (o `gamePath` do MO2, o caminho descoberto pelo Vortex), sem tabela de ids de jogo; "Apontar a pasta" abre uma instância do MO2 ou uma pasta de dados do Vortex.
3. **O que entra**: mods (copiados, nunca movidos: mover segue em aberto), ordem e separadores, regras (depois de, requer, recomenda, conflita), perfis com o estado de cada mod, plugins e ordem de carga só com `plugins` e `load_order` em vigor, categorias como opção desligada. O Vortex não tem ordem de mods: os mods partem da ordem de instalação e as regras ordenam. O `overwrite` do MO2 vira o mod "Overwrite", por último e ligado. Mods sem pasta, sem arquivo ou com caminho inseguro ficam de fora e aparecem na prévia; o `meta.ini` não é copiado. O tipo do mod é o que os arquivos indicam (`DetectModType`).
4. **Perfis**: cada perfil escolhido (padrão: o ativo do outro gerenciador) vai para o perfil de mesmo nome se a biblioteca estava vazia, ou para um perfil novo; os demais perfis recebem os mods desligados no fim. Biblioteca vazia passa a usar o perfil que o outro gerenciador usava; biblioteca em uso mantém o perfil ativo.
5. **Operação**: `import_manager` com os passos `read`, `copy` e `commit`, com a trava da instância. Os mods entram na biblioteca como `installing` (origem `import`, ref = a operação) antes de qualquer cópia; cada mod é copiado para `<id>.installing` e renomeado; tudo o mais vai numa transação no fim. Interrompida, a recuperação do início tira esses mods da biblioteca e a da biblioteca apaga as pastas, antes de qualquer comando.
6. **Regra que fecharia ciclo** entra assim mesmo (via `Restore`): o ciclo vira o diagnóstico bloqueante de sempre (D028), não um erro da importação.
7. **Implantação estrangeira** (D035): importar não libera o deploy; a instrução de limpar no outro gerenciador continua.

Motivo: B1 do redesign e as respostas do Leonardo (copiar por padrão; perfis sim; categorias como opção desligada).

Alternativas rejeitadas: abrir o LevelDB do Vortex no lugar (a trava do Vortex aberto impede, e abrir para escrita arriscaria o banco dele); escrever um leitor próprio de LevelDB (o `goleveldb`, em Go puro, é a dependência nova e menor); ler o `loadorder.txt` dos gerenciadores (a lista do jogo já traz ordem e estado, e o nome de arquivo do jogo fica no adapter); importar pela fila de instalação com instaladores (o conteúdo já está instalado; o FOMOD perguntaria de novo).

Consequências: vale para todo jogo; no `generic` e no Valheim a prévia nem lista plugins e ordem de carga (teste com MO2 importado num jogo `generic`). As telas são a RD16 (DLG-31): a regra importada tem a origem `import` ("marcadas como importadas" na prancha), que se apaga como a do usuário (`Source.Removable`).

## D129 — Assistente de jogo: reconhecimento de pasta, modelos e pasta criável
Status: vigente (2026-10-15; executa a RD14b; respostas 7 e 8 do plano do redesign)

1. **Reconhecimento (R5d)**: "Apontar a pasta" em Adicionar jogo lê só a pasta escolhida (não desce) e diz que jogo ela tem: um jogo do registro cujo arquivo marcador está ali e cujo adapter aceita a pasta (`games.Recognize`, ponte `RecognizeGameFolder`). Sem jogo conhecido, a faixa oferece "Criar jogo personalizado".
2. **Modelos (resposta 8)**: "Pasta Mods" e "BepInEx", dados do adapter `generic` (`ports.TemplateProvider`); o formulário de jogo personalizado preenche os destinos com eles. Nome próprio de carregador vem do adapter (D112).
3. **Pasta criável (resposta 7)**: destino que ainda não existe é aviso (`target_missing`), não problema. "O app pode criar as pastas que faltam" fica desligado por padrão; ligado, o Gerenciar cria as pastas e as desfaz se o resto falhar.

Motivo: prancha `JogosSuportados` e as respostas do Leonardo ao plano.

Consequências: vale para todo jogo; o reconhecimento usa os marcadores que a busca no PC já usa.


## D131 — Catálogo do adapter: códigos de diagnóstico e textos vêm com o adapter
Status: vigente (2026-10-20; fase C1 de `docs-ia/09-proposta-multi-jogo-e-extensoes.md`, itens 4 e 8; detalha D044 e D112)

1. **Códigos**: o catálogo de diagnósticos deixa de ser fechado. `diagnostic.CoreCodes()` é o catálogo do core (core/10 §1.1); `diagnostic.Catalog` é o catálogo em vigor, o do core mais os códigos que os adapters declaram (`CodeSpec`: código snake_case, módulo, aviso antes do launch). O registro monta o catálogo (`games.Registry.Diagnostics()`) e recusa código repetido, do core ou de outro adapter, e módulo desconhecido. Os módulos continuam fechados: são lugares do app, e o código do adapter entra num deles. Código emitido por um check do adapter fora do catálogo faz a avaliação falhar, em vez de aparecer sem módulo e sem texto. Código genérico que serve a vários jogos (`framework_missing`) continua no core e é emitido sem declaração.
2. **Textos**: rótulos de id que o adapter define (`mods.content.<flag>`, `mods.installer.<id>`, `launch.option.<id>`) e textos dos seus diagnósticos (`diag.code|impact|evidence|action.*`) vêm do adapter, por idioma, em `ports.CatalogProvider`. O registro recusa catálogo sem `en`, idioma com chaves diferentes das do `en`, texto vazio, chave fora desses prefixos, código declarado sem `diag.code.<código>` e chave que dois adapters declaram com textos diferentes. O bridge serve `AdapterMessages(idioma)`, com `en` onde falta tradução; a UI lê esses textos **depois** do catálogo do app, então nenhum adapter troca texto do app. O catálogo do app perde os 23 rótulos do Skyrim e do BepInEx e fica só com os ids do core (`launch.option.game`, `mods.installer.basic`, `mods.installer.imported`); um teste do frontend impede que voltem. `plugins.emptyDescription` deixa de citar extensões do Skyrim.
3. **Sem capability**: `CatalogProvider` descreve o adapter e não liga processo do jogo, por isso é a exceção à relação 1:1 da D112. Sem ele (o `generic`) nada muda: códigos do core, textos do app e, para id desconhecido, o id.

Motivo: com dois jogos, cada rótulo ou diagnóstico novo de um adapter exigia editar o núcleo e os dois catálogos de i18n (itens 4 e 8 do diagnóstico multi-jogo); o SDK (fase C3) precisa que o adapter se descreva sozinho.

Alternativas rejeitadas: textos por jogo com chave prefixada pelo id do jogo (cada chamada da UI precisaria saber o jogo, e a mesma flag em dois jogos é o caso raro; a colisão com texto diferente já é recusada no registro); capability `catalog` (não habilita processo e obrigaria todo adapter a declarar algo que é só descrição); adapter sobrescrever texto do app (um adapter de terceiro poderia mudar qualquer tela); mover `bsa_without_plugin` e os `plugin_*` para o adapter (são emitidos pelo módulo de plugins do core, por `PluginArchives`; a separação desse módulo é a fase C2).

Consequências: vale para todo jogo; testado com um check próprio declarado e não declarado (`internal/integration/adapter_catalog_test.go`) e com o adapter sem catálogo. Nomes de mod type continuam texto único do adapter (`ModType.Name`), sem idioma. Pendência para C2/C3: os códigos do módulo de plugins e os settings `plugins.*` ainda moram no núcleo.

## D132 — A UI só renderiza o que o backend lista: áreas, seções e a tela de cada recurso
Status: vigente, emendada por D135 (2026-10-20; fase A2 de `docs-ia/09-proposta-multi-jogo-e-extensoes.md`, item 9; detalha D115 e D120)

1. **Workspace**: `Workspace()` passa a trazer, da instância ativa, `sections` (`games.Sections`, as mesmas do jogo gerenciado) e `areas` (`games.DiagnosticAreas`: as áreas de Diagnóstico › Problemas na ordem dos chips; Plugins só com a capability `plugins` em vigor; a área do app não é filtro de instância). Problemas e Perfis leem daí, em vez de procurar `plugins` nos itens do menu. Nova seção `profiles.plugins` (número de plugins no cartão do perfil).
2. **Tela de cada recurso**: o recurso diz a tela que traz ao menu do jogo (`games.FeatureScreen`, campo `screen` em `InstanceFeatures` e em `GamesSupport`); o menu (`WorkspaceItems`) sai da mesma tabela, então menu e recursos não divergem. Ajustes da instância monta a prévia do menu e Adicionar jogo resume o jogo pelos recursos disponíveis que trazem tela; as listas fixas da UI (`FEATURE_SCREEN`, `SUMMARY_FEATURES`) saem.
3. **Ordem**: `InstanceFeatures` vem na ordem da prancha `JogoAjustesRecursos` (plugins, ordem de carga, saves, settings do jogo, ferramentas, launch; os demais em seguida); `OPTIONAL_ORDER` sai da UI.
4. **Vigia**: um teste do frontend recusa tela que teste `capabilities.includes/some/indexOf` ou procure `plugins`/`load_order` nos itens do menu.

Motivo: core/11 §5 e ui/00 §1.4 proíbem a UI de decidir por capability; com as telas do redesign fechadas (RD18), as quatro decisões que restavam (chips de Problemas, número de plugins do perfil, prévia do menu e resumo do jogo) passam para o backend.

Alternativas rejeitadas: uma seção por área (`diagnostics.area.*`; mistura lista ordenada com marca de presença); áreas no `ProblemsDTO` (o serviço de diagnósticos não conhece a definição efetiva da instância, e o filtro é navegação, não diagnóstico); listar no backend as chaves de settings de cada aba (o catálogo já tem `Tab`; as chaves `plugins.*` são o item 10, à parte).

Consequências: vale para todo jogo; no `generic` e no Valheim `sections` vem vazio, `areas` sem Plugins e nenhum recurso traz tela (teste no bridge com jogo personalizado e em `games/nav_test.go`). Recurso novo com tela (saves, V1.x) entra na tabela de `FeatureScreen` e aparece no menu, na prévia e no resumo sem mudar a UI além do ícone e do rótulo da tela. Continuam na UI, como apresentação: as abas fixas de Configurações (passaram ao backend na D135) e de Ajustes da instância, as telas "sempre presentes" da prévia e o mapa id → ícone/rótulo do menu.

## D133 — Módulo de plugins entra no núcleo por pontos de contribuição; o perfil guarda seções opacas
Status: vigente (2026-10-20; fase C2 de `docs-ia/09-proposta-multi-jogo-e-extensoes.md`, itens 2 e 3; detalha D049 e D112)

1. **Seção do perfil**: `profile.Data` perde `PluginsEnabled`, `LoadOrder` e `IndexLocks` e ganha `Sections` (`profile.Section`: versão e documento JSON). O núcleo copia (Clone), fotografa (Snapshot), restaura e transfere as seções sem ler; quem lê e valida é o módulo dono. A opção de transferência `Plugins` vira `Sections` (a ponte mantém o campo `plugins` da UI). A comparação do domínio fica só com mods.
2. **Estado de plugins no módulo**: `plugin.ProfileState` (estados, load order, index locks, comparação) é a seção `plugins` (`plugin.SectionID`, versão 1), lida por `plugin.StateOf` e gravada por `Store`. O registro do que o app gravou no arquivo de load order sai de `deployment` para `domain/loadorder` (`loadorder.Applied`, estado aplicado). Os checks de plugin saem de `domain/health` para `domain/pluginhealth`.
3. **Pontos de contribuição**: cada serviço do núcleo declara uma interface pequena e recebe uma lista, sem conhecer o módulo pelo nome: `deployment.PostDeploy` (passo `post`), `diagnostics.Module` (checks, ações de comando, lugares de navegação, parte do pacote de suporte), `overview.FigureSource` (número da Visão geral, identificado pela seção que o mostra), `profiles.Section` (número do cartão e diferenças entre perfis) e `library.FileStates` (arquivo presente e inativo nas condições FOMOD). O bootstrap passa o serviço de plugins em cada lista; a ponte converte, pelo id da seção, para os campos que a UI já usa.
4. **Dados gravados antes**: o repositório de perfis lê o formato antigo (campos de plugin no topo do JSON do perfil e do snapshot) e o converte na seção; o próximo save grava a forma nova. Sem migração de esquema.
5. **Vigia**: `TestCoreDoesNotImportThePluginsModule` recusa que um pacote de `core/domain` ou `core/application` importe o módulo de plugins, exceto o próprio módulo, `ports` (contratos de adapter até o SDK, fase C3) e `imports` (traz as partes de plugins do Vortex e do MO2).

Motivo: o núcleo desejado e o aplicado importavam `domain/plugin`, e deploy, diagnósticos e Visão geral conheciam o serviço de plugins pelo nome (itens 2 e 3 do diagnóstico multi-jogo). Um segundo recurso opcional (saves, settings do jogo) repetiria a fiação; com os pontos de contribuição ele entra com uma linha no bootstrap.

Alternativas rejeitadas: manter os campos de plugin no perfil com tipo `string` (some o import, fica o conceito); um registro genérico de "módulos" com uma interface única para todos os pontos (cada serviço passaria a depender de métodos que não usa); migração SQL que reescreve o JSON dos perfis (a leitura do formato antigo cobre perfis e snapshots sem código em migração); mover já os códigos `plugin_*` e `bsa_without_plugin` para o módulo (o módulo de plugins é do app e seus textos ficam no catálogo do app; um módulo externo entra pelo `CodeSpec` da D131 na fase C3).

Consequências: vale para todo jogo; no `generic` o módulo não acrescenta número na Visão geral, parte no pacote de suporte, contagem no perfil nem seção no perfil (`internal/integration/generic_test.go`). O pacote de suporte troca `loadOrder` por `parts.loadOrder`. O evento `profile.transferred` passa a levar `sections` em vez de `plugins`. Pendências: `ports.PluginSupport`/`LoadOrderSupport` e o tipo `plugin` nos contratos de adapter (fase C3, SDK); settings `plugins.*` no catálogo do núcleo (item 10); ordem de carga genérica (fase B).

## D134 — SDK do adapter fora de `internal/`, por aliases; os adapters embutidos só importam o SDK
Status: vigente (2026-10-20; fase C3 de `docs-ia/09-proposta-multi-jogo-e-extensoes.md`, item 7; a parte de contrato da R6 do registro de jogos)

1. **Pacote**: `modorchestrator/sdk` traz `APIVersion` ("1.0") e as interfaces do adapter (`GameAdapter` e as opcionais, uma por capability, D112), mais os tipos que elas usam do sistema de arquivos e das lojas. Os subpacotes `sdk/game`, `sdk/mod`, `sdk/plugin`, `sdk/installer`, `sdk/diagnostic`, `sdk/event`, `sdk/health`, `sdk/ordering` e `sdk/relpath` dão o vocabulário, com o mesmo nome de pacote do core, para que um adapter troque só o caminho do import.
2. **Aliases**: cada nome é alias do tipo, da constante ou do erro do core, e cada função é um repasse. O SDK não tem comportamento e não há cópia a manter. Um módulo de fora usa os tipos pelo alias, embora não possa importar `internal/`.
3. **Superfície sob demanda**: o SDK expõe o que os três adapters usam (e o que os seus contratos citam). Um nome entra quando um adapter precisa dele, com o número menor de `APIVersion`; nome que sai, ou tipo mudado de forma que o adapter percebe (método de interface, campo que ele preenche), sobe o maior.
4. **Vigia**: `TestAdaptersImportOnlyTheSDK` recusa arquivo não de teste em `internal/adapters` que importe algo do módulo além do SDK e de outros adapters, e arquivo do SDK que importe algo além do domínio e de `ports`. Os testes dos adapters podem usar o core (fakes, `memfs`, construtores que o SDK não expõe).

Motivo: a palavra `internal` do Go impedia qualquer módulo externo de implementar um adapter (item 7 do diagnóstico multi-jogo); os adapters embutidos passam a ser os primeiros clientes do contrato público, então o que um terceiro vê é o que eles usam.

Alternativas rejeitadas: mover os tipos do domínio para fora de `internal/` (o núcleo inteiro passaria a ser API pública e cada refatoração viraria quebra de contrato); copiar os tipos para o SDK com conversão na fronteira (duas fontes de verdade e conversões em todo contrato); um só pacote `sdk` com todos os nomes (colisões como `plugin.Entry` e `installer.Entry` pediriam prefixos e a troca não seria só de import); expor de uma vez todo o domínio que os contratos alcançam (superfície grande sem cliente).

Consequências: vale para todo jogo; nenhum comportamento muda. Um tipo do core citado pelo SDK passa a ser contrato: mudar seus campos pede olhar `APIVersion`. A parte de R6 que é contrato (um adapter de fora implementa as mesmas interfaces) está feita; o contrato de contribuição de uma extensão para um jogo que não é dela (`provider` por recurso, prova com um módulo embutido) e o host (manifesto, carregador, isolamento) ficam para a fase D (V2, D012).


## D135 — Catálogo de settings extensível por módulo; as abas de Configurações vêm do backend
Status: vigente (2026-10-20; item 10 de `docs-ia/09-proposta-multi-jogo-e-extensoes.md`; emenda D132 no que ficava na UI, detalha D042, D119 e D133)

1. **Catálogo**: `settings.Catalog` deixa de ser uma lista fixa. O núcleo tem as abas e as chaves de core/13 (`settings.Core()`); um módulo opcional contribui abas e chaves (`settings.Contribution`: `TabDef{ID, After, Section}` e `Def`). `settings.NewCatalog` monta o catálogo em vigor e recusa aba ou chave repetida (inclusive do núcleo), aba depois de outra desconhecida, chave em aba desconhecida, a aba reservada Download e default que não valida. O serviço de settings começa com o catálogo do núcleo e recebe as contribuições do bootstrap (`Service.Contribute`); chave de módulo não contribuído é desconhecida (`setting_unknown`).
2. **Módulo de plugins**: a aba Plugins (depois de Mods) e as chaves `plugins.autoSort`, `plugins.enableOnModEnable`, `plugins.enableExternallyAdded` e `plugins.lootProvider` (V1.x) saem do núcleo para `plugins.SettingsContribution()`. Os textos continuam no catálogo do app, como os códigos do módulo (D133): o módulo é do app. Valores gravados não mudam (mesma chave, mesmo escopo).
3. **Abas**: `SettingsTabs()` lista as abas em ordem, com a seção de instância que liga cada aba de módulo (`settings.plugins` para Plugins). Aba sem nenhuma chave disponível na release some; aba sem chaves próprias (Workarounds) fica. Configurações renderiza essa lista: aba ligada a seção aparece enquanto algum jogo gerenciado a oferece e o seletor de jogo lista só esses jogos. As abas do núcleo mantêm o layout da prancha; aba de módulo que a UI não conhece mostra o seletor de jogo e as chaves dela (filtradas pelo `tab` de cada setting), com rótulo `settings.tab.<id>` e título `settings.<id>.title` quando existem, senão o id.

Motivo: as chaves `plugins.*` valiam para toda instância e moravam no núcleo (item 10), e a lista de abas era uma união fixa na UI com uma regra própria para Plugins (D132 a deixou como apresentação). Um segundo módulo (saves, V1.x) entra com a sua aba sem tocar o núcleo nem a página.

Alternativas rejeitadas: a UI listar as abas a partir do `tab` dos settings recebidos (Workarounds não tem setting e a posição de uma aba nova ficaria implícita); cada aba de módulo trazer a lista de chaves no DTO (o setting já traz `tab`); o catálogo global mutável com registro em `init()` (a ordem de inicialização decidiria o catálogo e os testes veriam o estado de outros testes); contribuição pelo adapter (essas chaves são do módulo de plugins do app, não de um jogo; contribuição de adapter fica para quando um adapter precisar, pela mesma estrutura).

Consequências: vale para todo jogo; com só o `generic` e o Valheim gerenciados, a aba Plugins não aparece (teste do frontend). Teste de domínio para as recusas e a posição da aba, de serviço para chave antes e depois da contribuição, do bridge para a lista de abas com o bootstrap real e do frontend para aba de módulo desconhecida. `settings.NewValue` e `Lookup` passam a ser métodos do catálogo.

## D136 — O executável de um jogo personalizado fica só na entrada
Status: vigente (2026-10-20; fecha o ponto aberto 3 de `propostas/2026-10-13-registro-de-jogos.md`; detalha D117)

1. **Uma fonte**: o executável informado no assistente vai para o manifesto da entrada (lançamento, processo e arquivo de versão), como já ia. A instância deixa de guardar uma cópia em `Instance.Executable`.
2. **Dados antigos**: a migração 0012 limpa `executable` das instâncias de entradas do usuário (`user.*`); `MigrateLegacyCustom` limpa o campo ao mover uma instância do jogo modelo para a sua entrada.
3. **Legado**: o campo e a coluna ficam só para a instância do jogo modelo anterior à D117 que não pôde ser migrada (target fora da raiz, ponto aberto 4). O lançamento e a detecção de processo dela continuam lendo o campo; quando esse caminho sair, o campo sai junto.
4. **Bridge**: `ManagedGameDTO.executable` sai; a UI nunca o lia. `SetupDTO.executable` continua (é o campo do assistente).

Motivo: com a D117 o lançamento vem do manifesto, e a cópia na instância podia divergir dele (entrada editada ou importada) sem que nada a lesse a não ser o caminho antigo.

Alternativas rejeitadas: apagar a coluna agora (tiraria o lançamento da instância legada não migrada, sem confirmação de que ela não existe); manter a cópia sincronizada (duas fontes de verdade para o mesmo dado).

Consequências: vale para todo jogo; nos jogos com adapter próprio nada muda (eles declaram o executável). Testes: migração 0012 (`entry_executable_test.go`), assistente sem cópia na instância e entrada com lançamento (`flow_test.go`), migração de instância antiga (`entries_test.go`).

## D137 — Percurso só com teclado: a armadilha de foco da lib vale para todo diálogo
Status: vigente (2026-10-20; percurso de ponta a ponta só com teclado pedido no fechamento do redesign; aplica D-041 da dettmann-ui)

1. **Achado**: em todo diálogo montado já aberto (detalhes do mod, Adicionar jogo e os demais que a tela renderiza só quando abertos) o Tab saía do diálogo para a página de trás. A causa estava em `useFocusTrap` da dettmann-ui (D-041); a correção vale para Modal, Drawer e Lightbox sem mudança no app.
2. **Conferido e mantido**: navegação lateral, barra de título, menus (Enter abre e as setas andam), paleta (Ctrl+K, setas, Enter leva o foco ao conteúdo), notificações, selects, abas com setas, tabelas (setas, Home/End, Espaço liga e desliga, Enter abre detalhes, Shift+F10 abre o menu da linha, Esc devolve o foco à tabela), Alt+setas na Ordem de carga e na ordem de prioridade de Mods, Ctrl+Z na ordem de Mods, anel de foco visível em todo controle. Quando um botão fica desabilitado depois da própria ação, o próximo Tab segue dali (ponto de partida do navegador), sem perder o lugar.
3. **Fica como está**: o controle dentro de uma célula (chave de ativo, link para o mod de origem) segue na ordem do Tab. Com a virtualização só as linhas visíveis entram, e tirar esses controles da ordem pediria um atalho para cada ação de célula.

Consequências: vale para todo jogo. Testes na lib (`focus-trap.test.tsx`, `menu-keyboard-open.test.tsx`).

## D138 — Backups com `VACUUM INTO`
Status: vigente (2026-10-20; item 2 de `propostas/2026-10-20-trabalho-futuro-f14.md`, escolhido pelo usuário; emenda core/14 §3)

1. **Criar backup** (automático, pré-migration, manual, última inicialização) usa `VACUUM INTO` num arquivo `.partial` ao lado do destino, renomeado no fim. A cópia é consistente (uma transação de leitura) e não leva as páginas livres que o journal de um deploy grande deixa no banco.
2. **Copiar um arquivo existente** (restauração pendente, recuperação) continua com a API de backup online: o arquivo de origem já é um backup compacto e pode ter WAL.
3. Validação e restauração não mudam: o backup é um banco SQLite comum, com o mesmo schema.

Medido na escala completa (2.000 mods, 492 mil entradas implantadas): banco de 535 MB, backup de 289 MB em 0,9 s; com a API de backup o arquivo era copiado inteiro. No pior caso da retenção (24 + 7 automáticos, 3 pré-migration, 1 de inicialização) os backups vão de ~18,7 GB para ~10 GB.

Motivo: metade do arquivo eram páginas livres, e a API de backup copia página por página. `VACUUM INTO` resolve sem mexer no banco em uso.

Alternativas rejeitadas por enquanto: `auto_vacuum` incremental no banco (exige um `VACUUM` completo único na migração e fragmenta o arquivo; fica para se o tamanho do próprio banco virar problema); compactar os backups (mais tempo de CPU a cada hora e restauração em duas etapas).

Consequências: vale para todo jogo. O backup segura a única conexão do app enquanto roda, como a API fazia (0,9 s na escala completa). Testes: `backup_compact_test.go` (backup menor que o banco com páginas livres, pasta com `#` e `%`; `MO_BENCH_BACKUP` compara API e `VACUUM INTO`), `backupBytes`/`backupMs` em `TestScaleBenchmark`.

## D139 — Deploy incremental planeja só o que tocou
Status: vigente (2026-10-20; item 1 de `propostas/2026-10-20-trabalho-futuro-f14.md`, escolhido pelo usuário; completa D101 e D102)

1. **Plano**: sobre um manifesto verificado (o caso de D102), `deployplan.Input.Only` leva as Locations que o deploy tocou e o plano só olha essas, as dos targets bloqueados e as de método alternativo esperando decisão. As outras são o link que o manifesto registra: entram em `Summary.Keep`, sem ação e sem observação. O scan deixa de montar uma observação presumida para cada link não tocado.
2. **Pastas**: num plano incremental só podem deixar de ser necessárias as pastas acima de um link que o plano remove; cada uma é conferida contra todos os arquivos desejados. Ligar `deploy.cleanEmptyDirs` passa a valer para pastas antigas no próximo scan completo.
3. **Ação "manter"**: o plano deixa de listar uma ação `keep` por Location que não muda; elas só contam no resumo (o journal já as descartava).
4. **Custos sem mudar comportamento**: o inventário de plugins achava o estado de cada plugin com uma busca linear (quadrático com 3.000 plugins); `relpath.Path` guarda a chave em minúsculas; manifesto, conflitos e plano comparam e indexam Locations sem montar texto (`deployment.EntryID`, `game.CompareKeyParts`), na mesma ordem das chaves; o manifesto é gravado comparando as duas listas ordenadas, sem mapa; ler um manifesto não copia as entradas (`Manifest.View`).

Medido na escala completa (2.000 mods, 492 mil entradas, mesma máquina e rodada): deploy desabilitando ou habilitando 1 mod de 5,6 s para 1,8 s; deploy sem mudanças de 3,3 s para 1,0 s. A meta de `00-visao-e-escopo.md` (incremental < 2 s) passa a valer com 500 mil arquivos, com pouca folga: o que resta é o cálculo de vencedores de todos os mods (~0,8 s), o manifesto novo (~0,5 s) e o inventário de plugins (~0,3 s).

Motivo: o scan já observava só o que mudava (D102), mas plano, manifesto e inventário ainda percorriam o jogo inteiro, montando texto por Location.

Alternativas rejeitadas: plano incremental completo, com estado desejado guardado entre deploys e recálculo só dos mods mudados (mais risco no invariante central, e a meta foi atingida sem ele); aceitar a meta só até 100 mil arquivos.

Consequências: vale para todo jogo. Teste de equivalência (`TestIncrementalPlanMatchesFullPlan`: 200 cenários aleatórios, plano restrito igual ao completo em ações e resumo, inclusive limpeza de pastas e alvos com prefixo comum), comparação de ordem (`TestLocKeyCompareMatchesJoinedKey`) e o perfil de CPU do benchmark (`MO_BENCH_PROFILE`).

## D140 — Lacunas do levantamento MO2/Vortex entram antes da v1
Status: vigente (2026-10-20; decisão do usuário sobre `propostas/2026-10-20-levantamento-mo2-vortex.md`; emenda D041 e o escopo V1.x de `00-visao-e-escopo.md`)

1. Todos os itens do levantamento (A1–A4, M1–M11, B1–B13) entram antes da v1, seguindo as sugestões do documento, na ordem alta → média → baixa, uma thread por fase (`propostas/2026-10-20-plano-lacunas-mo2-vortex.md`, fases LV1–LV15).
2. O LOOT pode ser usado: o provedor de dados do LOOT (D041) sai da V1.x e entra antes da v1, ainda como provedor de restrições e mensagens, sem trocar o motor nativo (D029). A forma de obter a masterlist e a licença são revisadas no início da fase LV2.
3. Saem da V1.x para antes da v1: saves por perfil (`save_games`), configurações do jogo por perfil (`game_settings`), ferramentas externas (`tools`), conflitos dentro de BSA/BA2.

Motivo: o levantamento do código do MO2 e do Vortex mostrou regras e checagens que afetam o uso real (instância única, BSA de outro jogo, ordem sem LOOT, saves compartilhados entre perfis) e o usuário quer a v1 sem essas lacunas.

Alternativas rejeitadas: manter LOOT, saves e INIs em V1.x com um aviso na v1.

Consequências: cada fase registra as próprias decisões e atualiza `08-paridade-vortex-v1.md` quando um item DEFER virar presente. Telas que não existem no design v1 (Saves, Ferramentas, árvore final, BAIN) precisam de prancha aprovada antes de implementar (D127).

## D141 — Instância única do app e BSA de outro jogo
Status: vigente (2026-10-20; fase LV1 de `propostas/2026-10-20-plano-lacunas-mo2-vortex.md`, itens A1 e A2 do levantamento; detalha D131 e D133)

1. **Instância única (núcleo)**: um processo do app por usuário. A janela normal e a de recuperação usam `options.SingleInstanceLock` do Wails com um id fixo entre versões (`bridge.InstanceID`). A segunda abertura não abre o banco: antes do `bootstrap.New`, `main.go` sonda o mutex que o Wails cria (só abre, nunca cria, para não roubar o lock) e, se ele existe, permite que a primeira janela venha à frente (`AllowSetForegroundWindow`), roda o Wails só para entregar a abertura e sai. A primeira janela é restaurada, mostrada e levantada. Os argumentos da segunda abertura são ignorados por ora (nada abre arquivo nem link). "Reiniciar agora" continua valendo: o novo processo espera o antigo sair (`--restart-after`) antes de pedir o lock.
2. **BSA de outro jogo (capability `plugins`)**: contrato opcional `ArchiveChecker` (SDK, `APIVersion` 1.1). O módulo de plugins entrega ao adapter os arquivos do topo do target de plugins que vencem a Location entre os mods habilitados (com o mod e o caminho na staging) e os plugins ativos; o adapter lê o que precisa e devolve diagnósticos de código declarado no seu catálogo (código fora do catálogo faz a avaliação falhar, como na D131). O `skyrimse` lê o cabeçalho (`BSA\0` + versão) de cada BSA que um plugin ativo carrega e emite `archive_wrong_game` (erro, módulo plugins, aviso antes de jogar) quando a versão não é 105 (104 = Skyrim LE, Fallout 3, New Vegas; 103 = Oblivion), com o mod de origem e a ação "Abrir pasta do mod". Arquivo que não é BSA, truncado ou ilegível não é julgado. Código e textos vêm com o adapter.
3. **Ação "Abrir pasta do mod"**: genérica, do núcleo (`mod.folder.open`, lugar `folder.mod`, alvo `mod`); a UI abre a pasta do mod na staging. Rótulo no catálogo do app.

Motivo: duas janelas sobre o mesmo banco disputavam a operação mutante e podiam marcar como interrompida a operação da outra (INV-OPS-03); um BSA do Skyrim LE num Skyrim SE trava o jogo ou some com texturas, e o Vortex já avisa (`gamebryo-archive-check`).

Alternativas rejeitadas: só o lock do Wails (ele é pedido dentro de `wails.Run`, depois de o bootstrap abrir o banco e recuperar operações); criar um mutex próprio (com o mesmo nome o Wails da primeira janela não montaria a janela de mensagens; com outro nome seriam dois locks); checar BSA no `HealthCheckProvider` (ele não conhece os plugins ativos nem os arquivos dos mods, e o núcleo de diagnósticos não pode conhecer o módulo de plugins, D133); aviso em vez de erro (o jogo trava).

Consequências: (1) vale para todo jogo; teste do callback e da sonda (`bridge/instance_test.go`, `system/instance_windows_test.go`); duas aberturas ao mesmo tempo podem, raramente, ambas passar da sonda, e a segunda sai no lock do Wails depois do bootstrap. (2) só com `plugins`: no `generic` nenhum arquivo é lido (`integration/archives_test.go`). BA2 (Fallout 4) e conflitos dentro de archive ficam para LV5.

## D142 — Saves por perfil: chave do INI no `post` do deploy, pasta pelo id do perfil, módulo `saves`
Status: vigente (2026-10-21; fase LV3 de `propostas/2026-10-20-plano-lacunas-mo2-vortex.md`, item A4; detalha core/07 §3, §4.6 e §7, D133 e D134; prancha aprovada pelo usuário)

1. **Capability e contrato**: `save_games` passa a ter contrato (`ports.SaveGamesSupport`, D112): `SaveRedirect(inst)` (pasta conhecida, arquivo de settings, seção, chave, pasta base, valor padrão, separador), `IsSave`, `SaveCompanions` (arquivos que vão junto, como o co-save do SKSE) e `ReadSave` (cabeçalho: tipo, número, personagem, nível, local, data no jogo, raça, data, plugins usados, captura). Nova pasta conhecida `ports.FolderDocuments` (Windows: pasta Documentos do shell; `MODORCHESTRATOR_DOCUMENTS_DIR` a substitui em desenvolvimento). Nomes no SDK (`SaveGamesSupport`, `FolderDocuments`, `sdk/savegame`), `APIVersion` 1.2. O `skyrimse` declara a capability: `SLocalSavePath` em `[General]` do `SkyrimCustom.ini` (variantes GOG/EPIC como no `plugins.txt`), `.ess` e `.skse`, leitura dos formatos 12 (SE, corpo em LZ4 ou zlib) e 9.
2. **Pasta do perfil**: `profile.Features.LocalSaves` ("Saves próprios"), desligado por padrão, inclusive nos perfis existentes. Ligado, o perfil salva em `<base>\Saves\<id do perfil>\`: o id, não o nome, para que renomear não mova arquivos (INV-ID-03). Desligado, usa a pasta compartilhada: o valor que a chave tinha antes de o app escrever. Ligar não move os saves compartilhados; desligar não apaga os do perfil.
3. **Quando a chave muda**: no `post` do deploy (core/07 §4.6), junto com a load order, para o perfil implantado; ligar ou desligar no perfil que está na pasta do jogo aplica na hora. Um purge completo devolve a chave original (`deployment.PostPurge`). Nada é escrito quando o perfil não precisa (sem saves próprios e sem gravação anterior).
4. **Mínimo de `game_settings` (o LV8 completa)**: `domain/gameini` edita uma chave de INI mudando só a linha dela (preserva bytes, codificação e quebras de linha); `domain/gamesettings.KeyRecord` (estado aplicado, tabela `applied_game_settings`, migração 0013) guarda o valor original, o escrito e o pendente (gravado antes da escrita) e onde ficou a cópia do arquivo no BackupStore. Chave alterada fora do app desde a última gravação, para um valor que o perfil não pede, nunca é sobrescrita: vira o diagnóstico `save_path_external` (aviso, módulo game) com a ação `saves.apply_path` ("Usar a pasta do perfil"), que guarda a versão externa no BackupStore antes.
5. **Módulo `saves`** (D133): entra por `deployment.PostDeploy`/`PostPurge`, `diagnostics.Module` e o novo `profiles.Copier` (cópia de arquivos de um perfil para o clone: `CopyOptions`, `Clone(…, copies)`). Pergunta ao módulo de plugins por uma interface própria (presença e mods que fornecem), ligada no bootstrap; os dois não se importam.
6. **Tela Saves** (prancha `JogoSaves`, diálogos `JogoSavesTransferir` e `JogoPerfisClonar`): lista os saves do perfil ativo, mais novos primeiro; plugins faltando = usados pelo save e não ativos no perfil (inativo, com os mods instalados que fornecem, ou ausente); "Habilitar os mods que fornecem" habilita esses mods e ativa os plugins. Copiar/mover para outro perfil (o compartilhado, se ele não tem saves próprios) nunca substitui: nome repetido ganha " (2)", " (3)"…, e o co-save vai junto. Excluir pede confirmação. Clonar oferece "Copiar os saves" só quando a origem tem saves próprios; o clone mantém saves próprios e, sem a cópia, começa vazio.

Motivo: perfis compartilhavam os saves (A4 do levantamento); MO2 e Vortex separam por perfil e mostram os plugins que faltam.

Alternativas rejeitadas: pasta pelo nome do perfil (renomear moveria ou perderia saves); saves próprios ligados por padrão (os saves atuais "sumiriam" ao implantar); reescrever o INI inteiro (o jogo e outras ferramentas também o escrevem); trocar a chave na ativação (o jogo veria saves de um perfil com os mods de outro); sobrescrever na cópia com confirmação (perde save sem volta; renomear é barato).

Consequências: vale para todo jogo pela capability; no `generic` nada é escrito na pasta Documentos, comandos respondem `saves_unsupported`, sem diagnóstico e sem opção de cópia ao clonar (`integration/saves_test.go`). Testes: `gameini_test.go`, `skyrimse/saves_test.go` (`.ess` sintético em LZ4, zlib e sem compressão; formato 9; LZ4 com repetição), `integration/saves_test.go` (troca no deploy, ativação sem escrita, purge, alteração externa, listagem, plugins faltando, copiar/mover/excluir, clonar com cópia). Desligar o recurso (D115) deixa a chave como estava (INV-FEAT-03). Ficam para o LV8: INIs inteiros por perfil e INI tweaks.

Complemento da tela (LV3, mesma decisão): item `saves` no grupo Setup, depois de Perfis (`games.ItemSaves`); "Copiar os saves" ao clonar começa desmarcado (core/07 §3), embora a prancha mostre o estado marcado. Dois ajustes de infraestrutura que a validação da tela pediu: o binário de geração de bindings do Wails (tag `bindings`) pula a checagem de instância única da D141, que sem isso gerava bindings vazios com outra janela do app aberta; e com `MODORCHESTRATOR_DATA_DIR` definido (desenvolvimento, uso portátil) o lock de instância única inclui uma chave da pasta de dados, porque duas pastas são dois apps independentes (a pasta padrão mantém o id fixo). `MODORCHESTRATOR_DOCUMENTS_DIR` substitui a pasta Documentos em desenvolvimento.

## D143 — Dados do LOOT como provedor de regras leves e mensagens
Status: vigente (2026-10-21; fase LV2 de D140; detalha D041 e resolve o P4 de `06-revisao-2026-09-30.md`; emenda D028 para dados de provedor e o item de privacidade de `00-visao-e-escopo.md`)

1. **Obtenção (escolha do usuário)**: a masterlist do LOOT (`loot/<repositório>`, branch `v0.29`) e o prelude vão **empacotados** com cada versão do app, dentro do adapter que declara o jogo (`internal/adapters/skyrimse/loot/`, origem e commit em `SOURCE.md`). Licença CC0 1.0: sem obrigação de aviso. "Atualizar masterlist" (Configurações › Plugins › Dados do LOOT) baixa a versão atual de `raw.githubusercontent.com` **só no clique**, valida lendo o arquivo e grava em `<dataDir>/loot/<repositório>/` com `source.json`. A cópia baixada vale enquanto for mais nova que a empacotada; baixada ilegível volta para a empacotada. É a segunda exceção de rede, ao lado da verificação de atualização (D104); sem o download no build (`Fetcher` nulo) o botão fica desabilitado.
2. **Entrada pelo núcleo**: ponto de contribuição `plugins.Provider` (D133); o módulo de plugins nunca nomeia o LOOT. O módulo `application/loot` implementa o provedor; o adapter declara o jogo do LOOT por `ports.LootSupport` (`LootGame`: repositório, pasta do LOOT em `%LOCALAPPDATA%`, dados e data), alias no SDK (D134, `APIVersion` 1.3). Jogo sem a declaração ou sem a capability `plugins` não recebe nada (teste com o adapter `generic`).
3. **Setting**: `plugins.lootProvider` (instância, bool) passa a V1 com padrão **ligado**. Desligado, o provedor não dá regras nem mensagens.
4. **Regras leves**: grupos, `after` e `req` da masterlist (com condições avaliadas: `file`, `active`, `many`, `many_active`, `is_master`, `checksum`, `version`, `description_contains`, `readable`; função não suportada conta como falsa, inclusive sob `not`) viram grupos, ligações entre grupos, grupo de plugin e regras "carrega depois de" com origem `loot`. São recalculadas a cada leitura e **nunca gravadas**; só o "desligar" de uma regra do LOOT é gravado (`providerOff`, por id estável `loot:<plugin>><depois de>`), e vale mesmo se a regra sumir e voltar. Os dados do usuário vencem: grupo próprio do usuário ou escolha de grupo do usuário não é substituído; regra igual do usuário prevalece.
5. **Ciclo com dado de provedor** (emenda D028): em vez de bloquear o sort, o item do provedor que fecha o ciclo fica de fora, na ordem do LOOT: primeiro o grupo atribuído ao plugin, depois a ligação entre grupos, por último a regra. Regras deixadas de fora geram `plugin_provider_skipped` (info). Ciclo só com dados do usuário e masters continua bloqueante (D028). Limitação conhecida: o LOOT descarta arestas de grupo uma a uma; aqui sai a atribuição inteira do plugin ao grupo.
6. **Diagnósticos** (módulo plugins, só para plugins ativos): `plugin_requirement_missing` (error, `req` ausente; ação desativar), `plugin_incompatible` (error, `inc` presente), `plugin_provider_message` (mensagens `say`/`warn`/`error` → info/warning/error, texto no idioma do app com recuo para inglês, Markdown removido; mensagens globais só `warn`/`error`), `plugin_dirty` (warning, CRC do arquivo igual ao da entrada `dirty`, com ITM/UDR/navmesh).
7. **Userlist do LOOT**: "Importar regras do LOOT" lê `%LOCALAPPDATA%\LOOT\games\<pasta>\userlist.yaml` (ou o caminho antigo `LOOT\<pasta>`) e grava regras, grupos e escolhas de grupo com origem `import` (D128: removíveis). Entradas com condição, regex ou caminho ficam de fora e são contadas. Regra que fecharia ciclo é ignorada (contada), não recusa a importação.
8. **Dependência**: `gopkg.in/yaml.v3` (MIT/Apache-2.0) para ler a masterlist; o conjunto efetivo é memorizado por instância (chave sha256 das entradas) porque juntar e tirar ciclos custa ~200 ms com 840 plugins.

Motivo: o valor do LOOT está nos dados (grupos, load-after, plugins sujos); consumi-los como restrições leves mantém o motor nativo (D029) e a regra de que o usuário manda. Empacotar com o app mantém o app offline por padrão.

Alternativas rejeitadas: baixar ao abrir o app ou periodicamente (rede sem pedido); só empacotada (fica velha entre versões); libloot (C++, acopla o algoritmo); gravar as regras do LOOT no banco (ficariam velhas e misturadas com as do usuário); bloquear o sort em ciclo com dado do LOOT (a masterlist muda sem o usuário pedir).

Consequências: core/08 §4, §5, §8 e §13; core/10 §1.1; core/12 §10; core/13; `00-visao-e-escopo.md` (privacidade); `08-paridade-vortex-v1.md`; `ui/telas/settings-extensions.md` e `plugins.md`. Testes: `domain/plugin` (provided), `application/loot` (masterlist, condições, provedor, download, userlist), `adapters/skyrimse` (a cópia empacotada é lida inteira), `integration` (`TestLootDataOrdersAndDiagnoses`), UI em `Plugins.test.tsx`.

## D144 — Pasta por mod no destino: layout por ModType, pasta pelo id do mod
Status: vigente (2026-10-21; fase LV10 de D140; item M10 do levantamento MO2/Vortex)

1. **Contrato**: `game.ModType` ganha `Layout` (`ModLayout`): `merge` (padrão; o valor vazio também é `merge`) põe os arquivos de todos os mods direto no target, como sempre; `mod_folder` põe os de cada mod em `<target>/<pasta do mod>/...`. `Definition.Validate` recusa layout desconhecido. Não é capability nova: é um campo do ModType, que já é contrato do adapter (core/11 §2); quem não declara fica igual a antes. Nomes no SDK (`ModLayout`, `LayoutMerge`, `LayoutModFolder`), `APIVersion` 1.6. O manifesto de jogo descrito por dados (D116) não ganha o campo nesta fase.
2. **Nome da pasta**: o id do mod (`mod.Folder`), o mesmo que nomeia a pasta na staging (INV-ID-03). É estável entre reinstalações e renomeações e nunca colide entre mods. Escolha conservadora: o nome exibido muda com o usuário e pode repetir; um nome legível guardado à parte pediria coluna nova e regra de colisão sem um jogo real que exija nome específico (quando um jogo exigir, o archive já traz a pasta, ou entra decisão nova).
3. **Onde entra**: a Location é calculada **ao gravar a Installation** (`mod.Place`): instalar, reinstalar, importar de outro gerenciador. Trocar o ModType reposiciona os arquivos (`mod.Relocate`: tira a pasta do mod se o caminho começa por ela e aplica o layout do tipo novo). Deploy, purge, deploy incremental (D139) e conflitos não mudam: já trabalham sobre as Locations da Installation; mods em pastas próprias não disputam Locations e não aparecem em pares de conflito. As pastas `<target>/<id>/` são criadas pelo plano e removidas vazias no purge como qualquer pasta do deploy.
4. **Detecção de conteúdo**: o adapter recebe em `ContentFlags` as Locations sem a pasta do mod (`Installation.ContentFootprint`), isto é, relativas à raiz do mod, qualquer que seja o layout.
5. **Captura de arquivos gerados** (D046): os arquivos capturados mantêm a Location onde foram achados, com ou sem layout; só a troca de tipo posterior os reposiciona.
6. **Importação do Vortex**: o mod importado recebe o layout do ModType detectado. O leitor do Vortex não traz o `mergeMods` de cada jogo (é código da extensão do jogo no Vortex, não estado), então não há mapeamento a respeitar: a pasta do mod passa a ser o id do mod novo, não o `installationPath` do Vortex. A implantação do Vortex continua tratada como estrangeira (D035) até o purge dele.

Motivo: jogos como Mount & Blade II, Cyberpunk 2077 ou Subnautica pedem cada mod numa subpasta própria; sem o campo, um adapter só conseguia isso se o archive já trouxesse a pasta. Gravar a Location final na Installation mantém uma só fonte de verdade para deploy, conflitos e manifesto.

Alternativas rejeitadas: aplicar a pasta só no deploy (cada leitor de Location — conflitos, mudanças externas, manifesto, visão de arquivos — teria de repetir a conversão); nome da pasta pelo nome exibido (muda com renomear e pode repetir); capability nova (redundante com o campo do ModType e sem efeito em jogo que não declara).

Consequências: core/11 §2, core/02 §9, core/05 §5.1, core/04 §4; glossário (`ModType`); `04-mapa-de-impacto.md` (ModType). Testes: `domain/game` (layout inválido), `domain/mod` (Place, Unplace, Relocate, ContentFootprint), `integration/mod_folder_test.go` (adapter de teste com `mod_folder`: deploy em pastas próprias sem conflito, reinstalação e renomeação mantêm a pasta, purge devolve o jogo, troca de tipo nos dois sentidos, importação do Vortex; adapter `generic`: mods continuam mesclados e em conflito).

## D145 — Metadados por mod junto da staging e redescoberta da biblioteca
Status: vigente (formato escolhido pelo usuário em 2026-10-21; fase LV9 de D140, item M9 do levantamento MO2/Vortex; resolve em parte a lacuna de D100 e emenda D058)

1. **Arquivo**: `<staging>/<ModID>/.modorchestrator-mod.json` (`game.ModMetadataFile`), JSON com `formatVersion` 1. Leva: `modId`, `instanceId`, nome detectado, atributos (nome, versão, autor, descrição, notas, destaque, tags), categoria (id, nome e caminho de nomes da raiz até ela), tipo do mod, origem (`kind`, `ref`), archive de origem quando houver (id, nome original, formato, tamanho, hash e caminho no ArchiveStore), variante (`of`, rótulo), Package, Content e as datas (criado, instalado, alterado). **Não leva** ordem, habilitado, regras nem overrides: são do perfil e da instância. Ids do Nexus e URL entram no mesmo objeto `source` quando o modelo do mod os tiver (hoje `Source` é só `kind` + `ref`); um campo novo não muda a versão do formato, que só sobe quando um campo muda de sentido. O banco continua a fonte de verdade (docs-ia/03 regra 3): o arquivo é evidência para reconstruir, nunca lido em uso normal.
2. **Quando é gravado**: depois de todo commit da biblioteca que salva um mod instalado (instalar, reinstalar, editar atributos, categoria, tags, variante, tipo, trocar a origem, aceitar a staging, captura de arquivos gerados), depois da importação de outro gerenciador e quando uma categoria é renomeada ou movida (os mods dela). Gravação atômica (`FileSystem.WriteFile`: temporário + rename), só numa pasta de mod que já existe. Na reinstalação o arquivo é gravado na pasta final, depois do commit (a pasta `.installing` já foi renomeada). Falha ao gravar **não desfaz** a operação: o mod fica marcado em memória e a próxima avaliação mostra `mod_metadata_stale`. Na inicialização, a recuperação da biblioteca grava o arquivo dos mods instalados que não o têm (mods de antes desta versão).
3. **Ignorado por**: deploy, conflitos, staging check, listagens de arquivos e detecção de mudança externa trabalham sobre as Locations da Installation, onde o arquivo nunca entra; a redescoberta pula-o ao montar a Installation; um arquivo de mesmo nome na raiz de um archive é descartado pelo plano de instalação (não pode sobrescrever o metadado). Mover a staging copia o arquivo junto com a pasta do mod (ele é parte da staging). Na pasta do jogo o prefixo `.modorchestrator-` já é arquivo do app (`externalchange.IsOwnFile`).
4. **Redescoberta** (`library.RecoverOrphanFolders`): toda pasta da staging que não é de um mod do banco (fora `.tmp`, `*.installing`, `*.replaced` e nomes que começam com `.`) e tem ao menos um arquivo vira mod de novo, com o ModID igual ao nome da pasta. Com metadado válido (JSON legível, versão conhecida, `modId` igual ao nome da pasta) volta com nome, atributos, tipo (se o jogo ainda o tiver), origem, variante (se o original também existe), Package e datas; a categoria é achada pelo id, senão pelo caminho de nomes, senão é criada. Sem metadado, ou com metadado inválido, o nome é o ModID e o tipo é o detectado pelo footprint. Em todos os casos a Installation é recalculada da pasta (instalador `recovered`, tamanhos lidos do disco) e o Content é detectado pelo adapter. O archive volta a ser registrado quando o metadado o descreve e o arquivo existe no ArchiveStore da instância (reinstalar volta a funcionar). O mod entra no fim da ModOrder de todos os perfis, **desabilitado**: a ordem e o "habilitado" se perderam e ligar mods sem o usuário mudaria o jogo. O metadado é regravado com a instância nova.
5. **Diagnóstico** `staging_orphan_folders` (warning, módulo library), um por instância, com as pastas como evidência (até 20) e as ações "Recuperar mods" (`library.recover_orphans`) e "Abrir staging". É a "pasta órfã na staging" de core/14 §5; "apagar" fica de fora (o usuário apaga pela pasta aberta) e "ignorar" é o ocultar comum dos diagnósticos. `mod_metadata_stale` (info, library) conta os mods cujo metadado está faltando ou não pôde ser gravado, com a ação "Regravar metadados" (`library.rewrite_metadata`).
6. **Começar do zero** (D100) e **gerenciar de novo** (D058): no assistente (DLG-01), pasta de staging ou ArchiveStore cujo marcador nomeia uma instância que **não existe no banco** deixa de ser recusada: vira o aviso `folder_orphan` com a caixa "Usar estas pastas e recuperar os mods delas" (desmarcada, como a de D129). Sem a caixa, gerenciar é recusado (`staging_foreign`/`folder_foreign`, `reason: orphan`); com ela, o marcador é regravado com a instância nova (desfeito se gerenciar falhar) e as pastas dos mods aparecem em `staging_orphan_folders`. O BackupStore continua recusado: os backups da implantação antiga não têm manifesto e um backup novo de mesma Location os sobrescreveria. Marcador de uma instância que existe continua `other_instance`.
7. **Fora desta decisão**: "Adotar" uma implantação (core/04 §11). O jogo implantado pela instância antiga continua `foreign_deployment` (nada é apagado) até o usuário remover a implantação antiga.

Motivo: sem banco, a staging guardava só os arquivos; o nome, a versão e a origem de cada mod se perdiam. O MO2 resolve com um `meta.ini` por mod; o usuário escolheu JSON oculto na pasta do mod (mesmo formato dos marcadores, legível por qualquer ferramenta e versionado).

Alternativas rejeitadas: arquivo único na raiz da staging (um arquivo grande regravado a cada edição e perdido de uma vez); `meta.ini` compatível com o MO2 (a staging não tem o layout do MO2, então a compatibilidade não traria nada, e o formato não tem versão); gravar no commit do banco (o commit não pode falhar por causa de um arquivo de evidência); reabilitar os mods recuperados (o estado do jogo mudaria sem o usuário); adotar staging órfã sem a caixa (um backup do banco restaurado depois acharia a staging de outra instância).

Consequências: core/02 §9a, core/14 §5, core/10 §1.1, core/04 §10, ui/telas/dialogos.md (DLG-01), D058 e D100 emendadas, `07-relatorio-f14.md` §6, `propostas/2026-10-20-trabalho-futuro-f14.md` item 3. Testes: `domain/mod` (round-trip, versão desconhecida, JSON corrompido), `domain/game` (nome reservado), `integration/metadata_test.go` com o adapter `generic` (arquivo gravado no import, edição, categoria, reinstalação; fora do deploy e dos conflitos; redescoberta com e sem metadado e com metadado corrompido; começar do zero com staging adotada; falha de gravação vira diagnóstico e "Regravar" corrige).

## D146 — Ferramentas externas: registro por instância, sugestões do adapter, lançamento com scan ao fechar
Status: vigente no backend (2026-10-21; fase LV4 de D140, item M1 do levantamento; detalha D045, D046 e D112; a tela espera a prancha, D127)

1. **Capability e contrato**: `tools` passa a ter contrato (`ports.ToolSupport`, D112): `KnownTools(game)` devolve as ferramentas que o adapter conhece (`tool.Known`: id, nome, executáveis aceitos com os argumentos de cada um, pastas abaixo da raiz onde costuma estar, exclusiva, implantar antes). Nomes no SDK (`ToolSupport`, `sdk/tool`), `APIVersion` 1.4 (ou o menor seguinte livre no commit). O `skyrimse` declara SSEEdit/xEdit, Wrye Bash, Nemesis, Pandora, BodySlide, TexGen, DynDOLOD e Creation Kit (core/12 §9). Nome de ferramenta é fato de jogo: o teste de literais passa a recusá-los fora de `internal/adapters`.
2. **Registro (estado desejado do usuário)**: `domain/tool.Tool` por instância, na tabela `tools` (migração 0014): nome, ferramenta conhecida de origem, executável, argumentos (texto como digitado, aspas incluídas), pasta de trabalho (vazia = a do executável), ambiente, ícone (vazio = o do executável), exclusiva, implantar antes, posição. Só `.exe`. Variáveis iguais para todo jogo: `{game}`, `{staging}`, `{archives}`, `{profile}`, `{profile_id}` e `{target:<id>}`; `{{`/`}}` para chave literal; variável desconhecida é recusada ao salvar (`tool_invalid`). Ferramenta conhecida encontrada na pasta do jogo é sugerida com o caminho em `{game}\…`, para acompanhar a instância se a pasta mudar. Nada é registrado sem ação do usuário.
3. **Lançamento**: pelo serviço de lançamento (`launch.RunTool`, operação `launch_tool` com `check`, `deploy`, `start`), que a LV6 estende. Implantar antes implanta só se há deploy pendente. Diagnóstico bloqueante **não** impede a ferramenta (xEdit é a correção de muitos). Operação em curso recusa com `instance_busy`; a mesma ferramenta duas vezes, com `tool_running`. Executável ou pasta inexistente: `tool_executable_missing`/`tool_folder_missing`, antes de qualquer coisa.
4. **Exclusiva**: segura o lock da instância (holder `tool`) do início ao fim da ferramenta; deploy, purge, importação e o Play são recusados com `instance_busy` enquanto isso. O padrão das ferramentas conhecidas é exclusiva + implantar antes (elas escrevem nos dados do jogo enquanto rodam).
5. **Fim da ferramenta**: a porta `ProcessRunner` segue a ferramenta e os processos que ela abre (job object no Windows, sem matar nada ao fechar o app). Ao fim, se nenhuma operação segura a instância, roda "Verificar implantação" (pastas em volta dos arquivos gerenciados e saídas conhecidas do adapter, core/09 §3) e grava `tool.exited` com `changes`, `newFiles` e `scanned`. A UI usa esse evento para oferecer a revisão com captura (DLG-15); o diagnóstico `external_changes_pending` continua sendo o aviso persistente. Ferramentas em execução vivem na memória: fechar o app para de segui-las.
6. **Ícone**: `ExecutableIcons` lê o ícone do executável, de um `.ico` ou devolve o `.png` escolhido, como PNG 32×32.

Motivo: M1 do levantamento; MO2 e Vortex iniciam ferramentas e atualizam o estado quando elas fecham, e o fluxo Nemesis/BodySlide/DynDOLOD depende da captura das saídas.

Alternativas rejeitadas: ferramentas no núcleo para todo jogo, sem capability (o plano aprovado põe o recurso na capability; oferecer ao `generic` é uma linha no adapter quando houver pedido); registrar automaticamente as ferramentas detectadas (registro é escolha do usuário); argumentos como lista (o usuário copia linhas de comando de guias; a linha vai como digitada, como no MO2); bloquear ferramenta por diagnóstico bloqueante (impediria a correção); saídas próprias por ferramenta (as saídas conhecidas do adapter cobrem o fluxo; fica para depois); `.bat`/`.cmd` (exigiria `cmd.exe`; fica para a LV6 junto do lançamento elevado); seguir só o processo principal (launchers que abrem o programa real e saem encerrariam a espera cedo).

Consequências: vale pela capability; no `generic` e com o recurso desligado todo comando responde `tools_unsupported` e nada é lido nem iniciado (`integration/tools_test.go`). Testes: `domain/tool` (variáveis, validação, declaração conhecida, ordem), `adapters/skyrimse/tools_test.go`, `integration/tools_test.go` (sugestão e detecção, variáveis expandidas, implantar antes, exclusiva com `instance_busy`, scan ao fechar com arquivo gerado, ordem, edição, exclusão, executável ausente, sem capability), `system/runner_windows_test.go` (linha de comando, ambiente, código de saída, espera pelo processo filho, ícone). core/11 §1 e §6, core/12 §2 e §9, core/09 §3, core/15, `03-fontes-de-verdade.md`, glossário. Pendente: tela Ferramentas, menu da barra de título e diálogo de captura ao fechar (prancha), textos de i18n dos códigos e da operação, item `tools` em `games.FeatureScreen` (entra com a tela).

Complemento da tela (LV4, mesma decisão; pranchas `JogoFerramentas`, `JogoFerramentasEditar`, `JogoFerramentasMenu` e `JogoFerramentasFim` aprovadas, com o ajuste do usuário: ferramentas são opcionais, então a lista não tem coluna de estado e o executável ausente só aparece ao clicar em Iniciar). Item `tools` no grupo Setup, depois de Saves (`games.ItemTools`, `FeatureScreen`); seção `topbar.tools` liga o menu da barra superior. `Tools()` traz também `blocker` (a exclusiva aberta, que impede as outras) e a hora de início de cada ferramenta rodando; `tool.exited` traz `started`. A ponte passa os eventos `tool.*` como sinal. O cartão do rodapé mostra "{ferramenta} em uso: alterações bloqueadas" quando o lock é `tool`. Na dettmann-ui: `Button badge={true}` desenha um ponto (D-043) e `Menu.Item` ganhou `description`, `media` e `end` (D-044). Tela em `ui/telas/ferramentas.md`; testes em `Tools.test.tsx`.

## D147 — Conflitos dentro de archives do jogo: índice lido pelo adapter, solto vence archive, só informação
Status: vigente no backend (2026-10-22; fase LV5 de D140, item M2 do levantamento; detalha D004, D112, D133, D134 e INV-CON-04; a tela espera a prancha, D127)

1. **Contrato**: `ports.ArchiveIndex`, sub-contrato da capability `plugins` como `PluginArchives` (nesses jogos o archive carrega porque um plugin ativo o carrega, então quais carregam e em que ordem segue a ordem de carga). `LoadedArchives(jogo, arquivos do topo do target de plugins, plugins ativos na ordem)` devolve os archives que o jogo lê, na ordem em que lê; `ReadArchiveIndex(fs, jogo, caminho)` lista os caminhos de dentro do archive, relativos ao target, lendo só o índice, e devolve `ErrArchiveUnreadable` para formato que não lê. Nomes no SDK (`ArchiveIndex`, `ErrArchiveUnreadable`), `APIVersion` 1.5.
2. **Regra (do contrato, não do adapter)**: arquivo solto no target vence o mesmo caminho dentro de qualquer archive, qualquer que seja a ordem dos mods; entre archives vence o lido depois. Jogo com regra diferente exige mudar o contrato.
3. **Leitura (adapter)**: `internal/adapters/gamebryo` lê o índice de BSA 103/104/105 (nomes de pastas e arquivos guardados) e de BA2 geral e de texturas (tabela de nomes, por seek ou lendo até ela); sem nomes guardados ou outro formato é `ErrFormat`. O `skyrimse` carrega, por plugin ativo na ordem de carga, `Mod.bsa` e depois os `Mod - *.bsa` por nome (a mesma regra de nome do `bsa_without_plugin`), e só lê o índice da versão 105: as outras já viram `archive_wrong_game` (D141). Os archives do `Skyrim.ini` (do próprio jogo) e arquivos soltos não gerenciados ficam fora: não são de mods.
4. **Cálculo (domínio, derivado)**: `domain/gamearchive.Calculate` recebe os archives na ordem do jogo com seus índices e o vencedor solto de cada Location do target (`conflict.Index.WinnerOf`, mesma regra da INV-CON-01) e devolve os caminhos disputados (vencedor e perdedores), os pares (vencedor, perdedor, motivo `loose` ou `load_order`, número de caminhos; o solto de um mod sobre o próprio archive conta só em arquivos) e os archives não lidos. Nunca persistido (INV-CON-04), nunca vira regra nem override (D004): a ordem dos mods não decide essas disputas.
5. **Módulo**: o módulo de plugins responde o ponto de contribuição `conflicts.ArchiveSource` (D133) com os archives da ordem de carga desejada do perfil ativo, cada um vindo do mod que vence a Location dele; o índice fica em cache por instalação e arquivo (instalação é imutável). Archive que sumiu da staging não entra no cache. Consulta `conflicts.ModArchiveConflicts(instância, mod)` e ponte `ModArchiveConflicts`: `supported`, archives do mod, não lidos, oponentes (lado deste mod, lado do outro, vence, motivo, arquivos), totais de caminhos vencidos e perdidos.
6. **Deploy e conflitos de arquivo**: nada muda. O desejado, o plano, os pares a decidir, o indicador do mod e `mod_fully_overwritten` continuam só com arquivos soltos; as disputas em archives só explicam o que o jogo vai ver.

Motivo: M2 do levantamento; o MO2 mostra conflitos dentro de BSA, e sem isso um mod de texturas soltas "vence" no app mas o usuário não sabe que também sobrescreve archives de outros mods, nem por que um archive perde para outro.

Alternativas rejeitadas: capability própria `archives` (seria um item a mais em Ajustes › Recursos sem processo próprio: carrega com os plugins e segue a ordem de carga); regra declarada pelo adapter (as regras conhecidas são iguais nos jogos Bethesda; regra diferente mudaria a tela e o contrato juntos); deixar a ordem dos mods ou overrides decidirem archives (o jogo não obedece; seria uma promessa falsa); ler os archives do `Skyrim.ini` (não são de mods e exigiriam ler o INI do jogo); ler BSA 104 no Skyrim SE (o jogo não lê; o erro já existe).

Consequências: vale pelo contrato; no `generic` (sem `plugins`) e com o recurso de plugins desligado a consulta responde `supported=false` e nada é lido (`integration/archive_conflicts_test.go`). Testes: `adapters/gamebryo` (BSA 103/104/105, BA2 com e sem seek, formatos recusados), `adapters/skyrimse/archive_index_test.go` (ordem pela ordem de carga, só versão 105), `domain/gamearchive` (solto vence, archive posterior vence, mesmo mod, não lidos, determinismo), `domain/conflict/winner_test.go` (WinnerOf igual ao cálculo completo), `integration/archive_conflicts_test.go`. core/05 §5.5, core/11 §1, core/12 §5 e §10, glossário. Pendente: a tela (seção no detalhe do mod e faixa na página de Conflitos), que espera a prancha.
