# dettmann-ui v2 — Fundação (tokens, temas, ênfase, movimento)

Status: aprovado em brainstorming (2026-10-06), aguardando revisão do spec escrito.
Subprojeto 1 de 4 da reformulação da dettmann-ui v2.

## 1. Contexto e problema

A dettmann-ui é o boilerplate de UI do autor para todos os projetos: theme-first,
composition-first, lógica separada da UI, mínimo de dependências. A estratégia é
mantida; o que falha é a execução:

- **Temas não acertam (problema A).** Cada tema é ~70 hex escolhidos à mão por modo
  (`src/styles/theme/themes.css`), em 7 famílias × 8 variações. Montar um tema novo
  exige ~140 decisões manuais e o resultado fica desarmônico (neutros que não
  conversam com a marca, subtle/hover estranhos).
- **Distribuição não respeita o 60/30/10 (problema B).** O 60/30/10 só existe como
  comentário. Qualquer componente aceita qualquer `tone`; o `Button` escolhe tom
  sozinho pelo tamanho; tudo tem o mesmo peso, sem hierarquia.
- **Sem linguagem de forma nem de movimento.** Raios soltos de 2 a 16px; movimento
  limitado a 3 durações e 2 curvas.
- **Falta personalidade.** Componentes "corretos e neutros".

## 2. Roadmap da v2 (decomposição)

| # | Subprojeto | Depende de |
|---|---|---|
| 1 | **Fundação** — motor de temas, contrato de ênfase, primitivas de forma/densidade/tipo/elevação/movimento | — |
| 2 | Ícones animados — pasta de ícones monolinha com partes animadas + primitivo `AnimatedIcon` | 1 |
| 3 | Componentes — revisão com personalidade e micro-interações + componentes novos | 1, 2 |
| 4 | Integração no Mod Orchestrator — migração do `frontend/` + componentes que melhoram o app | 1–3 |

Este documento cobre **somente o subprojeto 1**. Cada subprojeto tem ciclo próprio
de spec → plano → implementação.

## 3. Decisões do brainstorming

| Tema | Decisão |
|---|---|
| Controle do tema | Sementes + botões de personalidade, com override por papel como válvula de escape |
| Forma | `balanced`: controle 8px, card 12px, painel 16px, raio concêntrico; entre Fluent 2 (quadrado/datado) e M3 (redondo/infantil) |
| Movimento | Teto padrão `expressive`; intensidade efetiva segue a hierarquia de ênfase (menu = responsive, CTA = expressive) |
| Ajuste fino de movimento | Todos os parâmetros como dado, ajustáveis em tema, escopo e instância |
| Compatibilidade | Ruptura livre (v2). Sem camada de aliases. Migração do app no subprojeto 4 |
| Tipografia | Plus Jakarta Sans (sans) + JetBrains Mono (mono), embutidas |
| Motor | TypeScript puro compartilhado entre build e runtime, OKLCH próprio, solver de contraste |
| Família `secondary` | Removida. Estrutura (30%) vem de neutros tingidos pela marca |

Abordagens descartadas: gerador só em build (perde temas em runtime) e CSS puro
com relative colors (não consegue garantir contraste).

## 4. Arquitetura de tokens

Quatro camadas. **Componentes só consomem L3** (e L2 para dimensões/movimento).

```
L0  Config      sementes + botões de personalidade          (escrito pelo autor do tema)
L1  Rampas      OKLCH: neutral, brand, accent, info, success, warning, danger
L2  Primitivas  forma, espaço, densidade, tipo, elevação, movimento
L3  Papéis      organizados pelas camadas low/60 · medium/30 · high/10 + intents
```

### 4.1 Config (L0)

```ts
interface ThemeConfig {
  id: string;
  label: string;
  brand: string;                         // única semente obrigatória (qualquer cor CSS)
  accent?: string;                       // "segundo 10%": realces, novidades
  neutral?: "cool" | "neutral" | "warm"; // padrão "neutral"; quanto do matiz da marca tinge os cinzas
  vibrance?: number;                     // 0..1, padrão 0.5; presença de cor em subtle/seleção/estrutura
  contrast?: "standard" | "high";        // padrão "standard"
  shape?: "precise" | "balanced" | "soft";              // padrão "balanced"
  density?: "compact" | "comfortable" | "spacious";     // padrão "comfortable"
  motion?: MotionLevel | { ceiling: MotionLevel; tune?: Partial<Record<MotionLevel, Partial<MotionSpec>>> };
                                         // padrão { ceiling: "expressive" }
  font?: { sans?: string; mono?: string };
  overrides?: { light?: RoleOverrides; dark?: RoleOverrides }; // chaves = nomes de papel L3
}

declare function createTheme(config: ThemeConfig): ResolvedTheme;
```

`ResolvedTheme` contém, para cada modo, o mapa completo `nome-do-token → valor`
e um método de serialização para CSS (`toCSS(selector)`). É uma função pura e
determinística: mesma config, mesma saída.

### 4.2 Rampas (L1)

- Implementação OKLCH própria em `src/theme/engine/color/` (conversão sRGB↔OKLab↔OKLCH,
  gamut mapping por redução de croma, luminância relativa WCAG e APCA). Sem dependências;
  `culori` sai das devDependencies.
- Cada rampa tem passos indexados por **luminosidade alvo**, não por número fixo.
  A croma acompanha uma curva em sino (máxima nos tons médios), escalada por `vibrance`
  e limitada ao gamut sRGB.
- **Neutral**: matiz da marca, croma = f(`neutral`) — `cool` desloca o matiz para o
  frio e aplica croma ~0.012, `neutral` usa ~0.006 no matiz da marca, `warm` desloca
  para o quente e aplica ~0.012. Valores finais calibrados por teste visual no playground.
- **Status harmonizado**: info/success/warning/danger têm matiz semântico fixo
  (com faixa de tolerância), mas croma e luminosidade-base derivadas da marca.
  Exceção: se a marca cair dentro da faixa de matiz de um status (ex.: marca verde
  vs. success), o status é deslocado para manter distância perceptual mínima
  (distância OKLab ΔE ≥ 0.08 entre os fills da marca e do status).
- **Light e dark** são resolvidos separadamente a partir das mesmas sementes.
  O dark não é inversão: tem alvos de luminosidade e contraste próprios.

### 4.3 Solver de contraste

Para cada par texto/fundo declarado na tabela de papéis, o motor busca (bissecção
na luminosidade OKLCH, mantendo matiz e croma) o primeiro valor que atinge a meta:

| Par | `standard` | `high` |
|---|---|---|
| texto principal / superfícies | WCAG 7:1 | 7:1 + APCA Lc 90 |
| texto secundário / superfícies | 4.5:1 | 7:1 |
| `on-*` / `*-fill` | 4.5:1 | 7:1 |
| `*-text` / `*-subtle` e superfícies | 4.5:1 | 7:1 |
| borda de controle / superfície | 3:1 | 4.5:1 |
| `focus` / superfície adjacente | 3:1 | 4.5:1 |

`on-*` escolhe entre quase-branco e quase-preto (tingidos pela rampa) pelo que
oferecer mais contraste e, se nenhum atingir a meta, o fill é ajustado.

### 4.4 Estados de interação como camadas

Hover, pressed e selected não são hex por família. São overlays:

```css
--state-hover:    color-mix(in oklab, var(--state-base) 6%, transparent);
--state-pressed:  color-mix(in oklab, var(--state-base) 10%, transparent);
--state-selected: color-mix(in oklab, var(--state-base) 14%, transparent);
```

`--state-base` é `fg` em superfícies neutras e a cor do intent em superfícies
tingidas. Exceção: `*-fill-hover`/`*-fill-pressed` de fills sólidos são gerados pelo
motor (passo de luminosidade), porque overlay sobre fill saturado suja a cor.

## 5. Contrato de ênfase (60/30/10)

### 5.1 Dois eixos

- `emphasis`: `low` (60) · `medium` (30) · `high` (10) — **quanto** chama atenção.
- `intent`: `neutral` (padrão) · `brand` · `accent` · `info` · `success` · `warning` · `danger` — **qual significado**.

`emphasis="high"` sem `intent` explícito resolve para `intent="brand"`.

### 5.2 Papéis gerados (L3)

| Camada | Papéis |
|---|---|
| low / 60 | `canvas`, `surface`, `raised`, `sunken`, `fg`, `fg-muted`, `fg-subtle`, `fg-disabled`, `border`, `border-subtle` |
| medium / 30 | `structure`, `structure-fg`, `structure-border`, `selected`, `track`, `fill-neutral`, `fill-neutral-hover` |
| high / 10 | `emphasis-fill`, `emphasis-fill-hover`, `emphasis-fill-pressed`, `on-emphasis`, `emphasis-subtle`, `emphasis-text`, `emphasis-border`, `focus` |
| intents | para cada intent: `{intent}-fill`, `-fill-hover`, `-fill-pressed`, `on-{intent}`, `-subtle`, `-text`, `-border` |
| outros | `overlay` (scrim), `state-*` (4.4) |

Prefixo CSS: `--ui-*`. Utilitários Tailwind v4 expostos via `@theme inline`
(ex.: `bg-surface`, `text-fg-muted`, `bg-emphasis-fill`).

### 5.3 Tabela central de resolução

Um único módulo `src/theme/emphasis.ts` mapeia `(emphasis, intent, variant?)` →
`{ classes de cor, nível de movimento, data-layer }`. Componentes **não** escolhem
cor localmente; consomem essa tabela. Exemplo de resolução:

| emphasis | intent | Aparência | Movimento padrão | `data-layer` |
|---|---|---|---|---|
| high | brand | fill da marca + `on-emphasis` | expressive | high |
| high | danger | fill danger + `on-danger` | expressive | high |
| medium | neutral | `fill-neutral` + `fg` | responsive | medium |
| medium | danger | `danger-subtle` + `danger-text` | responsive | medium |
| low | neutral | transparente + `fg`, hover por state layer | calm | low |
| low | danger | transparente + `danger-text` | calm | low |

### 5.4 Garantias do orçamento

1. **Por construção**: componentes estruturais (Sidebar, Toolbar, Tabs, cabeçalho de
   tabela, Navbar) nascem `medium`; só o que é marcado `high` usa a marca.
2. **Guarda em dev**: regiões declaradas (`data-budget-region` em `Toolbar`,
   rodapé de `Dialog`, `ActionBar`, `PageHeader`) emitem `console.warn` quando
   contêm mais de um elemento `high` visível. Removido em produção.
3. **`theme:lint` expandido**: em `src/components` e `src/templates`, proíbe hex,
   `rgb()`/`hsl()` literais, paleta crua do Tailwind (`bg-red-500`) e qualquer
   utilitário de cor que não seja papel L3.
4. **`<BudgetInspector />`** (dev): overlay que percorre o DOM visível, soma a área
   pintada por `data-layer` (descontando sobreposição por ordem de pintura
   aproximada: elemento mais profundo vence) e exibe `low / medium / high` em %,
   com veredito contra a meta 60/30/10 (tolerância configurável, padrão ±8 p.p. em
   low/medium e ≤ 12% em high) e heatmap opcional.

## 6. Primitivas (L2)

### 6.1 Forma

| Token | precise | balanced | soft |
|---|---|---|---|
| `radius-control` | 6 | 8 | 10 |
| `radius-chip` | 4 | 6 | 999 |
| `radius-card` | 8 | 12 | 16 |
| `radius-panel` (dialog, drawer, popover grande) | 12 | 16 | 20 |
| `radius-pill` | 999 | 999 | 999 |

`radius-pill` é reservado a elementos semanticamente redondos: switch, avatar,
progress, badge de contagem. Helper concêntrico:
`--radius-inner: max(2px, calc(var(--radius-outer) - var(--inset)))`.

### 6.2 Densidade

| Token | compact | comfortable | spacious |
|---|---|---|---|
| `control-sm` | 28 | 32 | 36 |
| `control-md` | 32 | 36 | 40 |
| `control-lg` | 36 | 40 | 48 |
| `space-unit` | 4 | 4 | 4 (escala multiplicada por 0.875 / 1 / 1.125) |

Aplicada por `data-density` em qualquer nó (raiz ou região).

### 6.3 Tipografia

- Fontes `.woff2` (subset latin + latin-ext) dentro da lib em `src/styles/fonts/`,
  licença OFL incluída. Sem `@fontsource`.
- Papéis: `caption 11/16`, `label 12/16`, `body 13/20`, `body-lg 14/22`,
  `title-sm 16/24`, `title 20/28`, `display 24/32`, `display-lg 30/38`.
- Pesos: 400, 500, 600.
- `tabular-nums` automático nos papéis de dado e em `font-mono`.

### 6.4 Elevação

`flat · raised · overlay · modal`. Light: sombras em duas camadas tingidas pelo
neutral (nunca preto puro). Dark: elevação por luminosidade da superfície + borda
sutil; sombra mínima.

### 6.5 Movimento

```ts
type MotionLevel = "calm" | "responsive" | "expressive";
interface MotionSpec {
  stiffness: number; damping: number; mass: number; // spring
  duration: number;      // ms, para transições não-spring (cor, opacidade)
  amplitude: number;     // multiplicador de gestos (ícones, deslocamentos)
  pressScale: number;    // escala no press
  stagger: number;       // ms entre itens em listas
}
```

Valores iniciais (calibrados no playground; partem dos protótipos aprovados):

| | calm | responsive | expressive |
|---|---|---|---|
| curva | sem overshoot | overshoot leve | overshoot forte |
| duration | 160 | 280 | 420 |
| amplitude | 0.45 | 1 | 1.6 |
| pressScale | 0.985 | 0.96 | 0.92 |

- **Spring → CSS `linear()`**: o motor simula a mola (integração numérica) e
  amostra a curva em N pontos (limite de pontos com simplificação por tolerância)
  para `--motion-{level}-ease`. A duração da spring é calculada até o repouso
  (tolerância de deslocamento) e exposta como `--motion-{level}-spring-duration`.
- **Nível efetivo** = `min(nível do contexto, teto do tema)`. O contexto vem de
  `emphasis` (5.3) ou de `MotionScope`. Exposto como atributo `data-motion` para
  que CSS puro também herde.
- **Ajuste fino em três níveis** (todos mesclam `Partial<MotionSpec>`):
  tema (`motion.tune`), escopo (`<MotionScope tune>`), instância (prop `motion`).
  Tudo é emitido como CSS var, permitindo um futuro MotionLab (fora de escopo).
- **Primitivas** (sem dependências):
  - `animate(el, keyframes, { level | spec })` — wrapper fino de WAAPI que respeita nível e reduced motion.
  - `<Presence>` — entrada/saída na montagem/desmontagem (mantém o nó até a animação de saída terminar).
  - `useFlip()` — animação de reordenação (FLIP).
  - `useMotion()` — lê nível e spec efetivos.
  - `<MotionScope level? tune?>`.
- **Reduced motion**: deslocamento, rebote, rotação e escala viram fade/cor com
  `duration` curta. Feedback de estado nunca é removido.

## 7. Runtime e build

- `ThemeProvider` recebe `theme: ThemeConfig | id de preset` e `mode`. Presets são
  pré-gerados em CSS no build (`npm run theme:build` chama `createTheme` via `tsx`)
  e aplicados por `data-theme`, sem flash. Configs não-preset são resolvidas em
  runtime e injetadas em um `<style>` gerenciado.
- `getThemeScript()` (pré-hidratação) continua aplicando modo e tema antes do paint.
- `ThemeScope` permite subárvore com outro tema/densidade/movimento.
- Presets: `forest`, `graphite`, `orchestrator` reescritos como config (3–8 linhas
  cada), mais 2 presets novos de amplitude (um quente/expressivo, um sóbrio/alto
  contraste).

## 8. Playground

`npm run playground` — app Vite local dentro da lib (não publicado):

- editor de tema com todos os botões do `ThemeConfig` e seletor de cor da marca;
- light e dark lado a lado;
- painel de rampas e de pares de contraste com os valores medidos;
- tela de exemplo representativa (shell com navegação, tabela, formulário, diálogo);
- `BudgetInspector` ligado;
- demonstração dos três níveis de movimento;
- exportar a config atual como código.

## 9. Impacto nos componentes existentes

A v2 quebra os tokens antigos (`--ui-brand`, `--ui-secondary`, `data-tone`, utilitários
`bg-tone*`, `bg-primary*`). Neste ciclo, os componentes existentes recebem **somente a
adaptação mínima** para compilar e passar nos testes: troca de tokens e substituição
de `tone`/`variant` cromático por `emphasis`/`intent`. Nenhum redesenho visual.
Redesenho e componentes novos são o subprojeto 3. O `frontend/` do Mod Orchestrator
**não** é migrado neste ciclo (subprojeto 4). Como o trabalho é feito direto no
`master`, o primeiro passo do ciclo congela a lib atual em `dettmann-ui-v1/` (cópia
sem histórico próprio) e aponta `frontend/package.json` para
`file:../dettmann-ui-v1`, mantendo o app compilando. O subprojeto 4 volta a apontar
para `dettmann-ui-vnext` e remove `dettmann-ui-v1/`.

## 10. Testes

- **Propriedades do motor**: geração de centenas de sementes aleatórias (seed fixa
  no gerador para reprodutibilidade) × todos os botões; afirma todas as metas da
  tabela 4.3 nos dois modos e que todo valor está no gamut sRGB.
- **Casos-limite**: amarelo puro, quase preto, quase branco, cinza sem croma,
  marca dentro da faixa de cada status.
- **Snapshots** dos presets (mudança no algoritmo aparece no diff).
- **Conversões de cor** contra valores de referência conhecidos.
- **Spring → linear()**: começa em 0, termina em 1, overshoot coerente com
  amortecimento, número de pontos limitado.
- **Contrato de ênfase**: tabela completa; guarda de orçamento dispara e não
  dispara nos casos certos.
- **Movimento**: nível efetivo respeita teto; mescla de `tune` em três níveis;
  reduced motion degrada.
- **Componentes existentes**: suíte atual continua verde após a adaptação mínima.
- Validação: `npm run typecheck`, `npm test -- --run`, `npm run theme`.

## 11. Erros

- Semente inválida (cor não parseável): erro descritivo em dev; em produção,
  fallback para o preset padrão com `console.error`.
- Override que viola meta de contraste: `console.warn` em dev com o par e o valor
  medido; o override é respeitado.
- Spec de movimento inválida (ex.: `damping ≤ 0`): erro em dev; clamp para limites
  seguros em produção.

## 12. Fora do escopo deste ciclo

Ícones animados (subprojeto 2); redesenho e novos componentes (3); migração do Mod
Orchestrator (4); MotionLab; editor de tema dentro do Mod Orchestrator.

## 13. Documentação a atualizar

- `dettmann-ui-vnext/docs/theme-system.md`, `architecture.md`, `decisions.md`, `README.md`.
- Skills `.cursor/skills/dettmann-ui/theme-first` e `component-authoring` (novo contrato `emphasis × intent`, proibição de cor local).
- `mod-orchestrator-spec-v2/docs-ia/decisoes.md`: nova decisão registrando a adoção
  da dettmann-ui v2 e a migração planejada (subprojeto 4).
