# Componentes v2, onda 4 (estrutura e telas) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o redesenho: `Sidebar`, `Toolbar`, `ActionBar`, `Card` (com `emphasis`), `EmptyState` e `FeaturedIcon` na linguagem da D-033, e no app o logo legível no tema claro e o orçamento 60/30/10 medido tela a tela.

**Architecture:** As peças de estrutura passam a usar `bg-structure` e declarar `data-layer="medium"`; o `Card` troca `variant` por `emphasis`. No app, a barra de título declara a camada e pinta o logo por máscara. O orçamento é medido com o `BudgetInspector` no app em `wails dev` e corrigido pela escolha de camada, não por cor local.

**Tech Stack:** igual às ondas anteriores.

**Spec:** `dettmann-ui-vnext/docs/specs/2026-10-09-v2-components-design.md` (seções 1, 3.1, 3.8 e 5, linha "Onda 4"). Decisões anteriores: D-032 a D-036.

## Global Constraints

- Valem as restrições das ondas 1 a 3.
- Meta do orçamento (spec, critério 1): low 60% e medium 30%, cada um com ± 8 p.p.; high ≤ 12%. Medir nos temas claro e escuro.
- `Card` não tem `emphasis="high"`: o destaque vem da ação dentro dele.
- Nenhuma regra de negócio em componente React; nenhum texto de UI fora do i18n (AGENTS.md).
- Git: um commit no `master` ao fim da onda, sem push.

## Review Focus

1. `Card` selecionado e interativo ao mesmo tempo: um fundo e uma borda só.
2. Logo por máscara: continua com nome acessível, não arrastável, e aparece nos dois temas e em alto contraste.
3. `Sidebar` recolhida: item atual ainda distinguível sem o rótulo (barra da marca visível).
4. Telas sem dados (sem jogo, backend indisponível): o orçamento é medido no estado que o usuário mais vê no primeiro uso.
5. `variant` removido do `Card`: nenhum consumidor (lib, playground, app) continua passando a prop.

---

### Task 1: `Card`

**Files:** `src/components/card/index.tsx` (reformatar), `src/templates/calendar/calendar.root.tsx`, `playground/panels/export.tsx`; teste `src/__tests__/templates-card-table.test.tsx` + `src/__tests__/wave4-structure.test.tsx`.

```ts
interface CardRootProps extends ComponentPropsWithoutRef<"div"> {
  /** `low` (padrão): superfície com borda. `medium`: estrutura (`data-layer="medium"`). */
  emphasis?: "low" | "medium";
  /** Cartão clicável: cursor, camada de hover e anel de foco. */
  interactive?: boolean;
  selected?: boolean;
}
```
- Sem sombra. `selected` = `bg-selected border-border-strong` no lugar do fundo/borda de repouso.
- `variant` sai: `default` → nada; `raised`/`subtle` → `emphasis="medium"`; `interactive` → `interactive`.
- Cabeçalho `px-4 pt-4`, corpo `px-4 py-3`, rodapé `px-4 py-3` (denso).

### Task 2: `Toolbar`, `ActionBar`, `Sidebar`, `FeaturedIcon`, `EmptyState`

- `Toolbar`: `bg-structure` (já declara a camada), `min-h-10`.
- `ActionBar`: `data-layer="medium"`, `bg-structure`, `px-4 py-2`.
- `Sidebar`: `strong` = `bg-structure`; `subtle` = `bg-sunken`; item com `focus-ring-inset`; item atual = `bg-selected font-medium text-fg` + barra `bg-brand-fill` (sai `emphasis-*`); ocioso `hover:bg-state-hover`.
- `FeaturedIcon`: `rounded-pill`. `EmptyState`: só entra no contrato.
- [ ] Testes em `wave4-structure.test.tsx`; `wave-contract` com os arquivos da onda.

### Task 3: App — barra de título

**Files:** `frontend/src/shell/TitleBar.tsx`, teste existente do shell.

- `<header data-layer="medium">`.
- Logo: `<span role="img" aria-label={t("app.name")}>` com `mask-image` do PNG, `bg-fg`, `h-6` e a proporção do arquivo. Sem `<img>`.

### Task 4: App — orçamento tela a tela

- [ ] Subir `wails-dev` (launch.json) e medir cada rota com o `BudgetInspector`, claro e escuro, no estado sem jogo. Registrar a tabela na D111.
- [ ] Onde medium ficar abaixo de 22%: promover a faixa de cabeçalho/filtros da página a estrutura (componente da lib que já declara a camada) ou `Card emphasis="medium"` nos painéis secundários. Onde passar de 38%: voltar cards a `low`.
- [ ] Nenhuma tela com mais de um `emphasis="high"` por região (aviso do `useBudgetGuard` no console).

### Task 5: Docs, validação e commit

- [ ] D-037 (lib) e D111 (app, com a tabela de medições); `component-matrix.md`, `migration.md`, skills + `skills:install`; spec marcado como implementado.
- [ ] Lib: `npm run typecheck && npm test -- --run && npm run theme && npm run build`. App: typecheck, testes, `go vet ./... && go test ./...`, `wails build`.
- [ ] Commit: `feat(dettmann-ui): onda 4 do redesenho — estrutura e telas (D-037, D111)`.
