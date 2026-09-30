# Diagnóstico, notificações e logs

## Log técnico

Cada operação deve registrar timestamp, operação, entidade, etapa, resultado, erro técnico e contexto.

## Diagnóstico

Um diagnóstico é uma abstração de produto:

- `id`;
- severity;
- title;
- summary;
- evidence;
- impact;
- suggested actions;
- blocking/non-blocking;
- related entities.

## Notificação

Notificação é um canal de entrega de diagnóstico/evento. Deve possuir estado lido/suprimido e link para a tela correta.

## Histórico

Histórico deve permitir filtrar ações por jogo, profile, mod e período. A UI do Vortex oferece histórico relacionado a ações de mods; isso deve ser preservado como conceito, sem copiar sua implementação.
