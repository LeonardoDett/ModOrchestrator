# Plugins e Load Order

## Regra fundamental

Plugin management é capability do jogo. Nem todo jogo possui plugins.

## Plugin discovery

O adapter identifica arquivos relevantes, estado enabled/disabled e metadata necessária para ordenação.

## Load order

Pode ser:

- manual;
- automático por solver;
- baseado em arquivo;
- fornecido por ferramenta externa;
- híbrido.

Vortex registra sistemas de load order por jogo e pode usar validação e serialização específicas. citehttps://github.com/Nexus-Mods/Vortex/blob/master/packages/vortex-api/README.md

## Regras

Suportar pelo menos `before`, `after` e grupos como abstrações.

## Sorting

Um sorter pode ser implementado por adapter/extensão. O core não deve assumir LOOT ou qualquer algoritmo específico.

Se houver ciclo, não produzir ordem parcial silenciosa.

## Persistência

Load order deve possuir estado desejado e estado aplicado quando o jogo exige escrita em arquivo.
