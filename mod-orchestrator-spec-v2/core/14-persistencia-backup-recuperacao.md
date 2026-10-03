# Persistência, backup e recuperação

Referências: D018, D019, D035; INV-OPS-01/03. Vortex: `recovery` (backups horários/manuais, restaurar, "from file"), `reconcileOrphanedArchive`, `dropMissingMods`. MO2: backups de modlist/plugins.

## 1. Onde vive cada coisa

| Dado | Local | Dono |
|---|---|---|
| Banco de estado | `<dataDir>/state.db` (+ WAL) | app |
| Backups do banco | `<dataDir>/backups/state-<timestamp>.db` | app |
| Logs | `<dataDir>/logs/` | app |
| Cache descartável | `<dataDir>/cache/` (cabeçalhos de plugins, hashes) | app |
| Staging, ArchiveStore, BackupStore | pastas da instância (core/11 §4) | instância |
| Marcadores | staging e targets (D035) | instância |

`dataDir` nunca contém arquivos de mods (D018).

## 2. Banco

- SQLite em modo WAL, `foreign_keys=ON`, `synchronous=FULL` para transações de manifesto/journal (durabilidade acima de velocidade nesses pontos).
- Migrations numeradas e embutidas (D018). Cada migration testada com banco da versão anterior contendo dados reais de fixture.
- Banco com schema mais novo que o app: recusado com diagnóstico e ação "abrir pasta de backups".
- Antes de aplicar migrations: backup automático `pre-migration`.
- Integridade: `PRAGMA integrity_check` na inicialização após fechamento anormal; falha ⇒ tela de recuperação (§5).

## 3. Backups

| Tipo | Quando | Retenção |
|---|---|---|
| Automático | a cada 1 h de uso com mudanças, e na saída normal | últimos 24 + 1 por dia dos últimos 7 |
| Pré-migration | antes de migrar | últimos 3 |
| Manual | Settings › Workarounds › "Criar backup" | todos |
| Última inicialização bem-sucedida | após abrir sem erro | 1 |

Backup usa a API de backup online do SQLite (consistente mesmo com o app aberto). Falha de backup ⇒ diagnóstico `backup_failed`.

## 4. Restaurar

- Settings › Workarounds › "Restaurar…" lista backups com data e tipo; "Restaurar de arquivo (perigoso)" aceita um `.db` externo, validado (schema conhecido).
- Restaurar exige reinício; antes, faz backup do estado atual.
- Após restaurar: todas as instâncias ficam `unknown` (core/04 §7) até um scan; o manifesto restaurado pode não corresponder ao disco, então o próximo deploy tratará divergências como external changes (nada é apagado às cegas).

Como ficou (F12, D090): arquivos `state-<UTC>-<tipo>.db` (`auto`, `manual`, `pre_migration`, `startup`, `pre_restore`); automático só quando `total_changes()` mudou; restauração gravada em `<dataDir>/state.restore-pending.db` e aplicada antes de abrir o banco na inicialização seguinte; instâncias marcadas `not_verified` até um scan completo.

## 5. Recuperação de falhas

| Situação | Detecção | Tratamento |
|---|---|---|
| Operação interrompida | status `pending/running` na inicialização | vira `interrupted` (D019); dono do tipo aplica sua retomada (core/02 §3, core/04 §5) |
| Deploy/purge interrompido | journal presente | `deploy_interrupted` bloqueante + Reconciliar |
| Pastas temporárias órfãs | `.tmp/*`, `*.installing` na staging | removidas na inicialização (pertencem ao gerenciador pelo marcador da staging) |
| Mod na staging sem registro no banco | pasta com nome de ModID desconhecido | diagnóstico "pasta órfã na staging" com ações: reimportar como mod, apagar, ignorar |
| Mod no banco sem pasta na staging | Installation sem pasta | `staging_file_missing` para o mod inteiro; reinstalar se archive retido |
| Archive no ArchiveStore sem registro | arquivo desconhecido | listado em "Arquivos não importados" com ação importar/apagar (paridade `reconcileOrphanedArchive`) |
| Banco corrompido | integrity_check falha | tela de recuperação: restaurar último backup bom; última opção: "começar do zero preservando staging" (mods são redescobertos pelas pastas + marcadores, sem regras/ordem) |
| Banco perdido com jogo implantado | marcador do target existe, manifesto não | `foreign_deployment` com ação "Adotar" (core/04 §11) |

## 6. Critérios de aceite

- Matar o processo durante uma migration: ao reabrir, o banco está na versão anterior ou na nova, nunca no meio.
- Restaurar backup de 2 horas atrás e fazer deploy não apaga nenhum arquivo que o backup não registrava (vira external change).
- Banco apagado com Skyrim implantado: app detecta o marcador e oferece adoção; nenhum arquivo do jogo é removido.
