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
8. **Archive com FOMOD antes da F10**: em vez de falhar, a importação para na decisão `fomod_pending` e o usuário escolhe a pasta (o mesmo caminho alternativo de core/03 §7 para FOMOD com script). A escolha fica em `Installation.options`; quando o FOMOD existir, reinstalar com outras opções passa pelo assistente.

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
4. **Histórico da ordem**: até a F9, o botão "Histórico" da toolbar de Mods abre o histórico de ordem do profile ativo (D070) em vez de Diagnostics › Histórico, que ainda não existe.
5. **Só "Ativar" usa o lock da instância** (core/07 §2); mover, regras, separadores, snapshots e transferir são comandos curtos sem filesystem e não são bloqueados por uma importação em andamento.
6. **Nome de profile** é único na instância sem diferenciar maiúsculas; **excluir** é recusado para o ativo, logo o "último" é sempre o ativo (as duas mensagens existem).
7. **Restaurar snapshot** sempre cria antes um snapshot `before_restore` do estado atual (core/07 §6 cita "restaurar outro snapshot" entre os automáticos).
8. **Transferir** na F5 oferece mods habilitados (sempre) e ordem; plugins aparecem com a F11. Comparar mostra os grupos de plugins e load order só quando há diferença (antes da F11 não há estado de plugin para comparar).
9. **Profile "vazio"** copia também os separadores do profile ativo, junto com a ordem (core/07 §2 manda copiar a ordem para preservar posições).
10. **Ciclo na UI** é exibido na direção das restrições ("A → B → A": cada um vem antes do seguinte), como o motor o encontra.
