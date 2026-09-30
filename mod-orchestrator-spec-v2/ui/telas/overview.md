# Tela: Overview do jogo

Core: 04, 05, 06, 08, 10. Sem equivalente no Vortex (divergência 5).

## 1. Objetivo

Porta de entrada do workspace de um jogo: "meu setup está pronto para jogar? se não, o que falta?".

## 2. Layout

```
Cabeçalho: arte do jogo · nome da instância · versão · loja · [▶ Play] [Deploy]
Faixa de estado: Profile "Default" · Implantado ✓ (há 5 min) · Método: hardlink
┌ Precisa de atenção ─────────────────────┐ ┌ Resumo ──────────────────────────┐
│ ⛔ 1 alteração externa   [Revisar]       │ │ Mods: 142 habilitados / 380       │
│ ⚠ 2 requisitos faltando  [Ver]          │ │ Plugins: 287 ativos (198 + 89 L)  │
│ ℹ 12 conflitos não revisados [Abrir]    │ │ Conflitos: 38 pares · 4 override  │
└─────────────────────────────────────────┘ │ Tamanho: 48 GB · Arquivos: 210k   │
┌ Atalhos ────────────────────────────────┐ └───────────────────────────────────┘
│ [Importar mod] [Abrir pasta do jogo]    │ ┌ Atividade recente (5) ────────────┐
│ [Abrir staging] [Verificar implantação] │ │ …                    [Histórico]  │
└─────────────────────────────────────────┘ └───────────────────────────────────┘
Reservado (não renderizado na V1): widgets de Saves e Ferramentas.
```

## 3. Bridge

Consulta única `InstanceOverview(instance)` com todos os números e diagnósticos resumidos; comandos reutilizados (Deploy, Launch, Import).

## 4. Critérios de aceite

- Todo número é clicável e leva à tela filtrada correspondente.
- Se nada precisa de atenção, a tela diz isso explicitamente.
