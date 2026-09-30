# Tela: Profiles

Core: 07. Vortex: `profile_management` (ProfileView com cards por profile, ProfileEdit, TransferDialog, ações Enable/Edit/Clone/Remove, features por profile). Divergência 4 (sempre visível + select na topbar).

## 1. Objetivo

Criar e alternar configurações do jogo ativo, entender o que cada uma contém e comparar/transferir entre elas.

## 2. Layout

```
Toolbar: [Novo profile] [Comparar…] [Criar ponto de restauração]
Grid de cards (Card):
┌───────────────────────────────┐ ┌───────────────────────────────┐
│ ● Default          ATIVO      │ │   Survival                    │
│ 142 mods habilitados / 380    │ │ 210 / 380                     │
│ 287 plugins ativos            │ │ 301                           │
│ Implantado ✓ · usado há 2 min │ │ Não implantado · há 3 dias    │
│ [Saves locais] [Config. local]│ │                               │
│ Notas…                        │ │                               │
│ [Ativar] [Clonar] [⋯]         │ │ [Ativar] [Clonar] [⋯]         │
└───────────────────────────────┘ └───────────────────────────────┘
Seção "Pontos de restauração" do profile selecionado (tabela: data, motivo, [Restaurar])
```

Menu ⋯: Renomear, Editar notas, Transferir seleção para…, Comparar com…, Abrir pasta (quando houver arquivos locais), Excluir… (desabilitado para o ativo/último, com motivo).

Features (saves/config local) aparecem como switches no card **só** com capability (V1.x); na V1 não aparecem para Skyrim ainda.

## 3. Diálogos

- **Novo profile**: nome + "Começar de": vazio / cópia de <profile>.
- **Clonar**: nome; tabela do que é copiado e do que é compartilhado (core/07 §3) em texto curto.
- **Transferir seleção** (paridade TransferDialog): origem, destino, o que transferir (mods habilitados / ordem / plugins), prévia de diferenças; cria snapshot do destino.
- **Comparar**: DiffViewer em três grupos (mods, plugins, load order) com "Transferir para…".
- **Excluir**: confirmação destrutiva com contagem de snapshots que vão junto.

## 4. Bridge

Consultas: `ProfileList(instance)` (com contagens e status de deploy), `ProfileCompare(a, b)`, `Snapshots(profile)`.
Comandos: `CreateProfile`, `CloneProfile`, `RenameProfile`, `DeleteProfile`, `ActivateProfile`, `TransferSelection`, `CreateSnapshot`, `RestoreSnapshot`, `SetProfileNotes`.

## 5. Critérios de aceite

- Trocar de profile pelo select da topbar a partir de qualquer tela do workspace.
- Card mostra claramente qual está ativo e qual está implantado (podem diferir).
- Excluir o ativo é impossível e explica por quê.
