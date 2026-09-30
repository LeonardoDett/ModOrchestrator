# Tela: Diagnostics

Core: 10. Vortex: Health Check, notificações persistentes, HistoryDialog, diagnostic files / log viewer, support bundle. Divergência 3.

## 1. Objetivo

Um lugar para tudo que explica o estado: problemas atuais, o que aconteceu, operações e o log técnico.

## 2. Abas

### Problemas (padrão)
- Lista agrupada por severidade (Bloqueante, Erro, Aviso, Informação), filtros por módulo (Deploy, Conflitos, Regras, Plugins, Biblioteca, Jogo), busca.
- Linha: ícone + título (i18n) + sujeito (mod/plugin/caminho) + "novo" se surgiu desde a última visita.
- Inspector: resumo, **evidência** (lista estruturada: caminhos, regras, plugins), **impacto**, **ações** (botões), "Ignorar este" / "Não mostrar este tipo" (não disponível para bloqueante).
- Seção recolhível "Suprimidos (n)" com Reativar.
- Toolbar: "Verificar agora" (reroda health checks e scan leve), "Exportar pacote de diagnóstico".

### Histórico
- DataTable: quando, quem (usuário/automático), ação, alvo, profile. Filtros: jogo, profile, mod, tipo, período, origem.
- Ação "Reverter" nas entradas reversíveis (core/10 §3), com confirmação só se a reversão afetar mais de 10 itens.

### Operações
- Operações recentes e em curso (as mesmas do drawer), com steps, duração, resultado, erro estruturado e "Detalhes técnicos".

### Log
- LogViewer com filtro por nível/operação/texto, "Abrir pasta de logs", "Copiar seleção".

## 3. Bridge

Consultas: `Diagnostics(scope, filtros)`, `DiagnosticDetail(key)`, `History(filtros, página)`, `Operations(filtros)`, `LogTail(filtros)`.
Comandos: `RunHealthChecks`, `ExecuteDiagnosticAction(key, actionId)`, `SuppressDiagnostic`, `UnsuppressDiagnostic`, `RevertHistoryEntry`, `ExportSupportBundle`.

## 4. Critérios de aceite

- Todo diagnóstico mostra evidência e pelo menos uma ação (bloqueante/erro).
- Executar a ação atualiza a lista sem recarregar manualmente.
- Histórico filtrado por um mod mostra toda a vida dele (import → mudanças → remoção).
