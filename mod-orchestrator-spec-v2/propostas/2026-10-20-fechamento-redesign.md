# Fechamento do redesign (RD18)

Data: 2026-10-20. Fecha o plano `2026-10-14-plano-implementacao-redesign.md`. As fases RD0 a RD17 estão concluídas, uma por commit, no `master`.

## 1. Orçamento 60/30/10 nas telas

Medido com o inspetor de orçamento da dettmann-ui no app de desenvolvimento (1440×900, tema escuro, Skyrim de teste). A meta é base (low) 60% ± 8, estrutura (medium) 30% ± 8 e destaque (high) 10% ou menos.

| Tela | low | medium | high | Resultado |
|---|---|---|---|---|
| Início | 69,4% | 29,1% | 1,5% | base acima |
| Biblioteca | 76,8% | 22,6% | 0,6% | base acima |
| Configurações | 67,1% | 32,9% | 0% | dentro |
| Visão geral | 78,5% | 20,1% | 1,4% | base acima, estrutura abaixo |
| Mods | 72,0% | 26,8% | 1,2% | base acima |
| Plugins | 73,6% | 25,6% | 0,8% | base acima |
| Ordem de carga | 77,0% | 22,2% | 0,8% | base acima |
| Conflitos | 79,8% | 19,4% | 0,8% | base acima, estrutura abaixo |
| Perfis | 70,9% | 28,0% | 1,1% | base acima |
| Ajustes da instância | 76,7% | 22,5% | 0,8% | base acima |
| Diagnóstico | 69,2% | 29,3% | 1,5% | base acima |

Leitura: as pranchas aprovadas são mais "superfície" do que a meta da lib (listas e painéis grandes sobre o fundo base, faixas de estrutura só nos cabeçalhos). Pela D127, a prancha é a especificação: nada foi mudado nas telas por causa do orçamento. Fica para o Leonardo decidir se a meta da lib muda (D-033) ou se as pranchas ganham mais estrutura.

## 2. Auditoria `dettmann-ui-improve` (telas novas)

Escopo: as páginas e diálogos refeitos no redesign (Mods e seus menus, Plugins, Ordem de carga, Conflitos, Perfis, Diagnóstico, Configurações, Início, Biblioteca, Adicionar jogo, Ajustes da instância, detalhe do mod, FOMOD, Importar, Notificações).

| prioridade | achado | onde | correção | estado |
|---|---|---|---|---|
| P1 | Listbox sem setas (só Tab) | `features/games/AddGameDialog.tsx` (lista de jogos), `features/mods/OrganizationDialog.tsx` (tags) | `useRovingTabindex` com a escolha seguindo o foco | corrigido |
| P1 | Botão com `role="listitem"` perde o papel de botão | `features/diagnostics/ProblemsPanel.tsx` | botão dentro de um `listitem` | corrigido |
| P1 | `option` com botões dentro (Ativar, Clonar, ⋯) | `pages/ProfilesPage.tsx` | lista de cartões; o nome do perfil é o botão que escolhe (`aria-pressed`) | corrigido |
| P3 | `focus:outline-none` no `<main>` | páginas com cabeçalho próprio | é o alvo do "pular para o conteúdo" (`tabIndex={-1}`, nunca alcançado por Tab); mantido | aceito |

Sem achados de cor crua, paleta solta, valor de movimento manual, opacidade para desabilitado nem mais de um `emphasis="high"` por região.

Padrões que deveriam virar componente: nenhum novo além dos já criados na lib durante o plano (D-040).

## 3. Outros entregáveis

- **Falha intermitente da suíte Go** (`TestDeployPurgeDeploy`): o marcador de implantação guarda a hora do deploy em segundos; quando os dois deploys caíam em segundos diferentes, o conteúdo diferia. O teste passa a comparar a presença do marcador, não o conteúdo. O comportamento do app estava certo.
- **Jogo `generic` percorre os comandos novos** (`integration/generic_test.go`): tags, categorias, lista em texto, problemas por mod, recursos da instância, perfis, pares de conflito, conflitos do mod e importação respondem com resultado ou erro com código, nunca `internal`.
- **Paridade com o Vortex** (`docs-ia/08`): revista depois do redesign; `mo-import` saiu do DEFER (D128).
- **Primeiros passos** (`docs/primeiros-passos.md`, `docs/getting-started.md`): reescritos com as telas novas (Biblioteca › Adicionar jogo, oferta de importação, Mods, implantação, Jogar no menu do jogo, Diagnóstico, sino).

## 4. O que ainda depende do Leonardo

Decisão de 2026-10-20 (Leonardo): o teste com dados reais e o orçamento 60/30/10 ficam para o **refinamento final**, porque muita coisa ainda vai mudar. O plano do redesign está encerrado; os itens abaixo seguem como pendência desse refinamento.

- Demonstrações manuais em jogo real das F10 a F12 nas telas novas e a importação de uma instalação real do Vortex e do MO2 (aceite da RD16).
- ~~Percurso completo dos fluxos de `ui/02` só com teclado~~: feito na thread "Pendências antes da v1" (2026-10-20).
- ~~Revisão independente das ondas 2 a 4 da lib~~: feita em 2026-10-20, relatório em `dettmann-ui/docs/plans/2026-10-20-revisao-ondas-2-4.md` (removido por D148; está no histórico do git); os P1 foram corrigidos em seguida.
- Decisão sobre o orçamento 60/30/10 (§1).
