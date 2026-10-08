# dettmann-ui v2 — Ícones animados e loaders

Status: em revisão (2026-10-08).
Subprojeto 2 de 4 da reformulação da dettmann-ui v2 (roadmap: seção 2 de
`2026-10-06-v2-foundation-design.md`). Depende da fundação (subprojeto 1, concluída).
Referência visual: `referencia-icones-animados.md` (vídeos em `IconesAnimados/`).

## 1. Objetivo

Um conjunto próprio de ícones monolinha com partes animadas, para usar e distribuir em
qualquer interface feita com a lib, com:

- **intensidade do gesto seguindo a ênfase**: o mesmo ícone fica sutil num item de menu
  (`calm`) e vivo num CTA (`expressive`), sem configuração no consumidor;
- **dois modos**: `action` (uma vez: hover, press, foco, mudança de estado) e `loop`
  (estado contínuo: implantando, sincronizando, baixando);
- **família de loaders** que substitui o `Spinner` legado.

Critério de sucesso: trocar `<Icon icon={Trash2} />` por `<TrashIcon />` dentro de um
`Button` faz o ícone reagir ao hover/press do botão com a amplitude do nível do botão,
respeitando teto do tema, `tune` e redução de movimento, sem nenhuma prop extra.

## 2. Decisões do brainstorming

| Tema | Decisão |
|---|---|
| Catálogo | Curado pela necessidade: ~55 glifos que a lib e o Mod Orchestrator usam (seção 8). Os demais continuam lucide estático via `Icon` |
| Geometria | Copiada do Lucide (ISC) para arquivos próprios, separada em partes nomeadas e ajustada quando a animação exigir. `NOTICE` com o aviso ISC/MIT. Visual idêntico ao lucide estático restante |
| Gatilho do `action` | Herdado do controle interativo mais próximo (hover/press/foco), com `playKey` para mudança de estado e `trigger="none"` para desligar |
| Escrita das animações | Vocabulário central de técnicas (fábricas de keyframes × `amp`); cada ícone só declara partes e coreografia |
| Loaders | `Loader` com variantes abstratas substitui `Spinner`; ícones narrativos são o modo `loop` dos próprios ícones |
| Escopo na lib | Ícones + loaders + adoção mínima nos componentes existentes onde o glifo existir. Sem redesenho (subprojeto 3) |
| Arquitetura | `defineIcon` (definição como dado) + um controlador delegado por documento |

Abordagens descartadas: keyframes CSS por ícone (fere a regra "sem keyframes em
componente", replay por estado frágil, reduz movimento em duplicidade); função livre por
ícone (sem linguagem comum); animar o `lucide-react` em runtime por índice de filho
(quebra em silêncio a cada atualização do lucide); hook por instância (listeners
proporcionais ao número de ícones); registro por nome `<AnimatedIcon name>` (sem
tree-shaking nem checagem por import).

## 3. Arquitetura

```
src/icons/
  define-icon.tsx   defineIcon(), tipos, renderizador SVG
  techniques.ts     vocabulário de técnicas
  controller.ts     controlador delegado do gatilho herdado
  glyphs/*.tsx      um arquivo por ícone
  catalog.ts        índice de todos (importado só por playground e testes)
  index.ts          exports públicos (subpath `dettmann-ui/icons`)
  NOTICE            licença ISC do Lucide (inclui o aviso MIT do Feather)
src/motion/
  animate-loop.ts   primitiva nova de loop (seção 6.1)
src/components/loader/
  index.tsx         Loader
```

- `package.json` ganha `"./icons": { types, import }` apontando para `dist/icons/index.*`.
  O tsup já compila `src/**` sem bundle; nada muda nele. `NOTICE` entra em `files`.
- O índice raiz (`dettmann-ui`) **não** reexporta os glifos (tree-shaking e tamanho do
  barrel); exporta `Loader`, `defineIcon` e os tipos.
- Camadas: ícones são primitivas (L2/componente). Consomem `animate`/`animateLoop`,
  `readMotion` e `currentColor`; nenhuma cor, duração ou curva própria.

## 4. Anatomia de um ícone

```tsx
// src/icons/glyphs/trash.tsx — geometria adaptada do Lucide `trash-2` (ISC)
export const TrashIcon = defineIcon({
  name: "trash",
  parts: {
    lid: <><path d="M3 6h18" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>,
    body: <><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" /></>,
  },
  origin: { lid: "100% 100%" },
  action: { lid: lift({ y: -2.5, rotate: 14 }), body: squash({ amount: 0.06, delay: 40 }) },
});
```

### 4.1 `defineIcon(def)`

```ts
interface IconDefinition {
  name: string;                                   // kebab-case, único no catálogo
  parts: Record<string, ReactNode>;               // ordem = ordem de pintura
  origin?: Record<string, string>;                // transform-origin por parte (padrão "50% 50%")
  action?: Choreography;                          // ausente = ícone só estático
  loop?: Choreography;                            // só ícones com estado contínuo
}
type Choreography = Partial<Record<string | "root", Technique | Technique[]>>;
```

A chave especial `root` anima o ícone inteiro (ex.: `squash` do `plus`). Retorna um
componente com `displayName` (`TrashIcon`) e `definition` estática, que o catálogo usa.
Em dev, `defineIcon` valida: partes referenciadas em `action`/`loop`/`origin` existem,
nome em kebab-case.

### 4.2 Renderização

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="…"
     stroke-linecap="round" stroke-linejoin="round" overflow="visible"
     data-animated-icon="trash" data-trigger="auto" aria-hidden="true">
  <g data-part="lid" style="transform-box: fill-box; transform-origin: 100% 100%">…</g>
  <g data-part="body" style="transform-box: fill-box; transform-origin: 50% 50%">…</g>
</svg>
```

Paths usados por `draw` recebem `pathLength="1"` automaticamente.

### 4.3 Props públicas

Iguais às do `Icon` para a troca ser direta: `size` (`xs`…`2xl`, mesmo mapa
`size → strokeWidth`), `intent`, `label` (com label: `role="img"` + `aria-label`; sem
label: `aria-hidden`), `strokeWidth`, `className`. Mais:

| Prop | Padrão | Efeito |
|---|---|---|
| `trigger` | `"auto"` | `"auto"`: reage ao controle pai (seção 5). `"none"`: só `playKey`/`loop` |
| `playKey` | — | quando muda (não na montagem), cancela o `action` em curso e toca de novo |
| `loop` | `false` | roda a coreografia `loop`; enquanto ativo, gatilhos de `action` são ignorados. Em ícone sem `loop`: `console.warn` em dev, no-op |

Ref encaminhada ao `<svg>`; demais props SVG/DOM repassadas.

### 4.4 Relação com o `Icon`

`Icon` continua como wrapper do lucide para glifos fora do catálogo. Os componentes da
lib passam a importar o ícone próprio quando ele existir (seção 9). A regra da
skill-use "ícone lucide solto → use `Icon`" ganha a precedência: "existe no catálogo →
use o ícone próprio; senão `Icon`".

## 5. Gatilho herdado: controlador delegado

Um único controlador por `document`, instalado na montagem do primeiro ícone com
`trigger="auto"` e removido quando o último desmonta (contagem de referências).

**Controle interativo** = ancestral mais próximo que casa com
`button, a[href], summary, label, [role=button], [role=link], [role=menuitem],
[role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=option],
[role=switch], [role=checkbox], [role=radio], [role=treeitem], [data-icon-trigger]`.
`data-icon-trigger` é a saída para controles customizados.

**Eventos** (no `document`, fase de captura, passivos):

| Evento | Condição | Toca |
|---|---|---|
| `pointerover` | `pointerType` `mouse`/`pen` e `relatedTarget` fora do controle (entrada real, não movimento entre filhos) | `action` |
| `pointerdown` | qualquer ponteiro, botão primário | `action` |
| `focusin` | o controle casa com `:focus-visible` (teclado) | `action` |

**Ícones afetados**: `[data-animated-icon][data-trigger=auto]` dentro do controle cujo
controle mais próximo é o próprio controle (um ícone num botão aninhado pertence ao botão
interno). Controle `:disabled` ou `aria-disabled="true"` não toca.

**Interrupção**: se o `action` do ícone ainda está tocando, gatilhos automáticos são
ignorados (sem gagueira em hover + press). `playKey` sempre cancela e reinicia. Saída do
hover não interrompe: o gesto termina e volta ao repouso.

Cada ícone se registra num `WeakMap<Element, IconHandle>` (`play()`, `isPlaying()`); o
controlador nunca toca em React.

## 6. Vocabulário de técnicas e intensidade

**Contrato**: `technique(params) → (m: MotionValues) => { keyframes: Keyframe[]; options?: AnimateOptions; reduced?: Keyframe[] }`.
O motor da coreografia lê `readMotion(svg)` uma vez por disparo, chama cada técnica e
executa por parte com `animate()` (ou `animateLoop()` no modo loop). Toda técnica de
`action` termina no estado de repouso (`fill: "none"`).

| Técnica | Gesto | Parâmetros principais | Modo |
|---|---|---|---|
| `squash` | encolhe e volta com overshoot | `amount` (padrão 0,12) | action |
| `lift` | parte desloca/gira e volta | `x`, `y`, `rotate` | action |
| `nudge` | desloca na direção e volta | `x`, `y` (padrão 2) | action / loop |
| `rotate` | gira N° e volta | `deg` | action |
| `spin` | rotação contínua | `turns`, `period` | loop |
| `draw` / `undraw` | traço desenhado/apagado (`stroke-dashoffset` com `pathLength=1`) | `from` | action / loop |
| `flip` | `rotateY` com perspectiva | `deg` (padrão 180) | action |
| `trail` | linhas de velocidade surgem e somem (partes `trail-*`) | `length` | action / loop |
| `pulse` | escala e opacidade respirando | `amount`, `period` | loop |
| `stagger(t, ordem)` | aplica `t` às partes em sequência, espaçadas por `m.stagger` | `ordem` | action / loop |

Fora deste ciclo: morph de silhueta e glifo embaralhado.

**Ênfase → intensidade** (sem token novo):
- magnitude = valor-base × `m.amp` (`calm` 0,45 · `responsive` 1 · `expressive` 1,6);
- duração e curva do `action` = `m.springDuration` e `m.ease` do nível (o overshoot vem da mola);
  gestos de ida-e-volta rodam em duas fases (R16): ida `ease-out` em `m.duration · 0,45`, volta com
  `m.ease` em `m.springDuration`, timing linear (`keyframeEasing`) — o overshoot cai sobre o repouso;
  traços (`draw`/`undraw`/`trail`) não usam mola (o offset não pode ultrapassar);
- nível = `data-motion` mais próximo (Button `high` → `expressive`, item `low` → `calm`,
  ícone sem contexto → `calm`);
- `draw` não escala por `amp` (é conteúdo, não gesto); o nível muda só o tempo.

**Limite geométrico**: cada técnica expõe `extent(params) → { translate, rotate, scale }`
(deslocamento máximo em unidades do viewBox, rotação máxima em graus, desvio máximo de
escala). Teste de catálogo, para toda técnica de `action` de todo ícone, com `amp` 1,6:
`translate ≤ 3`, `rotate ≤ 30°` (exceto `rotate` declarado em ícone de rotação natural —
refresh, undo, settings, sun, moon — limitado a 180°), `|scale − 1| ≤ 0,25`. `spin` e
`flip` são isentos (rotação completa é o gesto). O SVG usa `overflow: visible`.

### 6.1 Loop: `animateLoop` (primitiva nova em `src/motion`)

`animate()` limita iterações a 1 sob redução de movimento, o que é certo para gestos, mas
não para estados contínuos. Nova primitiva:

```ts
animateLoop(el, keyframes, { period, delay?, easing? }): Animation | null
```

- iterações infinitas; `period` em ms é dado da técnica (ex.: `spin` 1000, `pulse` 1600),
  **não** escalado pelo nível — a ênfase muda a amplitude, não a cadência;
- timing sempre `linear`; loops de ida-e-volta põem `ease-in-out` em cada keyframe. A mola
  `m.ease` não é usada em loop (extrapolaria a cada ciclo; R16);
- **redução de movimento**: descarta os keyframes e roda um pulso de opacidade lento
  (1 → 0,5 → 1, 2000 ms, infinito). O estado continua perceptível; nada se desloca;
- sem WAAPI (jsdom/SSR): `null`.

Os ícones param o loop (`cancel()`) quando `loop` vira `false` ou desmontam.

### 6.2 Redução de movimento no `action`

`animate()` já remove transform/translate/rotate/scale. Técnicas que animam outra coisa
(`draw`/`undraw` via `stroke-dashoffset`, `trail`) fornecem `reduced`: mergulho de
opacidade 1 → 0,4 → 1. Feedback nunca é removido.

## 7. `Loader`

Componente em `src/components/loader`, exportado pela raiz. Substitui `Spinner`
(removido; entrada em `migration.md`).

```tsx
<Loader />                                  // variant "arc", size "md", label "Loading"
<Loader variant="dots" size="sm" intent="brand" label={t("deploy.running")} />
```

| Prop | Valores | Padrão |
|---|---|---|
| `variant` | `arc` (arco de comprimento variável girando), `dots` (três pontos em onda), `pulse` (círculos que crescem com crossfade preenchimento→anel), `bars` (barras em equalizador) | `arc` |
| `size` | `xs` `sm` `md` `lg` `xl` (mesmos tamanhos do `Spinner`) | `md` |
| `intent` | qualquer `Intent` (`text-intent-fill` + `data-intent`); sem intent, `currentColor` | — |
| `label` | texto acessível (D-009) | `"Loading"` |

- SVG monolinha no mesmo viewBox 24 e traço dos ícones; animado por `animateLoop`.
- Amplitude (altura da onda dos `dots`, escala do `pulse`) × `m.amp` do contexto.
- `role="status"`, `aria-label`, `<span class="sr-only">` como hoje.
- Sob redução de movimento: pulso de opacidade da 6.1.

**Ícones narrativos** (vídeo B) não são variantes do `Loader`: são o `loop` dos ícones
(seção 8). Uso: `<RocketIcon loop />` durante deploy, `<RefreshIcon loop />` durante
sync. Precisa de texto de status junto quando for o único indicador (skill-use).

## 8. Catálogo inicial (~55)

Nomes de componente em PascalCase + `Icon`; glifo Lucide de origem entre parênteses
quando o nome muda. `◯` = só `action`; `∞` = também `loop`.

**Navegação e controles (lib)**
chevron-down, chevron-up, chevron-left, chevron-right, chevron-first, chevron-last ◯ nudge ·
arrow-up, arrow-down ◯ nudge · arrow-up-down ◯ stagger(nudge) · x ◯ squash+rotate ·
plus, minus ◯ squash · check ◯ draw · check-check ◯ stagger(draw) ·
more-horizontal ◯ stagger(nudge) · menu ◯ stagger · search ∞ nudge (loop: lupa
procurando) · filter ◯ squash · settings ∞ rotate (loop: spin) · home (house) ◯ lift ·
panel-left-open, panel-left-close ◯ nudge

**Arquivos e dados**
folder, folder-open ◯ lift · folder-plus ◯ squash · file ◯ flip · file-search ∞ nudge ·
file-archive ◯ lift · upload (upload-cloud) ∞ nudge+trail · download ∞ nudge+trail ·
copy ◯ nudge · trash (trash-2) ◯ lift+squash · layers ◯ stagger(lift) ·
list-ordered ◯ stagger(nudge) · database-backup ∞ stagger(pulse)

**Status**
info ◯ squash · circle-check ◯ draw · circle-alert ◯ nudge · triangle-alert ∞ pulse ·
circle-x (x-circle/octagon-x) ◯ squash+rotate · circle-help ◯ rotate · bell ∞ rotate
(sino balançando) · ban ◯ draw

**Ações do Mod Orchestrator**
rocket (deploy) ∞ nudge+trail · refresh (refresh-cw) ∞ rotate/spin · undo (rotate-ccw)
◯ rotate · history ∞ spin (ponteiros) · scan-search ∞ nudge · play ◯ squash · power ◯
draw · lock, lock-open ◯ lift · eye, eye-off ◯ squash · pin ◯ lift · package,
package-plus ◯ lift · sparkles ∞ stagger(pulse) · sun ◯ rotate · moon ◯ rotate ·
clock ∞ spin · git-compare ◯ nudge · puzzle ◯ lift

A técnica exata por ícone é calibrada no playground; a lista acima é o ponto de partida.
Glifos fora da lista continuam via `Icon` + lucide.

## 9. Adoção mínima na lib

Troca de glifo onde ele existe no catálogo, sem redesenho:

| Componente | Mudança |
|---|---|
| `Button` | `loading` usa `Loader` (variant `arc`) no lugar de `Spinner` |
| `StatusToggle` | `Loader2` → `Loader`; `Check`/`Minus`/`Ban` próprios |
| **SVG inline** → catálogo: `Accordion` (chevron; `nudge` no hover, a rotação aberto/fechado continua como hoje), `Checkbox` (check com `trigger="none"` e `playKey={checked}`: desenha ao marcar), `Modal`/`Drawer` close e `Toast` (X), `DatePicker`, `Input.Combobox`, `Progress` (onde o glifo existir) | SVG avulso some do componente |
| **lucide** → catálogo: `Tag`, `Inspector`, `Lightbox` (X, chevrons), `Input.Select` (check, chevron), `Input.Number` (plus/minus), `Pagination` (chevrons, chevron-first/last), `Carousel`, `Calendar` (chevrons, plus, search), `DataTable` (setas de ordenação, chevrons), `ReorderableList` (chevrons), `Tree`/`FileList` (folder, folder-open, file, more-horizontal), `FilterBar`/`Command` (filter, search), `Gallery` (plus), `Stepper` (check), `LogViewer` (info, circle-check, circle-alert, triangle-alert, search), `FeaturedIcon` (circle-check), `ConfirmDialog` (triangle-alert, check, info, trash), `FileDropzone` (upload), `Sidebar` (menu, panel-left-open/close) | glifos fora do catálogo (`Columns3`, `ImageOff`, `Star`, `Terminal`, `GripVertical`…) seguem via `Icon` |
| `Spinner` | removido do código, dos exports e do `component-matrix` |

Onde a troca não for óbvia (ícone passado pelo consumidor como `LucideIcon`), a prop
passa a aceitar `ComponentType<IconLikeProps>`, que inclui os dois tipos; nenhum
componente perde a capacidade de receber lucide.

## 10. Playground

Página "Ícones" no `npm run playground`:

- grade do catálogo com nome, técnicas e indicador `∞`;
- seletor de contexto: solto, item de menu (`low`), botão `medium`, CTA `high`, para ver
  o mesmo ícone nos três níveis lado a lado;
- alternadores: loop, redução de movimento (`data-reduce-motion`), teto do tema;
- botão "tocar todos" (dispara `playKey` em lote) e hover individual;
- seção de `Loader` com as quatro variantes × tamanhos × intents.

## 11. Testes

- **Catálogo (propriedade sobre todos os glifos)**: renderiza sem erro; `data-part`
  únicos; toda parte citada em `action`/`loop`/`origin` existe; nenhum atributo de cor
  além de `currentColor`/`none`; viewBox 24; `extent × 1,6 ≤ 3`; nome kebab-case único;
  ícone com `∞` na lista tem `loop`.
- **Técnicas**: cada técnica escala magnitude por `amp` (calm < responsive < expressive),
  termina no repouso, fornece `reduced` quando não é transform.
- **Controlador** (stub de `el.animate`, padrão de `motion.test.tsx`): hover de mouse
  num botão toca o ícone; `pointerType="touch"` não toca no hover mas toca no
  `pointerdown`; foco por teclado toca, foco por clique não duplica; ícone em controle
  aninhado pertence ao interno; controle desabilitado não toca; `trigger="none"` não
  toca; gatilho durante animação é ignorado; `playKey` reinicia e não toca na montagem;
  instalação/remoção por contagem de referências.
- **Nível**: ícone dentro de `Button emphasis="high"` lê amp `expressive`; dentro de item
  `low`, `calm`.
- **Loop**: `animateLoop` com iterações infinitas; sob `data-reduce-motion="true"` só
  opacidade; `loop=false` e desmontagem cancelam; `loop` em ícone sem coreografia avisa.
- **Loader**: `role="status"`, label, intent, variantes, redução de movimento.
- **A11y**: com e sem `label`; axe nas páginas de teste existentes que passam a usar os
  ícones.
- **Adoção**: suíte atual verde; `Checkbox` desenha o check ao marcar.
- Validação (dentro de `dettmann-ui-vnext/`): `npm run typecheck`, `npm test -- --run`,
  `npm run theme`, `npm run build`.

## 12. Erros

- Definição inválida (parte inexistente, nome repetido): erro em dev no `defineIcon`;
  em produção o ícone renderiza estático.
- `loop` sem coreografia: `console.warn` em dev, no-op.
- Técnica com keyframes rejeitados pela WAAPI: comportamento do `animate()` (lança em
  dev, `null` em produção).
- Sem WAAPI/`document` (SSR, jsdom): ícones renderizam estáticos; o controlador não se
  instala.

## 13. Fora do escopo

Migração do `frontend/` do Mod Orchestrator (subprojeto 4); redesenho e micro-interações
novas nos componentes (subprojeto 3); morph e glifo animado; substituição total do lucide
(decidida depois, sabendo quantos glifos sobram); loaders determinados (o `Progress`
existente cobre).

## 14. Documentação e skills a atualizar

- `docs/decisions.md`: D-027 (ícones próprios a partir do Lucide, catálogo curado),
  D-028 (gatilho herdado por controlador delegado), D-029 (vocabulário de técnicas e
  intensidade por `amp`), D-030 (`animateLoop` e redução de loops), D-031 (`Loader`
  substitui `Spinner`).
- `docs/component-matrix.md` (ícones, `Loader`, remoção do `Spinner`),
  `docs/migration.md` (`Spinner` → `Loader`, `Icon` → ícone próprio),
  `docs/architecture.md` (pasta `icons`, subpath), `README.md`.
- Skills `dettmann-ui-use` (escolher ícone próprio vs `Icon`, `loop` + texto de status,
  `Loader`, `playKey`), `dettmann-ui-author` (como criar um ícone: partes, técnicas,
  limite geométrico, testes de catálogo) e `dettmann-ui-improve` (detectar lucide solto
  com equivalente no catálogo, `Spinner`, estado contínuo sem indicador). Reinstalar no
  Mod Orchestrator com `npm run skills:install`.
- `mod-orchestrator-spec-v2/docs-ia/decisoes.md`: registro curto de que a v2 ganha o
  catálogo de ícones animados (uso pelo app no subprojeto 4).
