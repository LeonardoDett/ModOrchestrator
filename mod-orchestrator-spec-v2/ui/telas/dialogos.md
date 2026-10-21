# Diálogos e assistentes

Catálogo único. Todo modal do produto está aqui; modal novo exige entrada. Padrões: `Modal`/`ConfirmDialog` da lib; título curto; botão primário à direita com o verbo da ação ("Instalar", não "OK"); Esc = cancelar (exceto quando cancelar tem efeito, aí pergunta); foco inicial no controle mais provável.

| ID | Diálogo | Aberto por | Tipo | Base Vortex | Core |
|---|---|---|---|---|---|
| DLG-01 | Gerenciar jogo | Games | assistente | GamePicker/PathSelection | 11 §4 |
| DLG-02 | Jogo genérico | Games | formulário | — | 11 §4 |
| DLG-03 | Parar de gerenciar | Games | confirmação destrutiva | "Stop managing" | 11 §4 |
| DLG-04 | Duplicado | import | decisão | DuplicatesDialog | 02 §6 |
| DLG-05 | Preparar instalação | import | decisão (árvore) | aviso "mod não parece ser para este jogo"; também FOMOD com script (`fomod_script`, D086) | 02 §4, 03 §7 |
| DLG-06 | Assistente FOMOD | import/reinstall | assistente | installer_fomod | 03 §5 |
| DLG-07 | Remover mod(s) | Mods | confirmação destrutiva | remove mod (+ archive) | 02 §7 |
| DLG-08 | Editor de conflitos do mod | Mods (ícone de conflito) | edição | editor de conflitos (select por mod) | 05 |
| DLG-09 | Escolher vencedor de arquivos | Mods (Inspector) / Conflicts | edição | file overrides (select por arquivo) | 05 §5.3 |
| DLG-10 | Gerenciar regras | Mods toolbar | edição | Manage Rules | 05 §2 |
| DLG-11 | Movimento recusado | arrastar/mover | popover de decisão (modal compacto, D072 item 2) | — | 05 §4 |
| DLG-12 | Resolver ciclo | diagnóstico | edição | cycle dialog | 05 §6 |
| DLG-13 | Categorias | Mods toolbar | edição (árvore) | CategoryDialog | 02 §10 |
| DLG-14 | Plano de deploy | deploy com decisões / popover | revisão | — (divergência 8) | 04 §4 |
| DLG-15 | Alterações externas | deploy/purge/diagnóstico | decisão por linha | ExternalChangeDialog | 09 §6 |
| DLG-16 | Resultado de deploy com falhas | toast | informação + ação | FixDeploymentDialog | 04 §5 |
| DLG-17 | Purge | Mods toolbar | confirmação | Purge | 04 §6 |
| DLG-18 | Mover staging / trocar método | Settings › Mods | operação com prévia | Moving mod staging folder | 04 §10 |
| DLG-19 | Novo/Clonar profile | Profiles | formulário | ProfileEdit | 07 |
| DLG-20 | Transferir seleção | Profiles | decisão com prévia | TransferDialog | 07 §2 |
| DLG-21 | Comparar profiles | Profiles | informação | — | 07 §5 |
| DLG-22 | Excluir profile | Profiles | confirmação destrutiva | Remove profile | 07 §2 |
| DLG-23 | Regras de plugins | Plugins | edição | UserlistEditor | 08 §6 |
| DLG-24 | Grupos de plugins | Plugins | edição | GroupEditor | 08 §6 |
| DLG-25 | Prévia de sort | Load Order | revisão | — | 08 §5 |
| DLG-26 | Pré-lançamento | Play | decisão | preStartDeployHook | 04 §9 |
| DLG-27 | Restaurar backup | Settings › Workarounds | confirmação destrutiva | Restore | 14 §4 |
| DLG-28 | Renomear instância | Games | formulário | — (rename do perfil do jogo) | 11 §4 |
| DLG-29 | Alterar localização | Games | formulário com validação | PathSelection | 11 §4 |
| DLG-30 | Atualizar o app | Settings › Aplicação › Atualizações | decisão com notas de versão e progresso | updater | `plano-de-publicacao.md` etapa 6, D104 |
| DLG-31 | Importar de outro gerenciador | fim do Gerenciar jogo; Mods › Importar › De outro gerenciador… | decisão com escolha por parte | `mo-import` | 02 §10a, D128 |
| DLG-32 | Copiar ou mover saves | Saves | decisão (destino, copiar ou mover) | TransferSavesDialog (MO2) | 07 §7, D142, `ui/telas/saves.md` §5 |

## Detalhes dos principais

### DLG-01 Gerenciar jogo (F3)
Modal largo com `Stepper` horizontal (Instalação → Pastas → Verificação → Concluir). **Instalação**: pasta do jogo (campo + "Procurar…" pelo seletor nativo), validada pelo backend ao sair do campo ou escolher a pasta (recusa com o motivo, botão Avançar desabilitado), e nome da instância. **Pastas**: staging, arquivos e backups sugeridos no volume do jogo, cada um com "Alterar…". **Verificação**: problemas bloqueantes (vermelho), avisos (amarelo, ex.: hardlink indisponível), implantação de outro gerenciador (aviso, não bloqueia) e a escolha do método; hardlink vem marcado só se disponível, cópia nunca vem marcada, e "Gerenciar jogo" fica desabilitado até haver método. **Concluir**: progresso, sucesso e "Abrir workspace". Esc/fechar ficam bloqueados enquanto a instância está sendo criada.

### DLG-02 Jogo genérico (F3)
Nome, pasta do jogo, lista editável de targets (id em minúsculas + pasta relativa à raiz; o primeiro é o padrão) e executável opcional. "Avançar" chama a verificação do backend e, sem problemas, abre o DLG-01 já em "Pastas".

### DLG-03 Parar de gerenciar (F3)
Duas opções exclusivas: manter staging e arquivos (padrão) ou apagá-los; apagar exige digitar o nome da instância. Instância com algo implantado mostra o aviso e o botão fica desabilitado (o backend também recusa) até o purge existir (F7).

### DLG-06 Assistente FOMOD
Redesenho v1 (pranchas `JogoFomod` e `JogoFomodResumo`, RD10, D127). Modal de 1160 × 800: cabeçalho de 76 px, colunas fixas de 230 px (passos), centro e 340 px (detalhe), rodapé de 64 px.
- Cabeçalho: imagem do módulo (clique amplia), nome e "Passo N de M" (só os visíveis) ou "Resumo", e fechar. Fechar (X ou Esc) só fecha: a importação continua na fila esperando as escolhas; quem descarta é "Cancelar importação".
- Opções em linhas de 44 px com borda (marcada na cor da marca); selos à direita.
- Reinstalação: faixa "As escolhas da instalação anterior foram carregadas" com "Instalar com as escolhas anteriores".
- Coluna esquerda: passos (Stepper vertical), cada passo já visitado com uma linha do que foi escolhido; passos ainda não visitados ficam desabilitados (D087); nota de que passos aparecem e somem conforme as escolhas.
- Centro: grupos do passo com o tipo de seleção dito por extenso ("Escolha uma", "Escolha quantas quiser"...). `SelectExactlyOne`/`SelectAtMostOne` = Radio (AtMostOne com "Nenhum"); `SelectAtLeastOne`/`SelectAny` = Checkbox; `SelectAll` e `Required` travados marcados; `NotUsable` desabilitado com o motivo; `Recommended` com selo "Recomendado". Na reinstalação a opção escolhida antes leva o selo "Escolha anterior". Opção com imagem leva um ícone de imagem.
- Direita: imagem e descrição da opção em foco ou sob o mouse; sem imagem, só o texto.
- Resumo (último passo): "Suas escolhas" por passo e grupo, com "Escolha anterior" e "Alterar" (volta ao passo); avisos; requisitos declarados com checkbox "Criar regra de requisito", desmarcado (INV-CON-02). À direita, os dois números (arquivos e espaço em disco), "Arquivos por destino" com o target da definição da instância (vem do backend; nunca um nome fixo) e "Organizar este mod": categoria e tags que o mod recebe ao concluir a instalação (B10, D124).
- Rodapé: Cancelar importação · Voltar · Próximo / Instalar; validação do grupo inline ao tentar avançar.
- Cada clique consulta o backend para reavaliar condições (a UI não avalia, anti-pattern 1); resposta < 50 ms percebidos.
- Implementação (F10, RD10): a UI envia só os grupos visitados (`FomodState`); visibilidade, tipos, padrões, travas, problemas, resumo e target vêm do backend. FOMOD é instalador de formato e vale para qualquer jogo que tenha o arquivo (teste com instância `generic` de dois targets).

### DLG-08 Editor de conflitos do mod
Tabela: mod oponente · arquivos em conflito · quem vence hoje e por quê · **select** "Este vence" / "O outro vence" / "Pela ordem (sem regra)" · link "arquivos…" (abre DLG-09 filtrado). Salvar cria/remove OrderRules e marca pares como revisados; prévia de movimentos na ordem se houver.

### DLG-14 Plano de deploy
Resumo por ação (criar, substituir, remover, backups de originais, restaurar backups, pastas) com contagens e espaço extra; seção "Precisa de decisão" com itens (external changes → abre DLG-15; fallback de método → select por grupo). Botões: Cancelar · Aplicar. Também acessível sem decisões pelo popover de status ("Ver o que o deploy vai fazer").

### DLG-15 Alterações externas
Grupos por tipo (Ausentes, Modificados, Substituídos, Novos, Load order). Linha: caminho, mod, detalhe antes/depois (tamanho, data), **select de ação** (core/09 §4). "Aplicar a todos deste grupo" por grupo. Para "Novos": escolha do destino da captura (mod novo com nome sugerido / mod existente). Botão primário: "Aplicar decisões" (continua a operação que estava aguardando) · "Cancelar operação".

### DLG-07 Remover mod(s)
Lista de mods; checkbox "Remover também os arquivos originais (archives)"; aviso se implantados e auto-deploy desligado; aviso de regras que ficarão órfãs (contagem). Primário destrutivo: "Remover".

### DLG-31 Importar de Vortex ou MO2 (pranchas `ImportarOferta`, `ImportarEscolha`; D128)
Oferta (1080×780, coluna da direita de 400 px): cabeçalho com o monograma e a pasta do jogo; "Este jogo já tem mods de outro gerenciador"; um cartão de rádio por fonte encontrada (monograma, nome, pasta dos mods e chips: mods e ativos, ordem com separadores, regras, perfis, plugins); faixa de aviso quando o outro gerenciador ainda tem arquivos implantados (D035); "Importar tudo do X" (tudo menos categorias, todos os perfis), "Escolher o que importar" e "Começar do zero" (no Gerenciar jogo) ou "Apontar a pasta" (em Mods). Coluna "O que vem do X" pelas partes que a fonte tem, e "O que não vem" (escolhas dos instaladores, downloads, saves).
Escolha (coluna da direita de 360 px): partes como linhas com caixa e ícone (Mods com "Escolher mods", Ordem e separadores, Regras, Plugins e ordem de carga, Categorias desligada); perfis num grupo com "Ativo no X" e "usado há…"; resumo "Vai ser importado" (mods, regras, perfis, plugins), espaço em disco e o aviso de implantação; "Importar e abrir o jogo" e "Voltar". O progresso é a operação `import_manager` na gaveta de operações. Plugins e ordem de carga só aparecem quando o backend lista a parte (jogo com `plugins`).

### DLG-26 Pré-lançamento
Variações: "Deploy necessário: implantar e jogar" (primário) / "Jogar sem implantar"; "Problemas encontrados" (lista de avisos com ações) + "Jogar mesmo assim"; "Bloqueado" (só ações para resolver).
