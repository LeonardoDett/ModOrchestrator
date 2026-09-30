# Mapa de impacto

Use antes de alterar uma regra, contrato ou entidade. Encontre a linha, leia todos os documentos citados e verifique os invariantes listados. Se a mudança não se encaixa em nenhuma linha, investigue antes de implementar e acrescente a linha.

| Se mudar... | Documentos afetados | Invariantes | Telas afetadas |
|---|---|---|---|
| Normalização de caminho / Location | core/01, core/02, core/04, core/05, core/09 | INV-ID-01..04 | Mods (arquivos), Conflicts |
| GameInstance / targets / staging | core/11, core/04, core/13, core/14 | INV-LIB-03, INV-DEP-08 | Games, Settings › Mods |
| Contrato do adapter / capabilities | core/11, core/12, ui/00 (navegação), ui/01 | — | todas do workspace |
| ModType | core/11, core/12, core/03, core/04 | INV-CON-01 | Mods (coluna/inspector) |
| Modelo de Mod / atributos | core/01, core/02, ui/telas/mods | INV-LIB-01, INV-LIB-05 | Mods |
| Installation / installers | core/02, core/03, core/15 (downloads) | INV-LIB-02, INV-LIB-04 | Mods, diálogo FOMOD |
| Archive store / retenção | core/02, core/13, core/14 | — | Settings › Mods, Mods |
| ModOrder / motor de ordenação | core/05, core/07, core/08 (motor compartilhado), core/04 | INV-ORD-* | Mods, Conflicts, Profiles |
| OrderRule / Dependency / Incompatibility | core/05, core/06, core/10 | INV-ORD-03/04, INV-CON-02 | Mods, Conflicts, Diagnostics |
| FileOverride / FileExclusion | core/05, core/04 | INV-CON-01/03 | Conflicts, Mods (arquivos) |
| Profile (conteúdo, clone, troca) | core/07, core/04, core/08, ui/telas/profiles | INV-ORD-01/02 | Profiles, topbar |
| Deploy (plano, métodos, journal, manifesto) | core/04, core/09, core/10, core/14 | INV-DEP-* | topbar, Mods, diálogos de deploy |
| External changes / arquivos gerados | core/09, core/04, core/10 | INV-EXT-* | diálogo External Changes, Diagnostics |
| Plugins / LoadOrder / sorter | core/08, core/12, core/09 (load_order change) | INV-PLG-*, INV-ORD-05/06 | Plugins, Load Order |
| HealthCheck / Diagnostic | core/10 e o core do módulo que emite | INV-OPS-06 | Diagnostics, Dashboard, Overview, badges |
| Operation / Event | core/00, core/10, bridge | INV-OPS-01/03 | operation center, histórico |
| Lock de instância / concorrência | core/00, todas as operações | INV-OPS-02 | todas as ações mutantes |
| Settings (novo setting ou default) | core/13 e o core do módulo dono | — | Settings |
| Persistência / schema | core/14, migrations | — | — |
| Integração dettmann-ui / tema | ui/03, ui/04, todos ui/telas | — | todas |
| Distribuição de tela (vs Vortex) | ui/00 (divergências), ui/telas/*, references/vortex | — | a tela |
| Texto de UI / idioma | catálogo i18n | INV-OPS-05 | todas |
| Escopo de release | 00-visao-e-escopo, plano, core/15 | — | — |

## Perguntas obrigatórias antes da mudança

1. Qual estado muda e quem é o dono? (`03-fontes-de-verdade.md`)
2. Algum invariante deixa de valer? Se sim, é decisão nova, não ajuste.
3. Algum dado derivado vai passar a ser persistido?
4. Operações longas existentes mudam de steps, erros ou eventos?
5. A UI de alguma tela precisa de dado novo do bridge?
6. Algum diagnóstico passa a existir ou deixa de existir?
7. Algum setting novo é necessário, e qual o escopo (app/instância/profile)?
