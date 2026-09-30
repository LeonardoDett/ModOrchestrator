# Telas: Settings e Extensions

Core: 13, 11 §7. Vortex: Settings (abas Interface, Vortex, Mods, Plugins, Download, Workarounds, Theme) e Extensions (lista, habilitar/desabilitar, embutidas, "Find more").

## Settings

### Layout (paridade Vortex)
Abas horizontais: **Interface · Aplicação · Mods · Plugins\* · Workarounds · Tema** (\* só se algum jogo gerenciado tem `plugins`; Download reservada e oculta, D013).

Cada aba: seções com título (ex.: Interface › "Idioma", "Automação", "Notificações", "Dashboard"; Mods › "Pastas", "Deploy", "Importação"), controles em linha (rótulo + descrição curta + controle). Controles: switch para bool, select para opções fixas, seletor de pasta com "Sugerir" e "Abrir" para caminhos, stepper numérico para limites.

Abas por jogo (Mods, Plugins): select do jogo gerenciado no topo, com o texto "A maioria das opções aqui é configurada por jogo".

Settings avançados aparecem só com `ui.advancedMode` (switch em Interface › Avançado).

Mudanças são aplicadas ao alterar (sem botão Salvar), exceto caminhos e método de deploy, que abrem diálogo de operação (mover staging, trocar método exige purge) com prévia de impacto e espaço necessário.

### Critérios de aceite
- Todo setting V1 de core/13 aparece na aba e seção indicadas.
- Settings que exigem reinício mostram aviso persistente com "Reiniciar agora".

## Extensions

### V1
Lista (DataTable) dos adapters embutidos: nome, versão, jogos suportados, capabilities, tipo "Embutido", estado "Ativo". Inspector com detalhes e capabilities. Texto informativo no topo: "Extensões de terceiros serão suportadas em uma versão futura." Sem botões de instalar/buscar/atualizar (anti-pattern 18).

### V2 (previsto)
Instalar de arquivo, habilitar/desabilitar, atualizar, permissões, reinício necessário, "Encontrar mais".
