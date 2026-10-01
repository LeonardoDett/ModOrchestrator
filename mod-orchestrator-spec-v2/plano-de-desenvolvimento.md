# Plano de desenvolvimento (v2.1)

Referências: D024 (renumeração e fatias verticais), D047 (escopo por release), `00-visao-e-escopo.md`.

## Estratégia

1. **Fatias verticais.** Cada fase entrega core **e** a tela mínima que permite demonstrá-lo. Nada de "toda a UI no fim".
2. **Ordem de dependência real.** Ordem de mods e conflitos vêm antes do deploy, porque o deploy precisa saber o vencedor de cada arquivo. Perfis vêm antes do deploy porque o desejado é do profile.
3. **Adapter real cedo.** O `skyrimse` entra na F3 (descoberta e targets) e é aprofundado na F11 (plugins). O `generic` valida que nada depende do Skyrim.
4. **Invariantes como testes.** Cada fase torna obrigatórios os testes dos invariantes marcados com ela em `docs-ia/02-invariantes.md`.
5. **Pacotes isolados.** Um pacote de domínio por módulo (core/00 §2); aplicação depende de ports; infraestrutura implementa.

## Critério de passagem entre fases

1. Documentos obrigatórios da fase lidos e respeitados.
2. `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `wails build` passam.
3. Testes dos invariantes da fase existem e passam.
4. Critérios de aceite dos documentos `core/` e `ui/telas/` da fase atendidos.
5. Nenhum anti-pattern novo; `ui-review` aplicado nas telas tocadas.
6. Decisões novas registradas; documentos afetados atualizados (mapa de impacto).
7. **Demonstração manual** descrita na fase executada e relatada.

---

## F0: Bootstrap ✅ (concluída)

Wails + React/Vite, camadas Go com teste de arquitetura, SQLite com migrations, Operation/Event, event bus, bridge com backend offline, dettmann-ui integrada, shell com navegação global vazia. Decisões D017–D023.

## F1: Domínio ✅ (concluída 2026-09-30, revisada para a v2.1)

Pacotes e status: core/00 §2. Decisões de implementação: D049–D051. Ficam para as fases donas: modelo de installer/FOMOD (F4/F10), projeção de histórico (F9), interfaces opcionais de plugins no adapter (F11).

**Objetivo:** todo o modelo de core/01 como domínio puro, com invariantes testados, sem filesystem real.

Entregas:
- Completar `game` (ModType, TargetDef, capabilities), `mod` (Archive, atributos, categorias, estados de core/02 §5).
- `ordering`: motor de ordenação (core/05 §3), com testes de propriedade (ordem válida não muda, determinismo, ciclo detectado sem alterar).
- `profile` (Profile, ModEntry, ModOrder, Separator, Snapshot), `rules`, `conflict` (cálculo puro), `deployment` (DesiredState e planejador puro sobre estados de entrada; sem I/O), `external` (classificador puro), `plugin` (modelo; sem adapter), `diagnostic` (modelo + registro de checks), `settings` (catálogo).
- Ports de aplicação declarados (core/00 §3), sem implementação além de fakes para teste.

Invariantes: INV-ID-01/02, INV-LIB-01/02, INV-ORD-05, INV-OPS-01/03 (já).
Demonstração: suíte de testes de domínio; cenário de conflito com 3 mods e override calculado corretamente em teste.
Fora: filesystem, UI nova.

## F2: Fundação de UI

**Objetivo:** shell definitivo, tema, i18n e componentes base, antes das telas de domínio.

Entregas:
- Shell de ui/00 §2: barra de título custom com área do lançador (sem Play ainda), sidebar com seções (workspace vazio até F3), topbar com placeholders reais (sino, operações, problemas) ligados ao backend de operações existente.
- Tema: registrar `orchestrator` na dettmann-ui ou manter `forest` com plano registrado (ui/04). Nenhum hex no app.
- i18n (en, pt-BR) com catálogo e testes que falham para chave ausente (D044).
- Lacuna L1 (DataTable) criada **na lib**.
- Drawer de operações e aba Log de Diagnostics (o log técnico é criado nesta fase, D055).
- Paleta de comandos (`Command`) com as ações globais existentes.

Invariantes: INV-OPS-04/05.
Demonstração: app abre com shell completo, troca de idioma, drawer mostra operações reais, log visível.
Estado: concluída (D053–D056).

## F3: Jogos, adapters e descoberta

Docs: core/11, core/12 (§1–3), ui/telas/games.md.

Entregas:
- Port `GameAdapter`, registro no bootstrap, adapters `generic` e `skyrimse` (identidade, detecção, targets, mod types, root hints).
- `StoreScanner` (Steam, GOG, Epic, registro), busca rápida/completa, validação de raiz.
- Assistente Gerenciar jogo, jogo genérico, múltiplas instâncias, ocultar, parar de gerenciar (até a F7 só é permitido para instância sem manifesto, o que é sempre verdade antes do deploy existir; teste de guarda), alterar localização.
- Staging/ArchiveStore/BackupStore com marcadores; detecção de implantação estrangeira (`foreign_deployment`).
- Navegação do workspace por capability (consulta do bridge); Overview esqueleto.

Invariantes: INV-LIB-03, INV-DEP-08 (detecção).
Demonstração: encontrar Skyrim SE da Steam, gerenciar, ver workspace; criar jogo genérico com dois targets.

## F4: Biblioteca e importação

Docs: core/02, core/03 §1–2 e §6–7 (sem FOMOD), ui/telas/mods.md (§4–6 parciais), ui/telas/dialogos.md (DLG-04/05/07).

Entregas:
- Port `Extractor` (decisão registrada: biblioteca/binário, licença), `Hasher`, `FileSystem` Windows (long paths).
- Pipeline de import completo (core/02 §3), fila visível, lock de instância (D038), duplicados/variantes, resolução de root com decisão, instaladores `basic` e do adapter (`skse-runtime`, detecção ENB).
- Reinstalar, remover (com archive), atributos, categorias, ContentFlags.
- Tela Mods: tabela (sem prioridade ainda), toggle de status, filtros, Inspector (Visão geral, Arquivos, Instalação, Histórico), dropzone, multi-seleção.
- Lacunas L3/L4 na lib.

Invariantes: INV-ID-03/04, INV-LIB-04/05, INV-OPS-02.
Demonstração: arrastar 10 archives reais de Skyrim (wrapper, múltiplas opções, SKSE); matar o processo no meio de um import e reabrir sem lixo.
Estado: concluída (D062–D068; D066 aguarda confirmação). Os cenários da demonstração têm testes automatizados em `internal/integration` (wrapper, opções com decisão e reinstall, SKSE, duplicado/variante, zip-slip, recuperação após interrupção).

## F5: Profiles e ordem de mods

Docs: core/07, core/05 §1–4, ui/telas/profiles.md, ui/telas/mods.md §5.2–5.3.

Entregas:
- Profiles (criar, ativar, renomear, clonar, excluir, comparar, transferir, snapshots); select de profile na topbar.
- ModOrder com separadores, regras "vence" (OrderRule) com recusa de ciclo, motor aplicado a todos os profiles com prévia, arrastar com recusa + alternativas (L2 na lib), histórico reversível de ordem.
- Dependency/IncompatibilityRule (modelo e edição; diagnósticos na F9).

Invariantes: INV-ORD-01..04, INV-ORD-06.
Demonstração: dois profiles com seleções diferentes; regra que move o mínimo e explica; tentativa de ciclo recusada.
Estado: concluída (D069–D072; D072 aguarda confirmação). Os cenários da demonstração têm testes em `internal/integration/profiles_test.go` (regra que move um só mod, ciclo recusado com o ciclo, movimento recusado com alternativas, desfazer, snapshots e transferência, propriedade INV-ORD-01..03).

## F6: Conflitos

Docs: core/05 §5–6, ui/telas/conflicts.md, DLG-08/09/10/12.

Entregas:
- Cálculo incremental de conflitos com metas de desempenho, redundância por hash, agregações por par/mod/arquivo.
- FileOverride, FileExclusion, revisão, `override_stale`.
- Tela Conflicts, indicadores na tabela de Mods, Inspector › Conflitos, editor de conflitos do mod, escolha de vencedor por arquivo (L5 na lib).

Invariantes: INV-CON-01..04.
Demonstração: dois mods de texturas sobrepostos: escolher vencedor por par e depois um arquivo específico pelo outro.
Estado: concluída (D073–D075; D075 aguarda confirmação). A demonstração é `TestConflictDemonstration` em `internal/integration/conflicts_test.go`; INV-CON-01..04 têm testes no domínio (`conflict/index_test.go`: equivalência com o cálculo completo, overrides/exclusões obsoletos, redundância, meta de 500 ms com 200.000 Locations) e na integração (ciclo recusado por inteiro, redundante, obsoleto + diagnóstico, recálculo sem cache).

## F7: Deploy e purge

Docs: core/04, core/14 §5 (journal), VORTEX-04, VORTEX-13 §3–4, DLG-14/16/17/18.

Entregas:
- Scan observado, plano, journal, apply em ordem segura, verify, commit, marcadores, backups de originais, purge, limpeza de pastas, métodos com disponibilidade/motivo, mover staging, auto-deploy com coalescência (D036), status de deploy na topbar e Overview, recuperação `deploy_interrupted`.
- External change **mínimo** necessário para segurança: detecção e bloqueio (a triagem completa é F8).

Invariantes: INV-DEP-01..09, INV-EXT-01.
Demonstração: deploy de 50 mods reais, jogar; purge; deploy de novo; kill em 20 pontos com reconciliação limpa (automatizado).
Estado: concluída (D078; D079 aguarda confirmação). Testes: domínio (`deployment/settle_test.go`, `deployplan_test.go`, `deploystate_test.go`), repositórios (`sqlite/deployment_repository_test.go`), integração com filesystem NTFS real (`internal/integration/deploy_test.go`: deploy → deploy vazio → diff → purge → deploy, external change em deploy/purge/auto-deploy, implantação estrangeira, coalescência, arquivo travado, mover staging e trocar método) e o teste de interrupção em processo filho (`deploy_kill_test.go`, 20 pontos aleatórios). Pendente para a demonstração manual: deploy de 50 mods reais e jogar.

## F8: Alterações externas e arquivos gerados

Docs: core/09, VORTEX-08, DLG-15.

Entregas: classificação completa, diálogo com ação por linha, captura para mod, "deixar não gerenciado", scan ao focar, monitor do arquivo de load order (preparado para F11).
Invariantes: INV-EXT-02/03.
Demonstração: editar um plugin no xEdit via hardlink; gerar saída do Nemesis e capturá-la.

## F9: Dependências, diagnósticos, notificações e histórico

Docs: core/06, core/10, ui/telas/diagnostics.md, ui/telas/dashboard.md (dashlet "Precisa de atenção").

Entregas: registro de HealthChecks com o catálogo V1 (exceto plugins), supressão, notificações (toast/sino/desktop, agregação), histórico com filtros e reversão, pacote de diagnóstico, tela Diagnostics completa, faixas de problemas nas telas.
Invariantes: INV-OPS-06.
Demonstração: mod com requisito desabilitado → diagnóstico → "Habilitar" resolve; incompatíveis bloqueiam deploy.

## F10: FOMOD completo

Docs: core/03 §3–5, DLG-06.

Entregas: parser (encodings, XXE desligado), avaliador de condições puro, plano determinístico, assistente com imagens, reinstall com escolhas anteriores, requisitos detectados, fixtures de 10+ FOMODs reais.
Demonstração: instalar 5 FOMODs populares de Skyrim com opções diferentes e reinstalar um trocando opções.

## F11: Plugins e load order (Skyrim)

Docs: core/08, core/12 §5–9, ui/telas/plugins.md, ui/telas/load-order.md, DLG-23/24/25.

Entregas: inventário, leitura de cabeçalho com cache, PluginState/LoadOrder por profile, restrições do adapter, sort nativo com prévia, auto-sort, regras, grupos (lista), IndexLock, serialização `plugins.txt` no pós-deploy, triagem de alteração externa, diagnósticos de plugins, telas Plugins e Load Order.
Invariantes: INV-PLG-01..03.
Demonstração: 200 plugins reais; master faltando resolvido pelo Inspector; `plugins.txt` alterado por fora gera triagem.

## F12: Settings, Dashboard, Overview e Launch

Docs: core/13, ui/telas/settings-extensions.md, ui/telas/dashboard.md, ui/telas/overview.md, core/11 §6, DLG-26/27.

Entregas: todas as abas de Settings V1, Extensions (lista de embutidos), Dashboard com dashlets e personalização, Overview completa, Play com pré-lançamento e detecção de jogo em execução, backups/restauração do banco (core/14 §3–4).
Demonstração: da instalação do app até jogar Skyrim com mods usando só a UI.

## F13: Polimento de UX

Docs: ui/00–04, todos os ui/telas.

Entregas: atalhos, navegação por teclado completa, estados vazios/erro/ocupado em todas as telas, textos revisados (en/pt-BR), acessibilidade (contraste, foco, leitores de tela básicos), densidade compacta, `ui-review` em todas as telas, testes de componentes das composições.
Demonstração: percorrer todos os fluxos de ui/02 só com teclado.

## F14: Hardening e desempenho

Docs: core/14, `00-visao-e-escopo.md` (requisitos não funcionais), todos os critérios de aceite.

Entregas: testes de interrupção (kill em pontos aleatórios de import/deploy/purge/move staging/migration), corrupção de banco, permissões, antivírus (arquivo travado), volumes diferentes, caminhos longos e perigosos (fuzz de normalização), migrations com bancos antigos, benchmarks com 2.000 mods / 500 mil arquivos. Nenhuma feature nova.
Demonstração: relatório de benchmarks e da bateria de interrupções.

## F15: Release V1.0

Docs: `plano-de-publicacao.md` (etapas 2–6), D076, D077.

Entregas: instalador Windows, assinatura, atualização do app (opt-in), notas de versão, documentação do usuário mínima (primeiros passos), revisão dos itens **(verificar)** do core/12, checklist de paridade com VORTEX-12 (todo ADOPT/ADAPT V1 presente).

---

## Depois da V1.0

V1.x e V2 em `00-visao-e-escopo.md` e `core/15-futuro.md`. Cada item vira fase própria com o mesmo formato, depois de revisar decisões e contratos afetados.
