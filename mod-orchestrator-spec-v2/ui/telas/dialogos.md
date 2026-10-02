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

## Detalhes dos principais

### DLG-01 Gerenciar jogo (F3)
Modal largo com `Stepper` horizontal (Instalação → Pastas → Verificação → Concluir). **Instalação**: pasta do jogo (campo + "Procurar…" pelo seletor nativo), validada pelo backend ao sair do campo ou escolher a pasta (recusa com o motivo, botão Avançar desabilitado), e nome da instância. **Pastas**: staging, arquivos e backups sugeridos no volume do jogo, cada um com "Alterar…". **Verificação**: problemas bloqueantes (vermelho), avisos (amarelo, ex.: hardlink indisponível), implantação de outro gerenciador (aviso, não bloqueia) e a escolha do método; hardlink vem marcado só se disponível, cópia nunca vem marcada, e "Gerenciar jogo" fica desabilitado até haver método. **Concluir**: progresso, sucesso e "Abrir workspace". Esc/fechar ficam bloqueados enquanto a instância está sendo criada.

### DLG-02 Jogo genérico (F3)
Nome, pasta do jogo, lista editável de targets (id em minúsculas + pasta relativa à raiz; o primeiro é o padrão) e executável opcional. "Avançar" chama a verificação do backend e, sem problemas, abre o DLG-01 já em "Pastas".

### DLG-03 Parar de gerenciar (F3)
Duas opções exclusivas: manter staging e arquivos (padrão) ou apagá-los; apagar exige digitar o nome da instância. Instância com algo implantado mostra o aviso e o botão fica desabilitado (o backend também recusa) até o purge existir (F7).

### DLG-06 Assistente FOMOD
- Cabeçalho: imagem e nome do módulo; passo N de M (só visíveis).
- Coluna esquerda: lista de passos (Stepper vertical), navegável para passos já visitados.
- Centro: grupos do passo; `SelectExactlyOne`/`SelectAtMostOne` = Radio (AtMostOne com opção "Nenhum"); `SelectAtLeastOne`/`SelectAny` = Checkbox; `SelectAll` = Checkbox travados. Opções `Required` travadas marcadas; `NotUsable` desabilitadas com tooltip do motivo; `Recommended` com tag "Recomendado".
- Direita: imagem (MediaImage, clique abre Lightbox) e descrição da opção em foco/hover.
- Rodapé: Cancelar · Voltar · Próximo / Instalar; validação do grupo mostrada inline ao tentar avançar.
- Reinstall: faixa "Escolhas anteriores carregadas" + botão "Instalar com as escolhas anteriores".
- Último passo → tela de resumo (arquivos por destino, avisos, requisitos detectados com checkbox "criar regra de requisito") → Instalar.
- Cada clique consulta o backend para reavaliar condições (a UI não avalia, anti-pattern 1); resposta deve ser < 50 ms percebidos.
- Implementação (F10): a UI envia só os grupos visitados (`FomodState`); visibilidade, tipos, padrões, travas, problemas e resumo vêm do backend. Requisitos detectados vêm desmarcados (INV-CON-02). Passos ainda não visitados ficam desabilitados no Stepper (D087).

### DLG-08 Editor de conflitos do mod
Tabela: mod oponente · arquivos em conflito · quem vence hoje e por quê · **select** "Este vence" / "O outro vence" / "Pela ordem (sem regra)" · link "arquivos…" (abre DLG-09 filtrado). Salvar cria/remove OrderRules e marca pares como revisados; prévia de movimentos na ordem se houver.

### DLG-14 Plano de deploy
Resumo por ação (criar, substituir, remover, backups de originais, restaurar backups, pastas) com contagens e espaço extra; seção "Precisa de decisão" com itens (external changes → abre DLG-15; fallback de método → select por grupo). Botões: Cancelar · Aplicar. Também acessível sem decisões pelo popover de status ("Ver o que o deploy vai fazer").

### DLG-15 Alterações externas
Grupos por tipo (Ausentes, Modificados, Substituídos, Novos, Load order). Linha: caminho, mod, detalhe antes/depois (tamanho, data), **select de ação** (core/09 §4). "Aplicar a todos deste grupo" por grupo. Para "Novos": escolha do destino da captura (mod novo com nome sugerido / mod existente). Botão primário: "Aplicar decisões" (continua a operação que estava aguardando) · "Cancelar operação".

### DLG-07 Remover mod(s)
Lista de mods; checkbox "Remover também os arquivos originais (archives)"; aviso se implantados e auto-deploy desligado; aviso de regras que ficarão órfãs (contagem). Primário destrutivo: "Remover".

### DLG-26 Pré-lançamento
Variações: "Deploy necessário: implantar e jogar" (primário) / "Jogar sem implantar"; "Problemas encontrados" (lista de avisos com ações) + "Jogar mesmo assim"; "Bloqueado" (só ações para resolver).
