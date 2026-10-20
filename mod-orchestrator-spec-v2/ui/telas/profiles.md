# Tela: Profiles

Core: 07. Vortex: `profile_management` (ProfileView com cards por profile, ProfileEdit, TransferDialog, ações Enable/Edit/Clone/Remove, features por profile). Divergência 4 (sempre visível + select na topbar).

## 1. Objetivo

Criar e alternar configurações do jogo ativo, entender o que cada uma contém e comparar/transferir entre elas.

## 2. Layout (prancha `JogoPerfis`, RD17c)

Cabeçalho da tela do jogo: "Perfis" com o chip "N perfis"; ações Comparar, Criar ponto de restauração e Novo perfil (principal).

Grade de cartões (3 por linha a 1440 px), cada um com:
- nome, "Ativo" (perfil ativo) e "Implantado" ou "Não implantado" (o perfil que está na pasta do jogo, do manifesto aplicado);
- dois números: mods ativos "de N" e plugins ativos (este só quando o jogo tem `plugins`);
- notas em até duas linhas, ou "Sem notas";
- uso: "Em uso agora, ativado há X" no ativo, "Usado há X" nos outros;
- rodapé: Ativar ("Em uso", desabilitado, no ativo), Clonar e ⋯.

O cartão selecionado tem o contorno forte; clicar escolhe de qual perfil são os pontos de restauração.

Faixa informativa quando o perfil ativo não é o implantado: "O perfil ativo é X, mas o que está na pasta do jogo ainda é o Y. Implante para o jogo usar o perfil ativo." com "Implantar".

"Pontos de restauração de X" com a ajuda "Guardam mods ativos, ordem e plugins. Os 20 mais recentes ficam guardados."; tabela Quando, Motivo, Criado por (Você no ponto manual, Automático nos outros) e Restaurar.

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
