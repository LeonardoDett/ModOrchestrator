# Tela: Diagnostics

Core: 10. Vortex: Health Check, notificações persistentes, HistoryDialog, diagnostic files / log viewer, support bundle. Divergência 3.

## 1. Objetivo

Um lugar para tudo que explica o estado: problemas atuais, o que aconteceu, operações e o log técnico.

## 2. Abas

Cabeçalho da tela (prancha `JogoDiagnostico`, RD17d): "Diagnóstico" com chips de contagem (bloqueantes, em vermelho, só quando há; erros; avisos), "Exportar pacote de diagnóstico" e "Verificar agora" (principal; reroda health checks e scan leve). Abas Problemas (com a contagem), Histórico, Operações e Log.

### Problemas (padrão)
- Busca de 260 px e chips de área com contagem: Todos, Implantação, Conflitos, Regras, Plugins, Biblioteca, Jogo.
- Lista com grupos por severidade (Bloqueante, Erros, Avisos, Informações; cabeçalho de 34 px com ícone e contagem); linha de 58 px com título, sujeito (mod, plugin ou caminho), "Novo" se surgiu desde a última visita e a área. "Ignorados (n)" no pé da lista, recolhível, com Reativar.
- Detalhe ao lado (420 px): selo da severidade e título; **O que isso causa** (impacto e o que bloqueia); **O que encontramos** (evidências em cartões, quando foi encontrado); **Como resolver** (texto `diag.resolve.<código>` quando existe e os botões das ações, a primeira em destaque); no pé, "Ignorar este" / "Não mostrar este tipo", ou "Problemas bloqueantes não podem ser ignorados."

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
