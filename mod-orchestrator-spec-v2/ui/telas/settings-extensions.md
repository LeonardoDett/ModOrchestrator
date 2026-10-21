# Telas: Settings e Extensions

Core: 13, 11 §7. Vortex: Settings (abas Interface, Vortex, Mods, Plugins, Download, Workarounds, Theme) e Extensions (lista, habilitar/desabilitar, embutidas, "Find more").

## Settings

### Layout (paridade Vortex)
Cabeçalho (prancha `Configuracoes`, RD17e): "Configurações" e, à direita, "As mudanças valem na hora, sem botão de salvar.". Abas horizontais: **Interface · Aplicação · Mods · Plugins\* · Soluções de problemas · Tema** (\* só se algum jogo gerenciado tem `plugins`; Download reservada e oculta, D013).

Cada aba: seções com título (ex.: Interface › "Idioma", "Automação", "Notificações", "Dashboard"; Mods › "Pastas", "Deploy", "Importação"), controles em linha (rótulo + descrição curta + controle). Controles: switch para bool, select para opções fixas, seletor de pasta com "Sugerir" e "Abrir" para caminhos, stepper numérico para limites.

Abas por jogo (Mods, Plugins): select do jogo gerenciado no topo, com o texto "A maioria das opções aqui é configurada por jogo".

Settings avançados aparecem só com `ui.advancedMode` (switch em Interface › Avançado).

Interface segue a prancha em duas colunas: à esquerda "Idioma e exibição" (Idioma, Datas relativas, Cabeçalhos compactos, Reduzir animações, Barra de título própria) e "Notificações" (Notificações do Windows; "Avisos que você mandou não mostrar" com "Voltar a mostrar"); à direita "Automação", com "Vale para [jogo]" no cabeçalho da seção (Implantar ao ativar ou desligar um mod, Ativar o mod ao instalar, Mostrar conflitos não revisados), e "Avançado" (Modo avançado). O que a prancha não tem saiu da aba: "Ocultar categoria de primeiro nível" foi para Mods › Exibição e a seção Dashboard para Aplicação. Toda seção tem o cabeçalho em faixa de estrutura (as abas não desenhadas adotam o mesmo).

Mudanças são aplicadas ao alterar (sem botão Salvar), exceto caminhos e método de deploy, que abrem diálogo de operação (mover staging, trocar método exige purge) com prévia de impacto e espaço necessário.

Aplicação › **Atualizações** (F15, D104): switch `app.updateCheck` (desligado por padrão, é a única chamada de rede), select `app.updateChannel`, linha com a versão instalada, o estado da última verificação e "Verificar agora" (desabilitado com o switch desligado) e, havendo versão nova, a linha "Versão X disponível" com "Ver novidades", que abre o DLG-30 (notas de todas as versões novas, tamanho, aviso de que o app fecha, progresso do download e o motivo de uma recusa).

Plugins › **Dados do LOOT** (LV2, D143), no padrão da seção Atualizações e só para jogo que o LOOT conhece: linha "Masterlist" com a cópia em uso (empacotada ou baixada, com a data; ou "desligados" pelo switch `plugins.lootProvider`) e "Atualizar masterlist" (única rede, só no clique; desabilitado sem o download no build); linha "Regras do usuário no LOOT" com o caminho do `userlist.yaml` encontrado e "Importar regras do LOOT" (toast com a contagem).

### Critérios de aceite
- Todo setting V1 de core/13 aparece na aba e seção indicadas.
- Settings que exigem reinício mostram aviso persistente com "Reiniciar agora".

## Extensions

### V1
Lista (DataTable) dos adapters embutidos: nome, versão, jogos suportados, capabilities, tipo "Embutido", estado "Ativo". Inspector com detalhes e capabilities. Texto informativo no topo: "Extensões de terceiros serão suportadas em uma versão futura." Sem botões de instalar/buscar/atualizar (anti-pattern 18).

### V2 (previsto)
Instalar de arquivo, habilitar/desabilitar, atualizar, permissões, reinício necessário, "Encontrar mais".
