# Contratos para o futuro

Referências: D013, D015, D047. Regra: nada daqui é implementado antes da release indicada, mas os contratos da V1 **não podem impedir** estes recursos. Cada item lista o que a V1 já precisa deixar preparado.

## Downloads e providers (V2)

Vortex: `download_management`, `nexus_integration`, `browse_nexus`, NXM links, `IPCDownloadAdapter`.

- Provider abstrato: autenticação, busca de metadados, download (fila, retomada, limite de banda, threads), verificação de atualização, links de protocolo (`nxm://`).
- Download produz um **Archive** e entra no mesmo pipeline de import (core/02). Não existe caminho de instalação paralelo.
- Preparado na V1: `Source{kind, ref}` aberto; `ModReference` com campos de provider (core/01); Archive com hash; setting `automation.installOnDownload` reservado; slot de navegação "Downloads" reservado; coluna "Atualização" reservada na tabela de Mods.

## Verificação de atualizações e metadados online (V2)

- Estado de atualização por mod (atual, atualização disponível, versão removida), changelog, endorsement.
- Preparado: versão como texto + comparação tolerante (semver quando possível); ações de mod extensíveis.

## Coleções (V2)

Vortex: `collections`.
- Manifesto declarativo: mods (ModReference com faixa de versão), escolhas de instalador (formato de `Installation.options`), ModOrder/regras, load order, plugins ativos, instruções.
- Instalar coleção = fila de downloads + imports com opções pré-definidas + regras com `source=collection`.
- Preparado: `OrderRule.source`, `options` serializável, ModReference fuzzy.

## Ferramentas externas / hotbar

Saiu do futuro: entrou antes da v1 (D140, LV4, D146; core/11 §6). Backend feito: capability `tools` (`ports.ToolSupport`), registro por instância (executável, argumentos com variáveis `{game}`, `{staging}`, `{archives}`, `{profile}`, `{profile_id}`, `{target:<id>}`, pasta de trabalho, ambiente, ícone, exclusivo, implantar antes), ferramentas conhecidas do adapter como sugestão, lançamento pelo serviço de lançamento e scan ao fechar com oferta de captura (core/09). A tela Ferramentas e o menu da barra de título esperam a prancha aprovada (D127). Fica para depois: "fechar/ocultar o app ao iniciar" (MO2), saídas próprias por ferramenta, `.bat`/`.cmd` e lançamento elevado (LV6).

## Saves

Saiu do futuro: entrou antes da v1 (D140, LV3, D142; core/07 §7, tela `ui/telas/saves.md`). Fica para depois: restaurar save apagado (a exclusão é definitiva e confirmada) e ler saves de outros jogos além do Skyrim SE.

## Configurações do jogo por profile (V1.x)

Vortex: `local-gamesettings`, `ini_prep`.
- Preparado: capability `game_settings`; profile `features.localSettings`; aplicação no `post` do deploy (core/07 §7).

## Importar de outros gerenciadores

Saiu do futuro: entrou no plano do redesign (RD15, D128; telas na RD16), com MO2 e Vortex. Fica para depois: mover em vez de copiar, NMM, r2modman e perfis da Thunderstore.

## Mergers de arquivos (V1.x/V2)

Vortex: `modMerging` (registerMerge). Alguns tipos de arquivo podem ser combinados em vez de disputados. Preparado: o desejado de uma Location é produzido por uma função (hoje "vencedor"); futuro "merge" produz arquivo gerado na staging de um mod sintético.

## Extensões de terceiros (V2)

Contrato em core/11 §7. Preparado: adapters já registrados por contrato no bootstrap (D031).

## Portabilidade / backup completo (V2)

Exportar configuração (instâncias, profiles, regras, lista de mods com hashes) e, opcionalmente, archives. Restaurar em outro PC realocando caminhos. Preparado: nenhum caminho absoluto como identidade (INV-ID-01).

## Linux / Proton (pós-V1)

Preparado: normalização de caminho no domínio; FileSystem como port; D039.
