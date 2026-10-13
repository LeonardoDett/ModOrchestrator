---
name: dettmann-ui-author
description: Use when changing code inside the dettmann-ui library itself (dettmann-ui-vnext) — adding or editing a component, template or primitive, changing theme colors, presets, the theme engine, tokens.css, motion or animations. Também quando pedirem para criar/alterar componente da lib, "deixar o warning mais amarelo", mudar cor/preset/tema da lib, adicionar animação ou estado a um componente da dettmann-ui.
---

# dettmann-ui — alterar a própria lib

## Princípio

Cor, raio, densidade e movimento são **gerados** (motor de tema) e **resolvidos**
(tabela central). Um componente só **consome** papéis; nunca decide cor nem tempo.
Para uso em projeto consumidor, veja a skill `dettmann-ui-use` — não repita aqui.

Violar a letra destas regras é violar o espírito delas.

## As 4 camadas: onde cada mudança mora

| Camada | Arquivos | Pode | Não pode |
|---|---|---|---|
| L0 Config | `src/theme/presets/*.ts`, `ThemeConfig` em `engine/types.ts` | sementes e botões (`brand`, `vibrance`…) | hex por papel |
| L1 Rampas / solver | `src/theme/engine/` (`palette.ts`, `roles.ts`, `solve.ts`, `color/`, `motion.ts`) | algoritmo, matizes, metas de contraste, specs de mola | quebrar teste de propriedade |
| L2 Primitivas | `engine/primitives.ts`, `tokens.css` (`--radius-*`, `h-control-*`, `--motion-*`, `@utility motion-*`) | mapear tokens para utilitários | valores mágicos fora do motor |
| L3 Papéis | `engine/roles.ts` → `themes.generated.css`; `tokens.css` mapeia `--color-*` e `[data-intent]` | — (é saída) | **editar `themes.generated.css` à mão** |
| Componentes | `src/components`, `src/templates`, `src/primitives` | consumir L3/L2 e `resolveEmphasis` | hex, `rgb()`, paleta crua, `duration-300`, keyframes, `transition` manual |

"Mude a cor X" = mude o **algoritmo ou a config** (L0/L1) e regenere. Nunca o CSS gerado.

## Anatomia de componente

0. Nível atômico (D-032): átomo, molécula, organismo ou template. Só importe componentes do mesmo nível ou abaixo e registre a pasta em `src/__tests__/atomic-levels.test.ts` (o teste falha sem isso).
1. Procure antes: existe algo parecido (`Tag` é pílula removível; `Badge` rótulo)? Estenda ou justifique a diferença.
2. Recipe com `defineRecipe` (`src/core/recipe`): `base` + `variants`, ou `slots` para partes. Composto = slots (`X.Root/Header/Body…`), não 20 booleanos.
3. Cor e camada **só** via tabela central:
   ```tsx
   const r = resolveEmphasis({ emphasis, intent, motion }); // padrão medium/neutral; high → brand
   <button className={cn(recipe({ size }), r.className, className)} {...r.attrs} {...props} />
   // r.attrs = data-intent + data-layer + data-motion. Não interativo: restingClassName(r)
   ```
   Props públicas: `emphasis?`, `intent?`, `motion?` — nunca `variant="primary"`, `tone`, intent padrão `brand`.
4. Forma/tamanho por primitiva: `rounded-control|chip|card|panel|pill` (`pill` só p/ redondo semântico: switch, avatar, contagem), `h-control-sm|md|lg`, `shadow-raised|overlay|modal`, `text-caption…display`.
5. Estados: em repouso transparente, `hover:bg-state-hover`, `active:bg-state-pressed`, `bg-state-selected`; em repouso opaco (`bg-surface`, `bg-intent-subtle`, `bg-structure`...), `hover:state-layer-hover`, `active:state-layer-pressed`, `state-layer-selected` (a camada compõe sobre o fundo; `bg-state-*` o substituiria); foco só pelos utilitários `focus-ring` (afastado), `focus-ring-inset` (linhas, abas, itens) ou `focus-bare` (campo cujo contêiner mostra o foco), nunca `outline-none`/`focus-visible:ring-*` à mão; desabilitado `disabled:bg-sunken disabled:text-fg-subtle` (não `opacity-50`). Seleção nunca só por cor.
6. Movimento: classes `motion-transition` (cor/opacidade) e `motion-press` (press). Entrada/saída = `<Presence>`; gesto = `animate(el, m => [...])` escalando por `m.amp`; reordenar = `useFlip`. Redução de movimento já é tratada pelas primitivas — não reimplemente. **Sem dependência nova** (framer-motion etc.) e sem `animate-in`, `duration-*`, `transition: 200ms`. Encontrou legado desses no arquivo que você tocou? Migre-o junto.
7. Acessibilidade: nome acessível, teclado, controlado/não controlado com `useControllableState`, textos embutidos por prop (`removeLabel`…), `className` e props DOM repassadas.
8. Export em `src/components/index.ts` (ou `templates`/`primitives`), JSDoc com `@example`.

## Linguagem visual (D-033)

Arquivo redesenhado entra em `WAVE_FILES` (`src/__tests__/wave-contract.test.ts`), que rejeita: `shadow-raised` (sombra só em overlay: `shadow-overlay`/`shadow-modal`), `opacity-40/50/60`, `rounded-full|sm|md|lg|xl`, `duration-<n>`/`transition-all|colors|opacity`/`animate-*`, foco escrito à mão e lucide com equivalente no catálogo. Linha selecionável (opção, item de menu, linha de tabela/árvore) = `rowRecipe({ selected, active, disabled, indicator, multiline, tone })` de `src/core/styles/row.ts`; não reescreva altura, camada de estado nem indicador. Estrutura declara `data-layer="medium"` em `bg-structure`.

Dados (D-036): linha com vários estados (selecionada, arrastada, grupo, desabilitada) = **uma** variante `state` no recipe, nunca classes somadas; lista virtualizada usa altura em px e pode usar `useFlip` (anima `translate`, o virtualizador usa `transform`).

Overlays (D-035): entrada/saída com `Presence` + keyframes de `src/motion/overlay-keyframes.ts` (`overlayEnter/Exit`, `slideEnter/Exit(side)`, `fadeEnter/Exit`); overlay modal que precisa sair animado usa `useExitPresence(open)` na raiz e `Presence onExited` no painel; elemento do floating-ui que anima `transform` precisa de `transform: false` no `useFloating`. Status = `intentIcon(intent)`, nunca só cor. Estado que muda cor **troca** a classe (variante): o `cn` não resolve conflito.

## Ícones animados (`src/icons`)

Glifo novo = um arquivo `src/icons/glyphs/<nome>.tsx` com `defineIcon`; nada de keyframes por glifo.

1. Copie a geometria do Lucide (`node_modules/lucide-react/dist/esm/icons/<nome>.js`, `__iconNode`), viewBox 24, e cite a origem no cabeçalho (`// Geometria adaptada do Lucide <nome> (ISC).`). A licença fica em `src/icons/NOTICE`.
2. Divida em `parts` (ordem = ordem de pintura) só o que se move; `origin` por parte (`"100% 100%"` = canto) quando o pivô não é o centro. `root` é nome reservado (anima o ícone inteiro).
3. `action` (e `loop` só se há estado contínuo) usam **só técnicas** de `techniques.ts` (`squash lift nudge rotate spin draw undraw flip trail pulse stagger`). Técnica usada num modo que não suporta lança em dev.
4. Respeite o limite geométrico com `amp` 1,6: `translate ≤ 3`, `rotate ≤ 30°` (até 180° só em ícone de rotação natural: refresh, undo, settings, sun, moon), `|scale − 1| ≤ 0,25`; `spin`/`flip` isentos. Reduza o valor do glifo, não o teste.
5. Registre em `src/icons/catalog.ts` (`CATALOG`) e exporte em `src/icons/index.ts`. O teste de catálogo (`icon-catalog.test.tsx`) cobre limites, partes e cor; repouso e redução ficam em `icon-techniques.test.ts`.
6. Técnica nova: só em `techniques.ts`, com `extent` e teste em `icon-techniques.test.ts` (amplitude × `amp`, volta ao repouso, `reduced`). Ida-e-volta em duas fases (ida `ease-out`, volta com a mola via `keyframeEasing`); traço e loop nunca usam a mola.
7. Raiz `dettmann-ui` não reexporta glifos nem técnicas (só `defineIcon`, tipos, `Loader`).

## Testes obrigatórios

| Mudança | Teste |
|---|---|
| Componente | `src/__tests__/<nome>.test.tsx`: `data-layer`/`data-intent`/`data-motion` por ênfase (padrão, `high`→brand), teclado, controlado/não controlado, nome acessível, desabilitado |
| Ícone/loader | `icon-techniques`, `icon-catalog`, `animated-icon`, `loader`: stub em `Element.prototype.animate` (SVG não é `HTMLElement`); repouso, `amp` por nível, redução |
| Movimento | stub de `el.animate` (padrão em `motion.test.tsx`): chamado no caso certo; com `data-reduce-motion="true"` não há `transform`/`scale` |
| Motor (`engine/`) | **teste de propriedade** sobre muitas marcas (padrão `mulberry32` de `roles.test.ts`) que fixa a intenção nova (ex.: matiz do warning numa faixa, light e dark, `standard` e `high`), além de manter contraste |
| Preset/motor | snapshot de `presets` atualizado **depois** de revisar o diff (`npx vitest run src/theme -u`), nunca às cegas |

Nunca afrouxe um teste de propriedade para a mudança passar: corrija o algoritmo.

## Validação (dentro de `dettmann-ui-vnext/`)

```bash
npm run theme:build     # sempre que tocar engine/presets/tokens: regenera themes.generated.css
npm run typecheck       # lib + playground
npm test -- --run       # suíte completa, não só o arquivo novo
npm run theme           # build + theme:check + theme:lint (cor fora do contrato falha)
npm run build
```

Os cinco verdes antes de dizer "pronto". Rodar só o teste focado não conta.

## Contrato mudou? Atualize junto

- Decisão nova ou alterada → `docs/decisions.md` (próximo `D-0NN`); em projeto consumidor como o Mod Orchestrator, também `mod-orchestrator-spec-v2/docs-ia/decisoes.md`.
- Ícone/técnica/`Loader` → `docs/component-matrix.md`, `docs/migration.md` e decisão (D-027…D-031).
- Tema/papéis/motor/movimento → `docs/theme-system.md` (e `architecture.md` se mudar camada).
- Componente novo/prop pública → `docs/component-matrix.md`.
- Mudou prop, papel, valor válido ou regra → atualize **esta skill e `skills/dettmann-ui-use/SKILL.md`**. Skill desatualizada ensina errado a todo agente.

## Racionalizações

| Desculpa | Realidade |
|---|---|
| "Segui o padrão de um componente antigo" | Só os arquivos em `WAVE_FILES` já seguem a D-033. O padrão é `Button`/`Badge`/`Tag` + `resolveEmphasis`. |
| "`intent` padrão `brand` fica mais bonito" | Padrão é `neutral`; `brand` só via `high`. |
| "`rounded-full`/`opacity-50` é inofensivo" | Primitiva de forma e tokens de desabilitado existem para isso. |
| "É só trocar o hue, os testes passam" | Testes antigos não fixam a intenção nova: escreva a propriedade. |
| "`vitest -u` e pronto" | Revise o diff do snapshot; só tokens esperados podem mudar. |
| "Pediram chamativo / pode usar framer-motion" | `animate` + `amp`; o nível vem da ênfase. Sem dependência. |
| "Chamativo = forçar `data-motion=\"expressive\"`" | O nível vem de `emphasis`/prop `motion`/`MotionScope`; intensidade do gesto = keyframes × `amp`. |
| "O legado do arquivo não é meu" | Se tocou o arquivo, `duration-300`/`animate-in` saem. |
| "Docs/skills depois" | Fazem parte da mudança. |
| "Um keyframe só deste ícone" | Técnica nova em `techniques.ts` com teste, ou use as existentes. |
| "Passou do limite, afrouxo o teste" | Reduza o valor no glifo. |

## Sinais de PARE

`#`/`rgb(` num componente · editar `themes.generated.css` · prop `variant="primary"` · `opacity-50` p/ desabilitado · `import` de lib de animação · keyframes dentro de um glifo · só o teste focado rodou · contrato mudou sem tocar `decisions.md`/skills.
