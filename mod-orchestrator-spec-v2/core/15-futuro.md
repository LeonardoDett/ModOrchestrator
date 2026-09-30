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

## Ferramentas externas / hotbar (V1.x)

Vortex: `starter_dashlet`, `titlebar-launcher`, `tool_variables_base`.
- Registro: nome, executável, argumentos (com variáveis: pasta do jogo, Data, staging, profile), pasta de trabalho, ambiente, ícone, "exclusivo" (bloqueia outras ações enquanto roda), "deploy antes de rodar".
- Após a ferramenta fechar: scan de external changes nas saídas conhecidas (core/09), oferecendo captura.
- Preparado: `ProcessLauncher`, barra de título com área do lançador, `toolOutputs()` do adapter, D045.

## Saves (V1.x)

Vortex: `gamebryo-savegame-management`.
- Lista de saves por profile (namespace), cabeçalho (personagem, nível, local, data, screenshot), plugins faltando, transferir/copiar entre profiles, excluir, restaurar.
- Preparado: capability `save_games`; profile `features.localSaves`.

## Configurações do jogo por profile (V1.x)

Vortex: `local-gamesettings`, `ini_prep`.
- Preparado: capability `game_settings`; profile `features.localSettings`; aplicação no `post` do deploy (core/07 §7).

## Importar de outros gerenciadores (V1.x)

Vortex: `mo-import`, `nmm-import-tool`.
- MO2: ler instância (mods/, profiles/<p>/modlist.txt, plugins.txt, loadorder.txt), importar mods como pastas (D048), ModOrder e separadores, profiles, plugins.
- Vortex: ler staging + `vortex.deployment.json` + estado (se acessível) para mods, habilitados e regras.
- Preparado: import de pasta, separadores, OrderRules.

## Mergers de arquivos (V1.x/V2)

Vortex: `modMerging` (registerMerge). Alguns tipos de arquivo podem ser combinados em vez de disputados. Preparado: o desejado de uma Location é produzido por uma função (hoje "vencedor"); futuro "merge" produz arquivo gerado na staging de um mod sintético.

## Extensões de terceiros (V2)

Contrato em core/11 §7. Preparado: adapters já registrados por contrato no bootstrap (D031).

## Portabilidade / backup completo (V2)

Exportar configuração (instâncias, profiles, regras, lista de mods com hashes) e, opcionalmente, archives. Restaurar em outro PC realocando caminhos. Preparado: nenhum caminho absoluto como identidade (INV-ID-01).

## Linux / Proton (pós-V1)

Preparado: normalização de caminho no domínio; FileSystem como port; D039.
