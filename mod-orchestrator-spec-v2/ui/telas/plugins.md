# Tela: Plugins

Core: 08, 12. Vortex: página Plugins do Gamebryo (`PluginList`, `PluginFlags`, `PluginFlagsFilter`, `PluginStatusFilter`, `MasterList`, `GroupEditor`, `UserlistEditor`, `LockIndex`, autosort, "Sort now"). Aparece só com capability `plugins`.

## 1. Objetivo

Inventário e estado dos plugins do profile ativo: quais existem, de onde vêm, quais estão ativos, quais têm problema e por quê. A **ordem** é trabalhada na tela Load Order (divergência 2); aqui a ordem aparece só como coluna informativa (índice).

## 2. Layout (prancha `JogoPlugins`, D127)

- Linha de cabeçalho de 76 px: "Plugins", chips "N de M ativos", um chip por limite do adapter ("Completos 198 de 254", "Light 89 de 4096"; com uma barra de uso âmbar a partir de 75 % e vermelha no limite) e "N com erro" em vermelho; à direita "Regras", "Grupos" e "Mais ações" (ativar todos, desativar todos, abrir a pasta do jogo, abrir a Ordem de carga).
- Linha de 48 px: "Buscar plugin ou mod" (280 px), "Filtros" (flags, origem, plugins de mods desabilitados), filtro rápido Todos / Ativos / Inativos / Com problemas com contagens; à direita "Ordenação automática" e "Ordenar agora".
- Tabela e, ao lado, o painel do plugin escolhido (330 px). Rótulos de flags e limites vêm do adapter; nada fixo no frontend.

## 3. Colunas

Ativo (switch; o do jogo fica travado ligado) · Índice (formato do adapter) · Plugin (nome, problema principal ao lado em vermelho, flags embaixo: as do adapter, "Do jogo, sempre ativo" e "Posição travada") · Grupo · Mod de origem (link para o mod; "Jogo base" ou "Não gerenciado" sem link). Linhas de 54 px. Mudar de grupo, travar e "Ver na ordem" ficam no menu da linha.

## 4. Painel do plugin

Nome e "de {mod} · índice X"; o problema com as ações que o resolvem; Masters com estado (ativo, inativo, ausente, carrega depois) e a ação que conserta (ativar, habilitar o mod); "Carrega depois de" com as regras (sua ou do provedor) e "+ Adicionar regra"; Dependentes; Posição (livre, travada, fixa do jogo); "Travar posição" e "Ver na ordem".

## 5. Multi-seleção

Ativar · Desativar · Definir grupo… · Travar posição / Destravar.

## 6. Diálogos

- **Regras de plugins** (paridade UserlistEditor): todas as regras da instância, por plugin, com origem.
- **Grupos** (paridade GroupEditor, em lista na V1): grupos, "depois de", plugins atribuídos; recusa de ciclo mostrada inline.

## 7. Estados

- Jogo sem capability: item não existe na sidebar.
- Nenhum plugin além dos implícitos: EmptyState explicando que plugins vêm de mods habilitados.
- Arquivo de load order alterado fora: faixa `load_order_external_change` no topo com "Revisar".

## 8. Bridge

Consultas: `PluginList(instance, profile, filtros)`, `PluginDetails(name)`, `PluginRules`, `PluginGroups`.
Comandos: `SetPluginsEnabled`, `SortPlugins`, `SetAutoSort`, `SetPluginGroup`, `CreatePluginRule`/`RemovePluginRule`, `CreateGroup`/`UpdateGroup`/`DeleteGroup`, `SetIndexLock`.

## 9. Critérios de aceite

- Plugin com master faltando é identificável sem abrir nada (ícone + contagem) e resolvível pelo Inspector.
- Contadores de limite sempre visíveis e corretos.
- Clicar no mod de origem leva à linha do mod.
