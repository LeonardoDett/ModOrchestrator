# Referência: ícones animados (insumo para o subprojeto 2)

Fonte: vídeos de exemplo (dois arquivos idênticos + um terceiro; removidos do repositório em 2026-10-09), analisados
quadro a quadro em 2026-10-06. Autor das peças: Sunil Talekar (via Pinterest). Uso apenas
como referência de linguagem; nenhum asset será copiado.

## Vídeo A — "UI action category, 200 animated icons"

Grade de ícones monolinha brancos sobre preto, todos animando em loop (~2,2 s).

Linguagem visual:
- traço ~1,5px a 24px, terminações e junções arredondadas;
- cantos de quadrados/retângulos arredondados (~r 4 em viewBox 24), coerente com a forma `balanced`;
- muitos ícones dentro de contêiner (círculo ou quadrado arredondado) — o contêiner é estável e o
  "conteúdo" anima.

Técnicas observadas (cada ícone usa 1–2, nunca todas):

| Técnica | Exemplos vistos |
|---|---|
| Squash & stretch com overshoot (o ícone inteiro encolhe e volta maior antes de assentar) | add-square, folder-plus, x |
| Movimento de parte (só um elemento se move) | tampa da lixeira levanta; setas de collapse entram e saem; ponteiro do relógio gira |
| Desenho/apagamento de traço (stroke draw) | check desenhado dentro do quadrado e depois apagado; círculo cortado |
| Rotação de direção com retorno | setas dentro de círculo giram 45° e voltam |
| Rastro/partículas | seta para a esquerda deixa traços atrás de si |
| Dispersão e reagrupamento com stagger | grade de 9 pontos se espalha e volta ponto a ponto |
| Stagger em linhas | ícone de ordenar: linhas deslizam em sequência |
| Flip 3D (rotateY com perspectiva) | relógio vira como cartão |
| Morph de forma | variações de porta/casa trocam de silhueta |
| Glifo animado | "CSS", "HTML", "HLS": uma letra gira ou embaralha |

Ritmo: ação curta (~300–500 ms) seguida de repouso; overshoot visível mas assentamento rápido —
corresponde ao nível `expressive` aprovado.

## Vídeo B — loaders e ícones narrativos

Ícones brancos em tiles escuros quadrados arredondados, organizados por categoria, em loop contínuo:

- **Circle**: arcos girando com comprimento variável, arcos múltiplos, traço tracejado.
- **Dots**: três pontos com onda, pulso, rotação em triângulo, troca de posição.
- **Fade circles**: círculos que crescem/encolhem e fazem crossfade de preenchimento para anel.
- **Ball**: bola quicando com squash ao tocar o chão e sombra que encolhe/cresce.
- **Time**: ponteiros girando, pêndulo, cuco, ampulheta que vira e escoa.
- **Wifi**: arcos acendendo em sequência, antena pulsando.
- **Icons (narrativos)**: lupa procurando, envelope voando com linhas de velocidade, pilha de fotos
  embaralhando, casa, seta de download caindo na bandeja, caminhão andando com linhas de velocidade,
  livro folheando.

São animações de **estado contínuo** (carregando, aguardando, processando), diferentes das do
vídeo A, que são de **ação pontual**.

## Implicações

Para o subprojeto 2 (ícones):
- Dois modos de disparo: `action` (uma vez: hover, clique, mudança de estado) e `loop` (estados
  contínuos: loaders, "implantando", "sincronizando").
- Cada ícone declara suas partes animáveis e a técnica; a amplitude vem de `--motion-amp`, então o
  mesmo ícone fica sutil num menu e vivo num CTA.
- Precisa de normalização de comprimento de traço (`pathLength="1"`) para draw/undraw, de
  `transform-box: fill-box` para pivôs por parte e de perspectiva para flips.
- Família de loaders como componente próprio, inspirada no vídeo B, mapeada aos estados do Mod
  Orchestrator (deploy, scan de conflitos, download, backup).
- Redução de movimento: ações viram crossfade; loops viram pulso de opacidade lento ou ficam estáticos
  com indicador textual.

Para o subprojeto 1 (já incorporado ao plano): `animate()` repassa `delay`, `iterations`,
`direction` e `fill` à WAAPI, para suportar loops, stagger e coreografias de várias partes.
