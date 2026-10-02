# Decisões arquiteturais

Formato: cada decisão tem ID estável. Decisões não são apagadas; quando deixam de valer, recebem `Status: substituída por Dxxx` e a motivação original é preservada (ver `skills/maintain-ai-docs`).

Status possíveis: `vigente`, `emendada por Dxxx` (continua valendo com o ajuste), `substituída por Dxxx`.

---

## D001 — Vortex como referência operacional
Status: vigente (reforçada por D042)

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
Status: vigente

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
Status: vigente

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
Status: vigente (revisável)

O sort da V1 é nativo (D029) e usa: masters implícitos, masters antes de dependentes, flag ESM, regras e grupos do usuário, locks. A integração com dados do LOOT (masterlist: grupos, load-after, mensagens de plugin sujo) entra na V1.x como **provedor de restrições**, não como algoritmo, com revisão de licença. Motivo: libloot é C++ e o valor principal (dados) pode ser consumido sem acoplar o core ao algoritmo.

## D042 — Distribuição de telas e elementos segue o Vortex
Status: vigente (substitui a orientação "não copiar cegamente" da UI v2)

Diretriz do usuário: onde o Vortex já resolveu o problema, reproduzir a distribuição de elementos (se ele usa select, usar select; se usa modal, usar modal). Divergências só são permitidas se listadas em `ui/00-principios-e-shell.md` › Divergências aprovadas, cada uma com motivo. Divergências aprovadas nesta revisão: tela dedicada de Conflicts, tela Load Order separada de Plugins, tela Diagnostics, Profiles sempre visível (D037), Overview do jogo, linguagem "X vence Y" (D025).

## D043 — Tema do produto
Status: vigente

O produto usa um tema registrado na dettmann-ui (`orchestrator`, derivado de `forest`), escuro por padrão, com orçamento 60/30/10 mapeado para os papéis semânticos da lib (`ui/04-tema-60-30-10.md`). Status nunca é comunicado só por cor (sempre ícone + rótulo), porque verde é ao mesmo tempo marca e sucesso. Modo claro existe, mas não é foco de ajuste fino na V1.

## D044 — Internacionalização desde a fundação de UI
Status: vigente

Todo texto de interface vem de catálogo i18n desde a F2. Idiomas V1: `en` e `pt-BR`. Códigos de erro, IDs de diagnóstico e eventos são estáveis e independentes de idioma; o backend envia código + parâmetros, e a UI traduz.

## D045 — Launch do jogo na V1; hotbar de tools reservada
Status: vigente

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
Status: vigente

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
Status: vigente (detalha D035; core/04 §10)

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
Status: vigente

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
Status: proposta (aguarda confirmação do usuário)

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
Status: proposta (aguarda confirmação do usuário)

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
Status: proposta (aguarda confirmação do usuário)

1. **Lista de pares é par a par**: uma Location com 3+ fornecedores aparece em cada par envolvido; "vencedor" do par é quem implanta mais Locations dele. A forma em grupo "B vence A, C" (ui/telas/conflicts.md §3) fica para quando houver demanda; o detalhe de cada arquivo já lista todos os fornecedores.
2. **"Decidido por" do par** junta as resoluções por arquivo ignorando as redundantes: uma só → ela; várias → "misto"; só redundantes → "redundante".
3. **Revisão automática** (core/05 §5.4) acontece ao salvar decisões de par (DLG-08 e ações da tela Conflicts) e ao escolher vencedor por arquivo (pares do vencedor com os outros fornecedores). Criar regra pelo diálogo "Gerenciar regras" (DLG-10) não revisa, por não partir de um conflito.
4. **"Pela ordem (sem regra)"** no DLG-08 remove a regra do usuário entre os dois e desativa (não apaga) a de outra origem, como D072 item 3. Salvar o DLG-08 aplica todas as escolhas numa transação; se uma fecharia ciclo, nada é salvo e o ciclo é mostrado.
5. **Busca** da tela Conflicts (nome de mod ou caminho) roda no backend; "Agrupar por Mod" agrupa os pares pelo vencedor.
6. **Indicador "totalmente sobrescrito"** conta arquivos ocultados como não fornecidos: um mod que perde o que sobra e ocultou o resto é totalmente sobrescrito.

## D076 — Licença GPL-3.0-or-later e modelo de contribuição
Status: vigente

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
Status: proposta (aguarda confirmação do usuário)

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
Status: proposta (aguarda confirmação do usuário)

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
Status: proposta (aguarda confirmação do usuário)

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
Status: proposta (aguarda confirmação do usuário; emenda core/03 §2)

core/03 §2 dizia "o de maior `priority` vence; empate → o último declarado". Os FOMODs reais e a suíte "FOMOD Compliance Tests" usada pelo instalador do Vortex (casos `test_steps_ignore_required_priority`, `test_conditionals_ignore_priority`, `test_conditionals_ignore_required_priority`) mostram outra precedência: as instruções são aplicadas em **fases** — `requiredInstallFiles`, depois as opções dos passos visíveis, depois `conditionalFileInstalls` — e uma fase posterior vence a anterior qualquer que seja a prioridade. A prioridade só desempata **dentro** da fase; empate de prioridade → o último declarado (na ordem de exibição) vence.

Motivo: FOMODs reais usam `conditionalFileInstalls` para substituir arquivos obrigatórios com prioridade padrão; com a regra antiga o substituto perderia para o obrigatório de prioridade maior e o mod ficaria instalado diferente do Vortex/MO2. Alternativa rejeitada: prioridade global (texto antigo de core/03 §2).

Consequências: `fomod.Resolve` ordena por (fase, prioridade, declaração); teste `TestResolvePhasesPriorityAndFlags`. INV-LIB-02 continua garantido (um arquivo por destino).

## D086 — Comportamentos da F10 não fixados pela spec
Status: proposta (aguarda confirmação do usuário; emenda D066 item 8)

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
Status: proposta (aguarda confirmação do usuário)

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
