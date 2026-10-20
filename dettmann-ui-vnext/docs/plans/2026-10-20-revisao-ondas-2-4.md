# Revisão independente das ondas 2 a 4 (pendência P3 do redesenho)

Escopo: `src/components` e `src/templates` das ondas 2 (feedback e overlays), 3 (dados) e 4 (estrutura) de `WAVE_FILES`, mais `primitives/skeleton.tsx` e `primitives/backdrop.tsx`. Método da skill `dettmann-ui-improve`, heurísticas A (1, 2, 3, 11) e matriz B filtrada pelo que cada componente precisa. Feita em 2026-10-20 a partir do código, sem olhar as revisões anteriores; nenhum arquivo foi alterado durante a revisão.

| prioridade | achado | onde | correção | impacto | esforço |
|---|---|---|---|---|---|
| P1 | Textos fixos em inglês sem prop para localizar | `components/lightbox/index.tsx:81,94,110,121` ("Image preview", "Close image preview", "Previous image", "Next image") | prop `labels` com os quatro nomes, como `ReorderableList` faz (`labels?: …`) | alto | baixo |
| P1 | Componente sem teste | `components/media-image` (estado de falha, `fallback`), `components/diff-viewer` | `src/__tests__/<nome>.test.tsx` | médio | baixo |
| P2 | Overlay sem animação de entrada e saída (D-035) | `components/lightbox/index.tsx:66` | `useExitPresence(open)` na raiz e `Presence` com `overlayEnter`/`overlayExit` no painel, como `Modal` | médio | médio |
| P2 | Imagem sem estado de carregando | `components/media-image/index.tsx:64` | `Skeleton` enquanto `onLoad` não chegou | médio | médio |
| P3 | Variantes de raio que não mudam nada (`sm`, `md` e `lg` dão `rounded-control`) | `components/media-image/index.tsx:28-33` | reduzir a `none` e `control`, ou mapear para `rounded-chip`/`rounded-control`/`rounded-card` | baixo | baixo |
| P3 | `aria-label` em `div` sem papel (a alça de arrastar) | `components/reorderable-list/index.tsx:111-114` | `aria-hidden` na alça (os botões subir e descer já dão o caminho por teclado) | baixo | baixo |
| P3 | Tamanho de texto fora da escala (13 px) | `components/table/index.tsx:68` (`density="relaxed"`), `components/tabs/tabs.trigger.tsx:30` (`size="sm"`) | veio das pranchas (D-040); se a escala ganhar um passo de 13 px, trocar por ele | baixo | baixo |

Sem achados de cor crua, paleta solta, movimento manual, opacidade para desabilitado ou foco escrito à mão (o `wave-contract.test.ts` já barra esses). Teclado: menus, árvore, tabelas, abas, acordeão, overlays e lista reordenável têm navegação; a lista reordenável usa os botões subir e descer.

## Padrões que deveriam virar componente

Nenhum.

## Estado

Os dois P1 foram corrigidos em 2026-10-20: `Lightbox` ganhou `labels` (o FOMOD passa os nomes traduzidos) e `src/__tests__/media-diff-lightbox.test.tsx` cobre `MediaImage`, `DiffViewer` e os nomes do `Lightbox`. P2 e P3 ficam para o refinamento final.
