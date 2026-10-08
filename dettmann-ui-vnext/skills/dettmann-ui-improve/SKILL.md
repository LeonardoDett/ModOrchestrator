---
name: dettmann-ui-improve
description: Use when asked where a UI built with dettmann-ui, or the dettmann-ui library itself, can improve — "onde a UI/lib pode melhorar", "audite a tela", "audite a lib", "o que falta na lib", "revise a UI procurando melhorias", "improve the UI", "audit the library", "find UI improvement opportunities". Read-only audit, not for implementing the fixes.
---

# dettmann-ui — auditoria de melhorias (somente leitura)

## Princípio

Você **mede contra o contrato da lib** e entrega um relatório priorizado. Não
corrige nada: o produto é o relatório. Regras de uso (ênfase, intent, tema,
movimento) estão em `dettmann-ui-use`; regras internas da lib em
`dettmann-ui-author`. Esta skill não as repete: aponte onde foram violadas.

**Somente leitura.** Use Read/Grep/Glob e comandos que não escrevem (`rg`,
`git diff`, `npm run typecheck`). Proibido: Edit/Write em código, `--fix`,
`vitest -u`, `theme:build`, formatadores. Se o usuário pedir a correção, isso é
outra tarefa, depois do relatório. Mesmo que peçam para corrigir agora, entregue o relatório primeiro.

## Direção

| Alvo | Sinal | Seção |
|---|---|---|
| Tela/projeto consumidor | importa de `"dettmann-ui"` | Heurísticas A |
| A própria lib | pasta com `src/components`, `src/motion`, `src/theme/engine` | Heurísticas A em `components/templates/primitives` **e** B |

## Procedimento

1. Liste os arquivos-alvo (`.tsx`) e leia cada um inteiro.
2. Rode **todas** as buscas da(s) seção(ões) indicada(s) na Direção. Busca sem resultado também é
   resultado (não reporte).
3. Abra cada ocorrência e confirme no contexto; anote `arquivo:linha` exato.
4. Para cada correção, confirme o nome no código/tipos da lib (`node_modules/dettmann-ui`
   ou `src/`) antes de citá-lo. Não invente prop, variante nem componente.
5. Classifique impacto e esforço (tabela abaixo) e ordene.
6. Escreva o relatório no formato fixo. Nada antes da tabela além de uma linha de escopo.

## Heurísticas A — tela (consumidor ou componente da lib)

Buscas (regex estendida: mesma sintaxe na ferramenta Grep, `rg -n` ou
`grep -rnE`; `ALVO` = arquivos/pasta auditados). Restrinja a `--include='*.tsx' --exclude='*.test.*'`
e pule fixtures (`skills/**/fixtures`, `__fixtures__`):

```bash
grep -rnE '#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(' ALVO                # 1 cor crua
grep -rnE '\b(bg|text|border|ring|fill|stroke)-(white|black|[a-z]+-[0-9]{2,3})\b' ALVO  # 1 paleta crua
grep -rnE '[a-z]-\[[^]]+\]|\[[a-z-]+:[^]]+\]' ALVO                               # 2 valor arbitrário
grep -rnE '\brounded(-(none|sm|md|lg|xl|2xl|3xl|full))?([^-a-z[]|$)|\bshadow(-(sm|md|lg|xl|2xl))?([^-a-z[]|$)' ALVO  # 2 raio/sombra genéricos
grep -rnE 'duration-[0-9]+|transition-(all|colors|transform|opacity)|ease-(in|out|linear)|animate-(in|out|spin|pulse|bounce)|@keyframes|transition:' ALVO  # 3 movimento manual
grep -rnE 'emphasis="high"' ALVO                                                 # 4 conte por região
grep -rnE '\.filter\(|\.splice\(|\.sort\(|\.reverse\(|onReorder|draggable' ALVO  # 5/6 listas que mudam
grep -rnE 'Presence|useFlip' ALVO                                                # 5/6 (ausência é o achado)
grep -rnE 'onClick=|onSubmit=|async ' ALVO                                       # 7 ações
grep -rnE 'loading|disabled|useToast|ConfirmDialog|useConfirm' ALVO              # 7 (ausência é o achado)
grep -rnE 'Skeleton|Loader|EmptyState|Alert|isLoading|error' ALVO                # 9 estados
grep -rnE '<(div|span|li|tr|td)[^>]*onClick|outline-none|tabIndex' ALVO          # 10 teclado
grep -rnE 'opacity-(40|50|60)' ALVO                                              # 11 desabilitado
grep -rnE "from ['\"]lucide-react['\"]|Loader2|Spinner|<Icon |trigger=\"none\"" ALVO   # 13/14/16 ícones
grep -rnE 'loading|syncing|deploying|isPending' ALVO                              # 15 (estado contínuo: ausência de indicador é o achado)
```

| # | Achado | Confirme lendo | Correção a citar |
|---|---|---|---|
| 1 | Cor crua / paleta Tailwind | não é comentário nem `aria-label` | papel (`bg-surface`, `bg-raised`, `text-fg-muted`, `border-border`) ou `intent=` |
| 2 | Valor arbitrário (`bg-[#…]`, `rounded-[10px]`, `p-[13px]`, `[animation-duration:…]`), raio/sombra genéricos | variantes (`data-[`, `aria-[`, `has-[`, `[&`) e tamanhos de layout intencionais não contam; `rounded-full` é válido para círculos de verdade | `rounded-control/chip/card/panel/pill`, `h-control-sm/md/lg`, `shadow-raised/overlay/modal`, ou o slot (`Card.Root`) que já traz a superfície |
| 3 | Duração/transição/keyframe manual | — | `motion-transition` / `motion-press`; entrada/saída `Presence`; gesto `animate()`; giro `Loader` |
| 4 | Mais de um `emphasis="high"` | mesma `Toolbar`/`ActionBar`/`Modal.Footer`/ações de `ResourcePage`/mesmo container | um `high`; demais `medium` (omitir) ou `low` |
| 5 | Lista que adiciona/remove itens sem `Presence` | o `.map` renderiza a lista alterada | `<Presence show>` por item |
| 6 | Lista reordenada sem `useFlip` | — | `useFlip(deps)` + `ref={flip(key)}` |
| 7 | Ação sem feedback | handler assíncrono/destrutivo sem `loading`/`disabled`/toast/confirmação | `Button loading`, `useToast()`, `ConfirmDialog` |
| 8 | Bloco JSX repetido | mesmo esqueleto (ex.: `Icon` + `Typography` + número) 3+ vezes no arquivo ou em irmãos — leia o arquivo, não há grep confiável | componente existente (`Indicator`, `FeaturedIcon`, `Card`, `Section`…); senão vai para "padrões" |
| 9 | Estados ausentes | dado de lista/assíncrono sem ramo carregando/vazio/erro | `Skeleton`/`Loader`, `EmptyState`, `Alert` |
| 10 | Lacuna de teclado | `onClick` em elemento não interativo sem `role`+`tabIndex`+`onKeyDown`; `outline-none` sem `focus-visible:ring`; lista/menu sem setas | `Button`, `List`, `Menu`, `useRovingTabindex`, `ring-focus` |
| 11 | Desabilitado por opacidade | — | `disabled:bg-sunken disabled:text-fg-subtle` |
| 12 | Primitiva refeita à mão | `<ul>`/`<table>`/`role="dialog"`/cabeçalho de página manual | `List`, `Table`/`DataTable`, `Modal`, `ResourcePage` |
| 13 | Lucide solto com equivalente no catálogo | o glifo existe em `dettmann-ui/icons` (confira `src/icons/index.ts`) | o ícone próprio (`<Icon icon={Trash2} />` → `<TrashIcon />`, tabela em `docs/migration.md`); sem equivalente, `Icon` |
| 14 | `Spinner` ou `Loader2` girando à mão | — | `<Loader label=… />` |
| 15 | Estado contínuo sem indicador | handler/estado `loading`, `syncing`, `deploying` sem `Loader`, `loop` de ícone ou texto de status; `loop` como único indicador sem texto | `<Loader />`, ícone com `loop` + texto de status |
| 16 | Ação sem feedback em controle com ícone `trigger="none"` | o ícone dentro de `Button`/item não anima no hover/press e não há `playKey` | remover `trigger="none"` ou usar `playKey` na mudança de estado |

## Heurísticas B — só para a lib

Matriz **componente × critério**: para cada pasta de `src/components` e
`src/templates`, marque o que falta:

```bash
for d in src/components/*/ src/templates/*/; do
  g() { grep -rqE "$1" "$d" || echo "$2 $d"; }
  g 'resolveEmphasis|restingClassName' sem-ênfase
  g 'loading|Skeleton|Loader|aria-busy' sem-loading
  g 'empty|EmptyState' sem-vazio
  g 'error|invalid|aria-invalid' sem-erro
  g 'onKeyDown|useRovingTabindex|useFocusTrap|useEscapeKey' sem-teclado
  g 'Presence|useFlip|animate\(|motion-transition|motion-press' sem-movimento
done
```

Depois filtre pelo que o componente **precisa** (só reporte a falta se faz sentido):

| Critério | Precisa quando |
|---|---|
| ênfase (`resolveEmphasis`) | tem cor/camada própria ou props de cor |
| loading | mostra dado assíncrono (tabela, lista, árvore, galeria, mídia, botão de ação) |
| vazio | coleção: lista, tabela, árvore, galeria, busca, arquivos |
| erro | campo, carregamento, mídia |
| teclado | menu, lista, árvore, tabs, overlay, slider, carrossel, seleção |
| movimento | entra/sai, reordena, expande, responde a toque |

Rode também as buscas A (1, 2, 3, 11) em `src/components src/templates src/primitives`
(movimento legado e `opacity-50` são achados) e confira `src/__tests__/` por
componente sem teste.

**Lacunas de catálogo**: padrões compostos repetidos em `templates/`,
`playground/`, `examples/` ou nos consumidores que não existem como componente
(ex.: cartão de estatística). Vão em "padrões que deveriam virar componente".

Agrupe: **uma linha por critério**, com os componentes listados em "onde".

## Impacto × esforço

| Impacto | Quando |
|---|---|
| alto | quebra tema/dark/contraste, acessibilidade (teclado, foco), contrato da lib (ênfase, cor crua), ação destrutiva sem confirmação |
| médio | hierarquia visual (orçamento), estados ausentes, feedback ausente, duplicação |
| baixo | polimento: movimento ausente, consistência |

| Esforço | Quando |
|---|---|
| baixo | troca de classe/prop em uma linha |
| médio | reestruturar um bloco/arquivo, envolver em primitiva |
| alto | componente novo na lib, mudança em vários componentes |

A prioridade é **consultada**, não escolhida:

| impacto ↓ / esforço → | baixo | médio | alto |
|---|---|---|---|
| alto | P1 | P1 | P2 |
| médio | P1 | P2 | P3 |
| baixo | P2 | P3 | P3 |

Ordene P1→P3; dentro do nível, menor esforço primeiro.

## Formato do relatório (fixo)

```markdown
Escopo: <arquivos/pastas auditados> — somente leitura, nenhum arquivo alterado.

| prioridade | achado | onde | correção | impacto | esforço |
|---|---|---|---|---|---|
| P1 | Cor e raio hardcoded no container | `src/pages/Pedidos.tsx:42` | `bg-surface rounded-card` (ou `Card.Root`) | alto | baixo |

## Padrões que deveriam virar componente

- **<nome proposto>** — `<arquivo:linha>, <arquivo:linha>, …`: <o que o bloco faz>.
  Hoje: <componente da lib que serve, se houver>. Se não houver: lacuna da lib, criar
  com a skill `dettmann-ui-author` (no projeto, compor localmente até lá; nunca
  componente paralelo).
```

- Toda linha tem `arquivo:linha` (ou lista de componentes, para achado agrupado da lib).
- Toda linha é um problema **confirmado lendo o código**. "Nada a reportar",
  "verificar" e hipóteses de grep não entram na tabela; vão numa linha
  "A confirmar:" depois dela, se houver.
- Toda correção cita o componente/primitiva/token/prop **real** da lib.
- Seção de padrões sempre presente; vazia = "Nenhum."
- Achados fora do contrato (i18n, tamanho de arquivo, `React.memo`) só entram
  depois de todos os critérios acima, como P3.

## Erros comuns

| Erro | Correção |
|---|---|
| Prosa livre com "pontos fortes" e listas | O relatório é a tabela + padrões. |
| `Presence`/`useFlip` citado de passagem dentro de outro achado | Cada heurística vira sua linha. |
| Bloco repetido resolvido com `.map` local | Diga qual componente da lib serve ou registre como padrão/lacuna. |
| Auditoria da lib virar i18n, tamanho de arquivo, cobertura genérica | Primeiro a matriz B; extras no fim. |
| "Sem hex nos componentes" sem rodar as buscas | Rode todas; `[animation-duration:…]`, `duration-200`, `opacity-50` também contam. |
| Citar prop/variante que não existe | Confira nos tipos antes. |
| P1 com impacto médio e esforço médio | Use a grade de prioridade; não promova por gosto. |
| Matriz B reportada crua (dezenas de "sem-X") | Filtre por "precisa quando"; o resto é ruído. |
| Citar `Spinner` ou ícone que não existe no catálogo | Confira `src/icons/index.ts` antes. |
| Aplicar a correção "porque é uma linha" | Somente leitura. Ofereça depois do relatório. |
