# Anti-patterns proibidos

Numeração estável: novos itens entram no fim. Cada item diz **por que** é proibido e **o que fazer em vez disso**.

## Arquitetura

1. **Regra de negócio dentro de componente React.** A UI mostra e pede; o backend decide. Em vez disso, exponha um caso de uso/consulta no bridge.
2. **Core importando pacote de UI.** Quebra a regra de camadas (D017) e o teste de arquitetura.
3. **`if game == "skyrim"` ou equivalente dentro do core.** Use capability ou contrato do adapter (D011).
23. **Importar Wails, SQL ou filesystem em `core/domain` ou `core/application`.** Use ports.
24. **Adapter fazendo I/O de deploy por conta própria.** Adapter declara (targets, mod types, restrições, serialização); o motor de deploy executa. Senão o journal e o manifesto ficam cegos.

## Estado

13. **Persistir resultado calculado como fonte de verdade quando ele pode ser derivado** (conflitos, estado desejado, diagnósticos, status de deploy). Ver `03-fontes-de-verdade.md`.
16. **Misturar estado do jogo com estado do perfil.** Ver D026.
21. **Publicar evento ou atualizar a UI antes de persistir o estado correspondente.** (D020)
22. **Reconstruir estado de domínio na UI a partir de eventos em vez de reler o backend.** (D021)
25. **Guardar regra/override/exclusão no profile.** Conteúdo pertence à instância (D026); clonar profile não pode duplicar regras.
26. **Estado de mod "enabled" na biblioteca.** Habilitado é do profile (`ModEntry`), não do Mod.

## Ordem e conflitos

4. **Tratar ModOrder ("install order") como LoadOrder.** (D006)
5. **Resolver conflito silenciosamente**, isto é, mudar vencedor sem ação do usuário e sem registro. O vencedor padrão pela ordem é determinístico e explicado; isso não é "silencioso".
14. **Criar regra automática somente porque dois mods conflitam.** (D004)
15. **Permitir ciclo de regras sem diagnóstico explícito**, ou quebrá-lo escolhendo uma aresta arbitrária. (D028)
27. **Reordenar a ModOrder inteira para satisfazer uma regra.** O motor move o mínimo necessário e explica cada movimento (D025/D029).
28. **Tratar conflito como erro.** Conflito é normal em modding; só é problema quando não foi revisado e o usuário quer saber, ou quando um override ficou obsoleto (D027).

## Filesystem

6. **Apagar arquivo sem evidência de que o gerenciador o possui.** (INV-DEP-01)
7. **Sobrescrever arquivo externo sem triagem explícita.** (D008)
8. **Deploy incremental sem reconciliação do estado anterior.** Diff sempre considera desejado × aplicado × observado (D033).
9. **Usar caminho absoluto como identidade de mod.** (INV-ID-01)
10. **Presumir que um archive contém um mod diretamente na raiz.** (core/02)
29. **Fazer purge completo + deploy completo como caminho normal** (ex.: na troca de profile). Deploy é por diff.
30. **Tocar no filesystem antes de gravar o journal.** (INV-DEP-03)
31. **Escrever na staging ou no jogo durante uma importação que ainda não foi confirmada.** Extração vai para pasta temporária da operação.
32. **Resolver caminho com `filepath.Join` sobre entrada não normalizada.** Todo caminho vindo de archive, FOMOD ou usuário passa pela normalização de domínio antes (INV-ID-02/04).

## Instaladores

11. **Ignorar FOMOD/installer metadata.** FOMOD é V1 (D030).
33. **Executar script de instalador** (C#, exe, bat) em qualquer fluxo automático. (INV-LIB-04)

## UX e UI

12. **Fazer o usuário editar arquivos de configuração manualmente para operações normais.**
17. **Criar componentes visuais novos quando dettmann-ui já possui equivalente**, ou criar componente genérico dentro do app em vez de na lib (D016).
18. **Adicionar funcionalidade futura como botão quebrado.** Áreas futuras são reservadas no layout sem aparecer como ação disponível.
34. **Reinventar a distribuição de uma tela que o Vortex já resolveu sem divergência aprovada.** (D042)
35. **Comunicar status só por cor.** Sempre ícone + rótulo/tooltip (D043).
36. **Texto de interface fixo no código.** Todo texto vem do catálogo i18n (D044).
37. **Toast como único aviso de problema persistente.** Problema que continua existindo é diagnóstico.
38. **Modal de confirmação para ação reversível e barata.** Confirmação é para ações destrutivas ou irreversíveis; o resto usa desfazer/histórico.
39. **Enfileirar operação mutante implicitamente.** Operação concorrente na mesma instância é recusada com `instance_busy` (D038).

## Processo

19. **Fazer prompt de fase sem declarar os documentos obrigatórios.**
20. **Alterar contrato sem registrar impacto e decisão.**
40. **Usar implementação existente como justificativa para violar documento.** (manifesto)
41. **Usar termo proibido do glossário** em código, UI ou documento novo.
