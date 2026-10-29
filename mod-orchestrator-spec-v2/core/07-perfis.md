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
| PluginStates, LoadOrder, IndexLocks | copia | ficam na seção `plugins` do perfil (D133); toda seção de módulo é copiada |
| Configurações locais do jogo (V1.x) | copia | arquivos copiados |
| Saves próprios (D142) | **não** copia por padrão; opção "Copiar os saves" (só se a origem tem saves próprios); o clone mantém saves próprios e, sem a cópia, começa vazio | saves podem ser grandes |
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
6. A pasta de saves do perfil é trocada no `post` do deploy (D142), e as configurações próprias e os INI tweaks também (D149): nunca em momento diferente, para o jogo não ver um estado misto. Exceção: ligar ou desligar "Saves próprios" no perfil que já está na pasta do jogo aplica na hora (os mods não mudam).

Enquanto o deploy não acontece, o jogo reflete o profile anterior; a topbar deixa isso explícito ("Implantado: A · Ativo: B").

## 5. Comparação de profiles

Consulta que retorna: mods só habilitados em A, só em B, em ambos com prioridade diferente; plugins ativos diferentes; diferenças de load order (lista de movimentos). Exibida em modal com três colunas e ação "Transferir para…".

## 6. Snapshots (pontos de restauração)

- Automáticos antes de: transferir seleção, habilitar/desabilitar em lote > N mods (setting, padrão 10), sort de plugins que mova > N itens, reordenações grandes (core/05 §4), restaurar outro snapshot.
- Manuais: "Criar ponto de restauração" na tela Profiles.
- Restaurar: substitui ModEntries, ModOrder, PluginStates e LoadOrder do profile pelo snapshot; mods que não existem mais são ignorados com aviso; mods novos (não existiam) ficam desabilitados no fim.
- Retenção: últimos 20 automáticos por profile (setting) + todos os manuais.

## 7. Recursos por capability (V1.x)

- `game_settings` (D149): o adapter declara os arquivos que um perfil pode ter próprios (Skyrim: `Skyrim.ini`, `SkyrimPrefs.ini`, `SkyrimCustom.ini`), as chaves exigidas e quais arquivos de um mod são INI tweaks. Perfil com "configurações próprias" (`features.localSettings`, desligado por padrão) guarda uma cópia de cada arquivo; o `post` do deploy põe no jogo a cópia do perfil implantado e devolve o que estava lá ao perfil dono (as edições do jogo ficam com ele); sem o recurso, os arquivos compartilhados. Chaves de outros módulos (pasta de saves) e dos tweaks são levadas de um arquivo ao outro. INI tweaks: desligados por padrão, ligados por mod, escritos chave a chave sobre o arquivo em uso (mod posterior vence); chave alterada fora do app vira `ini_tweak_external`. Chave exigida ausente vira `game_setting_required` com correção. O clone oferece copiar as configurações.
- `save_games` (D142): o adapter declara como redirecionar saves (`SaveRedirect`: arquivo, seção e chave; Skyrim: `SLocalSavePath` em `SkyrimCustom.ini`), quais arquivos são saves, os que vão junto e como ler o cabeçalho. "Saves próprios" (`features.localSaves`, desligado por padrão) faz o perfil salvar em `Saves\<id do perfil>\`; sem ele, o perfil usa a pasta compartilhada (o valor que a chave tinha antes do app). O app muda só a linha da chave, grava antes o valor pendente, guarda o arquivo original no BackupStore e devolve o original no purge. Chave alterada fora do app não é sobrescrita: diagnóstico `save_path_external` com "Usar a pasta do perfil". Ligar não move os saves compartilhados; desligar não apaga os do perfil.

## 8. Erros

`profile_name_taken`, `profile_is_active`, `profile_last`, `profile_not_found`, `snapshot_not_found`, `name_empty`, `instance_busy` (D069).

## 9. Eventos

`profile.created`, `profile.renamed`, `profile.cloned`, `profile.deleted`, `profile.activated`, `profile.transferred`, `profile.notes_changed`, `snapshot.created`, `snapshot.restored`, `mod.enabled`, `mod.disabled` (com profile).

## 10. Critérios de aceite

- Trocar entre dois profiles que diferem em 3 mods toca apenas os arquivos desses 3 mods (e dos vencedores afetados).
- Clonar e depois criar uma regra no clone: a regra aparece no original (compartilhada).
- Excluir o profile ativo é impossível pela UI e pelo bridge.
- Restaurar snapshot devolve exatamente seleção e ordens anteriores.
