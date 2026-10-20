# Plano: lacunas do levantamento MO2/Vortex antes da v1

Status: **aprovado pelo usuário** (2026-10-20, D140). Origem: `propostas/2026-10-20-levantamento-mo2-vortex.md` (os IDs A1…B13 são de lá).

O usuário decidiu: **todos os itens entram antes da v1**, seguindo as sugestões do levantamento, e **o LOOT pode ser usado**. A ordem é alta, depois média, por último baixa.

## Regras para toda fase

- Uma thread por fase. Cada thread aplica `prompts/00-protocolo.md` (consult-ai-docs antes, maintain-ai-docs ao mudar contrato) e escreve o resumo de restrições antes de codar.
- Escopo de jogo (D112): cada fase diz o que é núcleo, capability ou adapter, e testa o caminho do adapter `generic` (sem a capability).
- Fatos de jogo só em `internal/adapters`; nome novo que um adapter precise entra no SDK (D134); recurso opcional entra por ponto de contribuição (D133).
- **Tela nova ou mudada**: a prancha aprovada é a especificação (D127). Se a fase precisa de tela que não existe no design v1, primeiro desenhar a prancha e pedir aprovação ao usuário; só então implementar e comparar por screenshot.
- Validação: `go vet ./... && go test ./...`, `npm --prefix frontend run typecheck`, `npm --prefix frontend test`, `wails build` quando tocar UI.
- Commit no `master` ao fechar cada passo e **push no `origin master` logo depois** de cada commit.
- Decisão nova em `docs-ia/decisoes.md`; atualizar `docs-ia/08-paridade-vortex-v1.md` quando um item DEFER virar presente.
- Só falar com o usuário para bloqueio, decisão ou resultado final; o progresso fica no checklist.

## Ordem e paralelismo

As três fases de alta prioridade podem rodar em paralelo (tocam áreas diferentes). As de média começam quando as de alta fecharem; as de baixa, quando as de média fecharem. Dentro de um nível, fases que tocam a mesma área (indicado em "Depende de") esperam a anterior.

## Alta prioridade

### LV1 — Instância única e BSA de outro jogo (A1, A2)
- **A1 (núcleo)**: `options.SingleInstanceLock` do Wails em `main.go` (também na janela de recuperação); a segunda abertura traz a primeira janela à frente e sai. Teste do callback e demonstração manual.
- **A2 (adapter `skyrimse`)**: ler a versão do cabeçalho de cada BSA carregado por plugin ativo (Vortex `archiveCheck.ts`: SE = 105, LE = 104); diagnóstico novo `archive_wrong_game` (erro) com o mod de origem e "Abrir pasta do mod". Código e textos vêm com o adapter (D131). Teste com BSA sintético de cada versão e com o `generic` (nenhum diagnóstico).
- Tamanho: pequeno.

### LV2 — LOOT como provedor de restrições e mensagens (A3)
- Emenda D041 (D140): entra antes da v1, ainda como **provedor de dados**, não como algoritmo; o sort continua o motor nativo (D029).
- Passo 0, antes de codar: revisão de licença da masterlist e do formato (`masterlist.yaml`, prelude, `userlist.yaml`) e de como obter a masterlist sem quebrar "nenhuma chamada de rede na V1" (00-visao-e-escopo): opções a apresentar ao usuário numa decisão — empacotar uma cópia por versão do app, baixar só sob ação explícita do usuário, ou ler a masterlist de uma instalação local do LOOT.
- Escopo: módulo provedor por ponto de contribuição (D133), ligado pela capability `plugins` e pelo setting `plugins.lootProvider` (core/13); o adapter `skyrimse` declara o id do jogo no LOOT. Usa: grupos e `after`/`req`/`inc` como restrições suaves com `source=loot`, mensagens e plugins sujos (ITM/UDR) como diagnósticos, `userlist.yaml` como importação de regras.
- Tela: Plugins/Load Order já mostram regras e diagnósticos; conferir na prancha se origem "LOOT" e mensagens cabem sem tela nova.
- Tamanho: grande.

### LV3 — Saves por perfil (A4)
- Capability `save_games` (core/07 §6, core/12 §10, core/15 "Saves"): namespace por perfil via `SLocalSavePath=Saves\<perfil>\` no `SkyrimCustom.ini`, trocado no `post` do deploy (core/07 §6); opção "copiar saves" ao clonar perfil.
- Tela Saves: cabeçalho `.ess` (personagem, nível, local, data, screenshot, plugins usados), plugins faltando com ação "habilitar os mods que fornecem", transferir/copiar entre perfis, excluir. Precisa de prancha aprovada (não existe no design v1).
- Escreve um INI do jogo: definir aqui o mínimo de `game_settings` que o LV8 depois completa (Depende: LV8 reaproveita).
- Tamanho: grande.

## Média prioridade

### LV4 — Ferramentas externas (M1)
Capability `tools` (core/15 "Ferramentas"): registro (executável, argumentos com variáveis, pasta de trabalho, ambiente, ícone, exclusivo, deploy antes), ferramentas conhecidas declaradas pelo adapter (xEdit, Wrye Bash, Nemesis/Pandora, BodySlide, DynDOLOD, Creation Kit), lançamento pela barra de título (D045) e scan de saídas ao fechar com oferta de captura (core/09). Prancha necessária.

### LV5 — Conflitos dentro de BSA/BA2 (M2)
Leitura do índice dos archives (adapter), conflitos archive × archive e archive × solto com a regra "solto vence archive" explicada; enquanto não houver cálculo, o texto da regra no detalhe do mod. Afeta conflitos e deploy só como informação. Conferir prancha de Conflitos.

### LV6 — Lançamento robusto (M3)
Núcleo: erro 740 → mensagem e opção de lançar elevado (ShellExecute `runas`); executável ou pasta de trabalho inexistente com mensagem própria. Contrato do adapter: campo opcional "lançar pela loja" (Steam/Epic/GOG) e "exige cliente da loja aberto", com o caminho sem o campo testado no `generic`. Depende: LV4 (mesmo serviço de lançamento).

### LV7 — Diagnósticos de conteúdo e de ambiente (M4, M5, M6, M7)
- M4 (`skyrimse`): ler `SKSE\skse64.log` ao fechar o jogo; DLLs que não carregaram viram diagnóstico com o mod de origem.
- M5 (núcleo + adapter): `mod_content_unrecognized` a partir das dicas de root e ContentFlags; ação "ignorar neste mod".
- M6 (núcleo + adapter): pasta do jogo, staging ou archives em OneDrive, Desktop, Documentos, Downloads ou Program Files; variante Game Pass (`WindowsApps`) recusada com mensagem. No assistente "Adicionar jogo", no "Mover staging" e como health check.
- M7 (`skyrimse`): `plugin_wrong_game_version` pelo `HEDR` (0.94 = LE).

### LV8 — Configurações do jogo por perfil e INI tweaks (M8, M11)
Capability `game_settings` (core/07 §6, core/12 §10): INIs por perfil trocados no `post` do deploy, INI tweaks trazidos pelos mods (escolha por mod, aplicados sobre o INI do perfil), e no contrato a lista "chaves exigidas" com health check e correção (necessária para Fallout 4/Oblivion; no Skyrim SE a lista é vazia). Depende: LV3.

### LV9 — Metadados por mod junto da staging (M9)
Fecha a pendência D100 / item 3 do trabalho futuro da F14. Passo 0: apresentar ao usuário o formato (referência: `meta.ini` do MO2) e pedir a decisão; depois gravar o arquivo em toda mudança de metadado e permitir reconstruir a biblioteca a partir da staging.

### LV10 — Pasta por mod no destino (M10)
Contrato do adapter: layout por ModType ("mesclar" ou "pasta por mod", com o nome da pasta derivado do mod e estável entre reinstalações). Deploy, conflitos (mods em pastas próprias não disputam) e importação do Vortex. Teste com um adapter de teste; nenhum jogo atual usa.

## Baixa prioridade

### LV11 — Telas de consulta (B1, B2)
Árvore final do jogo (o que o jogo vê e qual mod fornece cada arquivo) e abas do detalhe do mod: leia-me/textos, INIs (somente leitura ou editor), imagens. Prancha necessária.

### LV12 — Atalhos da lista de mods (B3, B4, B5)
"Enviar para" primeiro/último conflito; instalar acima, abaixo ou dentro de um separador; criar mod vazio; na instalação de um archive com mesmo nome, a opção "mesclar no mod existente" (com cópia de segurança opcional). Conferir menus na prancha de Mods.

### LV13 — Instaladores BAIN e archive aninhado (B6)
Instalador BAIN (subpacotes numerados com escolha múltipla e ordem) e archive dentro de archive (extrair e oferecer o interno). Diálogo novo precisa de prancha.

### LV14 — Skyrim e plugins de outros jogos (B7, B8, B9, B10)
- B7 (`skyrimse`): fontes do `fontconfig.txt` que não existem.
- B8: plugins `.ghost` no inventário (mostrar e reativar renomeando).
- B9: flags medium/blueprint, plugin sem registros e plugin com INI de mesmo nome no contrato (para Starfield), com limites por tipo.
- B10: load order por data de modificação no contrato `LoadOrderSupport` (Oblivion, Fallout 3/NV).
B9 e B10 só no contrato e com adapter de teste.

### LV15 — Plataforma (B11, B12, B13)
Migração de dados do usuário por versão do adapter (SDK); descoberta em Xbox/Game Pass, EA app e Ubisoft (só descoberta e aviso de suporte, sem Game Pass gerenciável); `panic` registrado com pilha no log técnico e incluído no pacote de diagnóstico.
