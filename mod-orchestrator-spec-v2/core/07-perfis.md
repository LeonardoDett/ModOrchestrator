# Perfis

Referências: D026, D033, D037; INV-ORD-01/02. Vortex: `profile_management` (ProfileView, ProfileEdit, TransferDialog, "Enable Profile Management"), `local-gamesettings`, `gamebryo-savegame-management` (saves por profile). MO2: profiles com ordem própria, INIs e saves locais.

## 1. Conceito

Profile é uma configuração nomeada de uma GameInstance: quais mods estão habilitados, em que ordem, quais plugins estão ativos e em que ordem, e (V1.x, por capability) quais configurações do jogo e saves usar. O conteúdo (mods, regras, overrides) é compartilhado (D026).

## 2. Ciclo de vida

| Ação | Regras |
|---|---|
| Criar | Nome único na instância. Opções: vazio (todos os mods desabilitados, ModOrder copiada do profile ativo para preservar posições) ou "a partir de" outro profile (= clonar). |
| Ativar | Troca o profile ativo da instância. Altera o desejado; deploy pendente (ou auto-deploy, D036). Nunca faz purge (D033). Bloqueada se a instância está ocupada. |
| Renomear | Livre. |
| Clonar | Ver §3. |
| Excluir | Não pode ser o ativo nem o último (INV-ORD-01). Confirmação destrutiva. Snapshots do profile vão junto. |
| Comparar | Consulta de diff entre dois profiles (§5). |
| Transferir seleção | Copia de A para B: mods habilitados (e opcionalmente ordem e plugins). Paridade com TransferDialog do Vortex. Gera Snapshot de B antes. |
| Exportar/Importar | V2 (formato de coleção). |

Não existe setting para "ligar" profiles (D037).

## 3. Clonagem: o que é copiado e o que é compartilhado

| Recurso | Clonar | Observação |
|---|---|---|
| ModEntries (habilitado) | copia | |
| ModOrder e separadores | copia | |
| PluginStates, LoadOrder, IndexLocks | copia | |
| Configurações locais do jogo (V1.x) | copia | arquivos copiados |
| Saves locais (V1.x) | **não** copia por padrão; opção "copiar saves" | saves podem ser grandes |
| Snapshots | não copia | |
| Mods, archives, instalações | compartilhado | pertence à instância |
| OrderRules, Dependency/Incompatibility, Overrides, Exclusions, PluginRules, Groups | compartilhado | D026 |
| Notas do profile | copia | |

## 4. Troca de profile e deploy

1. Usuário ativa B.
2. Desejado recalculado para B.
3. Status vira `pending` se desejado(B) ≠ aplicado.
4. Com auto-deploy: deploy por diff (só as diferenças entre A e B). Sem auto-deploy: topbar mostra "Deploy pendente".
5. Load order: `plugins.txt` é reescrito a partir da LoadOrder de B no `post` do deploy (core/08).
6. V1.x: configurações locais e namespace de saves são trocados no `post` do deploy (nunca em momento diferente, para o jogo não ver um estado misto).

Enquanto o deploy não acontece, o jogo reflete o profile anterior; a topbar deixa isso explícito ("Implantado: A · Ativo: B").

## 5. Comparação de profiles

Consulta que retorna: mods só habilitados em A, só em B, em ambos com prioridade diferente; plugins ativos diferentes; diferenças de load order (lista de movimentos). Exibida em modal com três colunas e ação "Transferir para…".

## 6. Snapshots (pontos de restauração)

- Automáticos antes de: transferir seleção, habilitar/desabilitar em lote > N mods (setting, padrão 10), sort de plugins que mova > N itens, reordenações grandes (core/05 §4), restaurar outro snapshot.
- Manuais: "Criar ponto de restauração" na tela Profiles.
- Restaurar: substitui ModEntries, ModOrder, PluginStates e LoadOrder do profile pelo snapshot; mods que não existem mais são ignorados com aviso; mods novos (não existiam) ficam desabilitados no fim.
- Retenção: últimos 20 automáticos por profile (setting) + todos os manuais.

## 7. Recursos por capability (V1.x)

- `game_settings`: o adapter declara quais arquivos (ex.: `Skyrim.ini`, `SkyrimPrefs.ini`, `SkyrimCustom.ini`) podem ser locais. Profile com "configurações locais" guarda cópia própria; o `post` do deploy aplica a cópia do profile ativo e guarda a anterior de volta no profile que estava aplicado. Edições feitas pelo jogo são capturadas de volta ao trocar (evidência por hash; divergência inesperada é external change).
- `save_games`: o adapter declara como redirecionar saves (Skyrim: `SLocalSavePath` no INI). Namespace por profile.

## 8. Erros

`profile_name_taken`, `profile_is_active`, `profile_last`, `profile_not_found`, `instance_busy`.

## 9. Eventos

`profile.created`, `profile.renamed`, `profile.cloned`, `profile.deleted`, `profile.activated`, `profile.transferred`, `snapshot.created`, `snapshot.restored`, `mod.enabled`, `mod.disabled` (com profile).

## 10. Critérios de aceite

- Trocar entre dois profiles que diferem em 3 mods toca apenas os arquivos desses 3 mods (e dos vencedores afetados).
- Clonar e depois criar uma regra no clone: a regra aparece no original (compartilhada).
- Excluir o profile ativo é impossível pela UI e pelo bridge.
- Restaurar snapshot devolve exatamente seleção e ordens anteriores.
