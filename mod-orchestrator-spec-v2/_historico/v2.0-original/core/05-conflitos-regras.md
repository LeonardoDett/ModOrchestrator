# Conflitos e Regras

## Conflito

Um conflito existe quando múltiplas fontes fornecem o mesmo caminho de destino.

## Visualização

A UI deve permitir navegar em três níveis:

1. resumo por mod;
2. disputa entre mods;
3. arquivos individuais.

## Resolução padrão

Install order determina o vencedor quando não existe regra específica.

## Regras

Suportar:

- A antes de B;
- A depois de B;
- A vence B para todos os arquivos comuns;
- A vence B somente para caminho X;
- exceção de arquivo sobre regra de par.

O modelo precisa registrar a precedência entre regras.

## Ciclos

A -> B -> C -> A é erro de configuração. O solver deve devolver o ciclo e os participantes, nunca escolher arbitrariamente.

## UX

Conflito não deve significar necessariamente problema: conflito resolvido por regra deve ser distinguido de conflito sem decisão.

Vortex permite regras por arquivo e informa conflitos não resolvidos; esse comportamento é referência obrigatória para a experiência. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Managing-File-Conflicts
