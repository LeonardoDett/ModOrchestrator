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
5. Estados: `hover:bg-state-hover`, `active:bg-state-pressed`, `bg-state-selected`; foco `focus-visible:ring-2 ring-focus ring-offset-canvas`; desabilitado `disabled:bg-sunken disabled:text-fg-subtle` (não `opacity-50`). Seleção nunca só por cor.
6. Movimento: classes `motion-transition` (cor/opacidade) e `motion-press` (press). Entrada/saída = `<Presence>`; gesto = `animate(el, m => [...])` escalando por `m.amp`; reordenar = `useFlip`. Redução de movimento já é tratada pelas primitivas — não reimplemente. **Sem dependência nova** (framer-motion etc.) e sem `animate-in`, `duration-*`, `transition: 200ms`. Encontrou legado desses no arquivo que você tocou? Migre-o junto.
7. Acessibilidade: nome acessível, teclado, controlado/não controlado com `useControllableState`, textos embutidos por prop (`removeLabel`…), `className` e props DOM repassadas.
8. Export em `src/components/index.ts` (ou `templates`/`primitives`), JSDoc com `@example`.

## Testes obrigatórios

| Mudança | Teste |
|---|---|
| Componente | `src/__tests__/<nome>.test.tsx`: `data-layer`/`data-intent`/`data-motion` por ênfase (padrão, `high`→brand), teclado, controlado/não controlado, nome acessível, desabilitado |
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
- Tema/papéis/motor/movimento → `docs/theme-system.md` (e `architecture.md` se mudar camada).
- Componente novo/prop pública → `docs/component-matrix.md`.
- Mudou prop, papel, valor válido ou regra → atualize **esta skill e `skills/dettmann-ui-use/SKILL.md`**. Skill desatualizada ensina errado a todo agente.

## Racionalizações

| Desculpa | Realidade |
|---|---|
| "Segui o padrão do `Tag`" | Vários componentes ainda são v1. O padrão é `Button`/`Badge` + `resolveEmphasis`. |
| "`intent` padrão `brand` fica mais bonito" | Padrão é `neutral`; `brand` só via `high`. |
| "`rounded-full`/`opacity-50` é inofensivo" | Primitiva de forma e tokens de desabilitado existem para isso. |
| "É só trocar o hue, os testes passam" | Testes antigos não fixam a intenção nova: escreva a propriedade. |
| "`vitest -u` e pronto" | Revise o diff do snapshot; só tokens esperados podem mudar. |
| "Pediram chamativo / pode usar framer-motion" | `animate` + `amp`; o nível vem da ênfase. Sem dependência. |
| "Chamativo = forçar `data-motion=\"expressive\"`" | O nível vem de `emphasis`/prop `motion`/`MotionScope`; intensidade do gesto = keyframes × `amp`. |
| "O legado do arquivo não é meu" | Se tocou o arquivo, `duration-300`/`animate-in` saem. |
| "Docs/skills depois" | Fazem parte da mudança. |

## Sinais de PARE

`#`/`rgb(` num componente · editar `themes.generated.css` · prop `variant="primary"` · `opacity-50` p/ desabilitado · `import` de lib de animação · só o teste focado rodou · contrato mudou sem tocar `decisions.md`/skills.
