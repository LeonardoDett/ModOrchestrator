# Tela: Saves

Core: 07 §3 e §7, 12 §10. D142. Vortex: `gamebryo-savegame-management` (lista, plugins faltando, transferir). MO2: `savestab.cpp`, `transfersavesdialog.cpp`. Aparece só com a capability `save_games`, no grupo Setup do menu do jogo, depois de Perfis.

## 1. Objetivo

Os saves do perfil ativo: de qual personagem, onde e quando foram feitos, se o perfil carrega os plugins que cada um usa, e levar saves para outro perfil. Responde também se o perfil tem pasta própria de saves ou usa a compartilhada, e liga ou desliga isso.

## 2. Layout (prancha `JogoSaves`, D127)

- Linha de cabeçalho de 76 px: "Saves", chips "N saves", "Personagens N" e, em âmbar, "N com plugins faltando" (só se o jogo tem plugins e há algum); à direita "Abrir pasta" e "Mais ações" (ler a pasta de novo, ir para Perfis).
- Faixa "Saves próprios de {perfil}" (ou "{perfil} usa a pasta compartilhada") com a explicação e a chave "Saves próprios" à direita.
- Linha de 56 px: "Buscar personagem ou local" (280 px), seletor de personagem, filtro rápido Todos / Com plugins faltando com contagens; à direita, com seleção, "N selecionados", "Copiar ou mover para…" e "Excluir".
- Tabela e, ao lado, o painel do save escolhido (340 px). O primeiro save abre no painel.

## 3. Colunas

Seleção (caixa; a do cabeçalho marca todos) · Captura (miniatura) · Personagem (nome; embaixo "Save 142 · Nível 34 · Nord · Dia 41", "Rápido" e "Automático" no lugar do número) · Local · Salvo em · Plugins ("N faltando" em âmbar ou "Todos ativos" em verde, sempre com ícone). Linhas de 54 px.

## 4. Painel do save

Captura, personagem, "Save 142 · Nível 34 · Nord"; Local, No jogo ("Dia 41, 14h20"), Salvo em, Arquivo; aviso "N plugins deste save não estão ativos" e a lista "Plugins faltando" (nome, "de {mod}, desabilitado" ou "nenhum mod instalado fornece", estado Inativo/Ausente); "Habilitar os N mods que fornecem" (habilita os mods e ativa os plugins); rodapé com "Copiar ou mover para…" e "Excluir". Save ilegível: o nome do arquivo e o motivo.

## 5. Diálogos

- **Copiar ou mover** (prancha `JogoSavesTransferir`): destino (os outros perfis; o que não tem saves próprios leva para a pasta compartilhada, e some da lista quando é a mesma pasta), Copiar ou Mover em cartões, aviso do backend com os nomes que mudam ("nada é substituído: … fica como X (2)") e que o co-save vai junto.
- **Excluir**: confirmação destrutiva (a exclusão não volta).
- **Clonar perfil** (DLG-19, prancha `JogoPerfisClonar`): aberto pelo "Clonar" do cartão, mostra "A partir de {perfil}", o nome e, quando a origem tem saves próprios, "Copiar os saves de {perfil}" com número e tamanho, **desmarcado por padrão** (core/07 §3; a prancha mostra o estado marcado).

## 6. Estados

- Jogo sem capability: item não existe no menu.
- Pasta sem saves: EmptyState que diz se é a pasta do perfil (o jogo ainda não salvou nele) ou a compartilhada.
- Filtros sem resultado: "Nenhum save com esses filtros" com "Limpar".
- Chave da pasta trocada fora do app: diagnóstico `save_path_external` em Diagnóstico, com "Usar a pasta do perfil".

## 7. Bridge

Consultas: `Saves(instance)`, `SaveScreenshot(instance, nome)` (PNG em data URL), `PreviewSaveTransfer`, `ProfileCopyOptions(perfil)`. Comandos: `SetLocalSaves`, `TransferSaves`, `DeleteSaves`, `EnableSaveProviders`, `OpenSavesFolder`, `CloneProfile`. A tela não calcula nada: plugins faltando, quem fornece, pastas e nomes novos vêm do backend; relê nos eventos.
