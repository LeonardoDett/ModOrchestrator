# Prompts por fase

Cada prompt pressupõe `prompts/00-protocolo.md`. A lista de documentos é **obrigatória** (anti-pattern 19). Fases grandes podem ser divididas em sessões; cada sessão repete o protocolo e declara qual parte da fase executa.

## F1: Domínio

```text
Aplique prompts/00-protocolo.md. Fase: F1 (plano-de-desenvolvimento.md › F1).
Leia: core/00, core/01, core/02 §5, core/05 §1–5, core/07, core/04 §2–4 e §7, core/09 §2, core/08 §2–4, core/10 §1, core/13.
Implemente somente domínio puro e ports em internal/core, com testes. Sem filesystem, SQL ou UI.
Obrigatório: motor de ordenação (core/05 §3) com testes de propriedade; cálculo de conflitos e planejador de deploy como funções puras.
Invariantes com teste nesta fase: INV-ID-01/02, INV-LIB-01/02, INV-ORD-05.
Não implemente: adapters, extração, telas.
```

## F2: Fundação de UI

```text
Aplique prompts/00-protocolo.md. Fase: F2.
Leia: ui/00-principios-e-shell.md, ui/03-componentes-e-padroes.md, ui/04-tema-60-30-10.md, D021/D022/D042–D044, skills da dettmann-ui.
Entregue o shell definitivo (barra de título com área do lançador, sidebar em seções, topbar), tema, i18n en/pt-BR, drawer de operações, aba Log, paleta de comandos.
Crie a DataTable (lacuna L1) NA dettmann-ui, seguindo component-authoring, com testes na lib.
Nada de domínio novo. Nenhum hex no app. Nenhum texto fixo fora do catálogo.
Invariantes: INV-OPS-04/05.
```

## F3: Jogos e adapters

```text
Aplique prompts/00-protocolo.md. Fase: F3.
Leia: core/11, core/12 §1–3, core/04 §10–11, ui/telas/games.md, ui/telas/dialogos.md (DLG-01/02/03), references/vortex/VORTEX-02.
Implemente port GameAdapter, adapters generic e skyrimse (identidade, detecção, targets, mod types, root hints), StoreScanner, assistente Gerenciar jogo, marcadores de staging, detecção de implantação estrangeira, navegação do workspace por capability.
Itens "(verificar)" do core/12: confirme em fonte primária antes de codificar e atualize o documento.
Nenhum if por jogo fora de internal/adapters.
Invariantes: INV-LIB-03, INV-DEP-08 (detecção).
```

## F4: Biblioteca e importação

```text
Aplique prompts/00-protocolo.md. Fase: F4.
Leia: core/02, core/03 §1–2 e §6–7, core/00 §4–5, ui/telas/mods.md, ui/telas/dialogos.md (DLG-04/05/07), references/vortex/VORTEX-03 e VORTEX-13 §1.
Antes de codificar o Extractor, registre decisão sobre biblioteca/binário de extração (formatos, licença, segurança).
Implemente o pipeline de import completo com fila, lock por instância, duplicados/variantes, resolução de root, instaladores basic e do adapter, reinstalar, remover, atributos, categorias, e a tela Mods sem prioridade.
Crie as lacunas L3/L4 na lib se ainda faltarem.
Não implemente FOMOD (F10) nem deploy (F7).
Invariantes: INV-ID-03/04, INV-LIB-04/05, INV-OPS-02.
```

## F5: Profiles e ordem de mods

```text
Aplique prompts/00-protocolo.md. Fase: F5.
Leia: core/07, core/05 §1–4, D025/D026/D028/D029/D037, ui/telas/profiles.md, ui/telas/mods.md §5.2–5.3, ui/telas/dialogos.md (DLG-11/19–22).
Implemente profiles (ciclo de vida, comparar, transferir, snapshots), ModOrder com separadores, OrderRules com recusa de ciclo e prévia por profile, arrastar com recusa + alternativas (lacuna L2 na lib), histórico reversível de ordem, select de profile na topbar.
Invariantes: INV-ORD-01..04, INV-ORD-06.
```

## F6: Conflitos

```text
Aplique prompts/00-protocolo.md. Fase: F6.
Leia: core/05 §5–9, D004/D027, ui/telas/conflicts.md, ui/telas/mods.md (indicadores, Inspector › Conflitos/Arquivos), ui/telas/dialogos.md (DLG-08/09/10/12), references/vortex/VORTEX-05, references/mo2/MO2-01.
Implemente cálculo incremental com metas de desempenho, redundância, overrides, exclusões, revisão, override_stale, tela Conflicts e editores.
Nunca crie regra automaticamente por existir conflito.
Invariantes: INV-CON-01..04.
```

## F7: Deploy e purge

```text
Aplique prompts/00-protocolo.md. Fase: F7.
Leia: core/04 inteiro, core/09 §2–3, core/14 §5, D033–D036, references/vortex/VORTEX-04 e VORTEX-13 §3–5, ui/telas/dialogos.md (DLG-14/16/17/18).
Implemente scan, plano, journal, apply em ordem segura, verify, commit, marcadores, backups de originais, purge, métodos com motivo de indisponibilidade, mover staging, auto-deploy seguro, status de deploy, recuperação de deploy interrompido.
Detecte external changes e bloqueie os caminhos afetados; a triagem completa é F8.
Teste de interrupção automatizado (kill em pontos aleatórios) é obrigatório nesta fase.
Invariantes: INV-DEP-01..09, INV-EXT-01.
```

## F8: Alterações externas

```text
Aplique prompts/00-protocolo.md. Fase: F8.
Leia: core/09, D008/D046, references/vortex/VORTEX-08 e VORTEX-13 §6–7, ui/telas/dialogos.md (DLG-15).
Implemente classificação completa, diálogo com ação por linha, captura de arquivos gerados, "deixar não gerenciado", scan ao focar.
Invariantes: INV-EXT-02/03.
```

## F9: Dependências e diagnósticos

```text
Aplique prompts/00-protocolo.md. Fase: F9.
Leia: core/06, core/10, D014/D027, ui/telas/diagnostics.md, ui/telas/dashboard.md, references/vortex/VORTEX-11.
Implemente HealthChecks do catálogo (exceto plugins), supressão, notificações (agregação, sino, desktop), histórico com reversão, pacote de diagnóstico, tela Diagnostics e faixas de problemas.
Invariantes: INV-OPS-06.
```

## F10: FOMOD

```text
Aplique prompts/00-protocolo.md. Fase: F10.
Leia: core/03 inteiro, D030, ui/telas/dialogos.md (DLG-06).
Implemente parser seguro, avaliador de condições puro, plano determinístico, assistente, reinstall com escolhas, e fixtures de ao menos 10 FOMODs reais.
Nunca execute script C#.
```

## F11: Plugins e load order

```text
Aplique prompts/00-protocolo.md. Fase: F11.
Leia: core/08, core/12 §5–9, D006/D029/D040/D041, ui/telas/plugins.md, ui/telas/load-order.md, ui/telas/dialogos.md (DLG-23/24/25), references/vortex/VORTEX-06 e VORTEX-13 §2 e §7.
Implemente inventário, cabeçalhos com cache, estado por profile, restrições do adapter, sort nativo com prévia, auto-sort, regras, grupos, locks, serialização de plugins.txt no pós-deploy com triagem de alteração externa, diagnósticos de plugins e as duas telas.
Não use LOOT (V1.x). Nenhuma regra Bethesda fora do adapter.
Invariantes: INV-PLG-01..03.
```

## F12: Settings, Dashboard, Overview, Launch

```text
Aplique prompts/00-protocolo.md. Fase: F12.
Leia: core/13, core/11 §6, core/04 §9, core/14 §3–4, ui/telas/settings-extensions.md, dashboard.md, overview.md, dialogos.md (DLG-26/27), references/vortex/VORTEX-09.
Implemente todas as abas de Settings V1 com defaults do catálogo, Extensions (embutidos), Dashboard com dashlets, Overview, Play com pré-lançamento, backups/restauração.
Não mostre abas/itens reservados.
```

## F13: Polimento de UX

```text
Aplique prompts/00-protocolo.md. Fase: F13.
Leia: ui/00–04, todos os ui/telas, ui/02-fluxos-ux.md.
Revise todas as telas com ui-review: teclado, estados vazios/erro/ocupado, textos en/pt-BR, contraste, densidade. Sem funcionalidade nova.
```

## F14: Hardening

```text
Aplique prompts/00-protocolo.md. Fase: F14.
Leia: core/14, 00-visao-e-escopo.md (requisitos não funcionais), docs-ia/02-invariantes.md.
Testes de interrupção, corrupção, permissões, arquivos travados, volumes, caminhos perigosos (fuzz), migrations antigas, benchmarks de escala. Sem feature nova. Relate números.
```

## F15: Release V1.0

```text
Aplique prompts/00-protocolo.md. Fase: F15.
Leia: plano-de-desenvolvimento.md › F15, references/vortex/VORTEX-12 (checklist de paridade), core/12 (itens "(verificar)").
Empacotamento, assinatura, atualização opt-in, notas de versão, checklist de paridade marcado item a item.
```
