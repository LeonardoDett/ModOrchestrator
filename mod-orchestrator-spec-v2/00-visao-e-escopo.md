# Visão e escopo

## Visão

Um gerenciador de mods para PC que entrega **tudo o que o Vortex entrega para quem instala mods a partir de arquivos locais**, com o isolamento e a clareza de prioridade do MO2, e que resolve os pontos em que ambos falham:

| Dor no Vortex / MO2 | Como o Mod Orchestrator resolve |
|---|---|
| Vortex: a ordem dos mods é invisível (só regras); ciclos aparecem com frequência e o diálogo de ciclo é difícil. | Ordem explícita e visível + regras como restrições, com movimento mínimo e explicação (D025). Ciclos recusados na criação (D028). |
| Vortex: conflito sem regra interrompe o fluxo e força decisão sem contexto. | Todo conflito tem vencedor determinístico e explicado; revisão é opcional e informativa (D027). |
| Vortex: troca de profile faz purge + deploy completo (lento, arriscado). | Deploy sempre por diff entre desejado, aplicado e observado (D033). |
| Vortex: deploy não mostra antes o que vai fazer. | Plano de deploy inspecionável; auto-deploy nunca decide (D036). |
| Vortex: `.vortex_backup` espalhados na pasta do jogo. | Originais em BackupStore fora da pasta do jogo (D034). |
| Vortex/MO2: deploy interrompido deixa estado incerto. | Journal + recuperação por reconciliação (D035). |
| MO2: VFS por injeção quebra ferramentas e exige lançar tudo pelo gerenciador. | Links reais (hardlink/symlink), jogo e ferramentas funcionam sem o gerenciador aberto. |
| MO2: a ordem não guarda o porquê. | Regras persistidas explicam cada restrição; histórico e pontos de restauração. |
| Ambos: diagnóstico espalhado entre notificações, logs e diálogos. | Um modelo único: HealthCheck → Diagnostic → ação → revalidação (core/10). |
| Ambos: arquivos gerados por ferramentas somem ou poluem. | Captura de arquivos gerados para mods, sem apagar nada (D046). |
| Vortex: telas carregadas, pouco explicativas. | UX de triagem: o que impede o setup de funcionar aparece primeiro (D014). |

## Público

1. **Jogador intermediário** que instala dezenas a centenas de mods de Skyrim a partir de arquivos baixados e quer que "funcione", entendendo o que está acontecendo quando não funciona.
2. **Usuário avançado / modlist builder** que gerencia 500 a 2000 mods, com muitos conflitos intencionais, patches e ferramentas geradoras (xEdit, Nemesis, BodySlide, DynDOLOD).
3. **Usuário vindo do Vortex ou do MO2**, que precisa reconhecer a interface e os conceitos sem reaprender tudo.

## Releases

### V1.0: paridade Vortex para arquivos locais

Plataforma: Windows 10/11 x64 (D039). Adapters: `generic` e `skyrimse` (D031). Idiomas: en, pt-BR (D044).

| Área | Incluído na V1.0 |
|---|---|
| Jogos | Descoberta (Steam, GOG, Epic, registro), localização manual, jogo genérico definido pelo usuário, múltiplas instâncias, parar de gerenciar (com purge), esconder, abrir pastas. |
| Biblioteca | Importar ZIP/7Z/RAR e pastas; arrastar e soltar vários; fila de instalação; ArchiveStore; detecção de duplicados e variantes; resolução de root; mod types; reinstalar; remover (com ou sem archive); atributos editáveis; categorias hierárquicas; notas e destaque; conteúdo detectado (plugins, texturas, scripts...). |
| Instaladores | Básico (archive-as-is com resolução de root), FOMOD XML completo (D030), instaladores declarados pelo adapter (ex.: SKSE para a raiz). |
| Profiles | Criar, renomear, clonar, excluir, ativar, comparar, transferir seleção entre profiles, pontos de restauração. |
| Ordem e regras | ModOrder com separadores, regras vence/perde, requer/recomenda, incompatível, motor com movimento mínimo. |
| Conflitos | Cálculo por arquivo, redundância, overrides por arquivo, exclusão de arquivos, revisão, tela dedicada e editor por mod. |
| Deploy | Hardlink/symlink/cópia, plano, journal, verificação, manifesto, backups de originais, purge, auto-deploy seguro, deploy antes de lançar, limpeza de pastas vazias, mover staging. |
| Alterações externas | Detecção, triagem por arquivo, captura de arquivos gerados, alteração externa de `plugins.txt`. |
| Plugins | Inventário, ativar/desativar, flags (ESM/ESL/light), masters faltando/fora de ordem, limites, sort nativo, regras, grupos, locks, auto-sort, ativar automaticamente plugins adicionados fora. |
| Diagnóstico | Health checks com catálogo estável, central de notificações, supressão, histórico com filtro e desfazer quando possível, log técnico, pacote de diagnóstico para suporte. |
| Launch | Botão Play do jogo com checagem pré-lançamento (D045). |
| Settings | Catálogo de `core/13-settings.md` marcado V1. |
| Recuperação | Backups do banco (automático e manual), restauração, recuperação de deploy interrompido. |

### V1.x: aprofundamento sem mudar contratos

- Saves por profile e tela Saves (capability `save_games`).
- Configurações de jogo (INI) por profile (capability `game_settings`).
- Dados do LOOT como provedor de restrições e mensagens (D041).
- Conflitos dentro de BSA/BA2.
- Importar setup do MO2 e do Vortex.
- Hotbar de ferramentas externas (Tools) com lançamento e captura de saída.
- Mais adapters (Fallout 4, Starfield, jogos sem plugins como Cyberpunk 2077, Baldur's Gate 3 com load order própria).
- Visualização em grafo de regras/grupos (depende de componente na dettmann-ui).

### V2: providers

- Downloads (Nexus e outros), links `nxm://`, verificação de atualizações, metadados online.
- Coleções (criar e instalar).
- Extensões de terceiros carregadas em runtime, com manifesto, permissões e versionamento.
- Conta/login de providers.

### Fora de escopo (sem previsão)

- VFS por injeção (modelo MO2): contraria a decisão de links reais.
- Executar scripts C# de FOMOD.
- Edição de plugins (xEdit) ou de BSA.
- Sincronização em nuvem como requisito.

## Requisitos não funcionais

| Tema | Requisito V1.0 |
|---|---|
| Escala | 2.000 mods, 500.000 arquivos implantados, 3.000 plugins sem degradação perceptível. |
| Desempenho | Abertura do app < 3 s com 1.000 mods. Recalcular conflitos após habilitar 1 mod < 500 ms com 200.000 Locations. Deploy incremental de 1 mod < 2 s. Deploy inicial de 100.000 hardlinks < 60 s em SSD. Listas virtualizadas, rolagem fluida. |
| Confiabilidade | Nenhum arquivo não gerenciado perdido em qualquer interrupção (queda de energia, kill do processo) em qualquer etapa. Testado em F14. |
| Segurança | Nada do archive é executado. Proteção contra zip-slip, links simbólicos em archives, nomes reservados, caminhos longos. Nenhuma elevação de privilégio exigida para hardlink/cópia. |
| Acessibilidade | Todas as ações por teclado, foco visível, contraste AA no tema escuro, status nunca só por cor. |
| Privacidade | Nenhuma telemetria na V1. Nenhuma chamada de rede na V1, exceto verificação de atualização do próprio app se habilitada. |
| Observabilidade | Log técnico rotativo, pacote de diagnóstico exportável (logs + estado resumido, sem dados pessoais além de caminhos). |
