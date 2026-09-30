# Anti-patterns proibidos

1. Regra de negócio dentro de componente React.
2. Core importando pacote de UI.
3. `if game == "skyrim"` ou equivalente dentro do core.
4. Tratar `InstallOrder` como `LoadOrder`.
5. Resolver conflito silenciosamente.
6. Apagar arquivo sem evidência de que o gerenciador o possui.
7. Sobrescrever arquivo externo sem triagem explícita.
8. Deploy incremental sem reconciliação do estado anterior.
9. Usar caminho absoluto como identidade de mod.
10. Presumir que um archive contém um mod diretamente na raiz.
11. Ignorar FOMOD/installer metadata porque a V1 não implementa a UI completa.
12. Fazer o usuário editar arquivos de configuração manualmente para operações normais.
13. Persistir resultado calculado como fonte de verdade quando ele pode ser derivado.
14. Criar regra automática somente porque dois mods conflitam.
15. Permitir ciclo de regras sem diagnóstico explícito.
16. Misturar estado do jogo com estado do perfil.
17. Criar componentes visuais novos quando dettmann-ui já possui equivalente.
18. Adicionar funcionalidade futura somente como botão quebrado; áreas futuras devem ser reservadas sem fingir disponibilidade.
19. Fazer prompt para Cursor sem declarar os documentos obrigatórios.
20. Alterar contrato sem registrar impacto e decisão.
21. Publicar evento ou atualizar a UI antes de persistir o estado correspondente.
22. Reconstruir estado de domínio na UI a partir de eventos em vez de reler a fonte de verdade no backend.
23. Importar Wails, SQL ou filesystem em `core/domain` ou `core/application`.
