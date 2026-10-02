# Instaladores e FOMOD

Referências: D009, D030, INV-LIB-04. Vortex: `installer_fomod_native`, `installer_fomod_shared`, `installer_nested_fomod`, `installer_dotnet` (C#; rejeitado), `basicInstaller`, instaladores de extensões (`script-extender-installer`, `modtype-*`). Especificação FOMOD: esquema `ModuleConfig.xsd` 5.x.

## 1. Pilha de instaladores

Instaladores são registrados com **prioridade** (menor número = consultado primeiro). Para cada archive, a aplicação pergunta a cada um `supports(listaDeEntradas, contextoDoJogo)` e usa o primeiro que responde sim, registrando o motivo. O usuário pode forçar outro instalador pelo diálogo "Preparar instalação" (Avançado).

| Prioridade | Instalador | Origem | Suporta quando |
|---|---|---|---|
| 10 | `fomod` | core | existe `fomod/ModuleConfig.xml` (em qualquer nível até profundidade 3; ver aninhado) |
| 20 | instaladores do adapter | adapter | regra própria (ex.: Skyrim `skse-runtime`: `skse64_loader.exe` presente) |
| 90 | `basic` | core | sempre (fallback) |

`fomod` com apenas `info.xml` (sem ModuleConfig) não é FOMOD de instalação: cai no `basic`, mas os metadados de `info.xml` são aproveitados.

FOMOD aninhado (archive com um único subarchive): fora da V1; gera `installer_unsupported` com o motivo "archive dentro de archive".

## 2. Contrato do instalador

Entrada:
- lista de entradas do archive (e acesso ao conteúdo extraído na pasta temporária);
- contexto do jogo: GameDefinition, ModTypes, targets, lista de plugins atualmente ativos no profile ativo e arquivos existentes nos targets (para condições FOMOD);
- escolhas anteriores (`Installation.options`) quando é reinstall;
- versão do jogo e do gerenciador (condições FOMOD de versão).

Saída (**plano de instalação**, puro dado):
- `files[]`: origem (entrada do archive) → destino (Location relativa ao mod) com prioridade de instrução (FOMOD `priority`);
- `modType` sugerido;
- `metadata` detectada (nome, versão, autor, descrição, imagem);
- `options` a gravar;
- `warnings[]` (ex.: "o FOMOD referencia arquivo inexistente X, ignorado");
- `requirements[]` detectados (viram DependencyRules com `source=metadata`, somente se o usuário confirmar no resumo);
- ou `needsDecision` (com o modelo de UI a mostrar), ou erro.

O instalador **nunca** escreve na staging nem no jogo: quem materializa o plano é a operação de import (core/02, step `stage`). Isso permite pré-visualizar e testar instaladores sem filesystem.

Colisão de destino dentro do plano (D085): as instruções são aplicadas em fases — `requiredInstallFiles`, opções dos passos visíveis, `conditionalFileInstalls` — e a fase posterior vence; dentro da fase, o de maior `priority` vence; empate → o último declarado vence. O plano final nunca tem dois arquivos na mesma Location (INV-LIB-02).

## 3. FOMOD: modelo

Conceitos distintos (não misturar em uma estrutura só):

| Conceito | Elemento XML | Nota |
|---|---|---|
| Informação do mod | `info.xml` | nome, autor, versão, site, descrição, grupos |
| Nome/imagem do módulo | `moduleName`, `moduleImage` | cabeçalho do assistente |
| Dependências do módulo | `moduleDependencies` | se falsas, a instalação é recusada com a mensagem |
| Arquivos obrigatórios | `requiredInstallFiles` | sempre instalados |
| Passos | `installSteps` (`order`: Explicit/Ascending/Descending) | cada passo tem `visible` (condição) |
| Grupos | `optionalFileGroups` › `group` (`order`, `type`) | tipos: `SelectExactlyOne`, `SelectAtMostOne`, `SelectAtLeastOne`, `SelectAll`, `SelectAny` |
| Opções (plugins FOMOD) | `plugin` | nome, descrição, imagem, `files`, `conditionFlags`, `typeDescriptor` |
| Tipo da opção | `typeDescriptor` (`type` ou `dependencyType` com `patterns`) | `Required`, `Optional`, `Recommended`, `NotUsable`, `CouldBeUsable` |
| Flags | `conditionFlags` › `flag` | valor texto definido pela opção escolhida |
| Condições | `dependencies` (`operator` And/Or) com `flagDependency`, `fileDependency` (`Active`/`Inactive`/`Missing`), `gameDependency`, `fommDependency`, aninhadas | avaliadas pelo core |
| Instalação condicional | `conditionalFileInstalls` › `patterns` | avaliadas após o último passo |
| Arquivo/pasta | `file`/`folder` com `source`, `destination`, `priority`, `alwaysInstall`, `installIfUsable` | |

"Plugin FOMOD" ≠ `Plugin` do jogo (core/08). Na UI chama-se **opção**.

## 4. FOMOD: avaliação (domínio puro)

- `fileDependency`: `Active` = plugin existe e está ativo no profile ativo; `Inactive` = existe e inativo; `Missing` = não existe nos targets (considerando estado desejado do profile ativo, não só o observado).
- `gameDependency` / `fommDependency`: comparação de versão com as versões do contexto; formato desconhecido → condição considerada verdadeira e warning.
- Flags: um mapa `flag → valor`, recalculado do zero a cada mudança de seleção, na ordem dos passos visíveis.
- Visibilidade de passo: reavaliada a cada mudança; passos que ficam invisíveis não contribuem com arquivos nem flags.
- `typeDescriptor` dinâmico: reavaliado a cada mudança; `Required` fica marcado e travado; `NotUsable` fica desabilitado com motivo; `Recommended` vem pré-selecionado na primeira visita.
- Validação de grupo antes de avançar: `SelectExactlyOne` exatamente 1, `SelectAtLeastOne` ≥ 1, `SelectAtMostOne` ≤ 1, `SelectAll` todos marcados e travados.
- Caminhos de `source`/`destination`: normalizados (INV-ID-02); `destination` vazio = raiz do mod; separadores `\` aceitos; maiúsculas ignoradas na busca no archive. Arquivo de origem inexistente → warning, não erro (FOMODs reais têm esse defeito).
- Determinismo: mesma seleção + mesmo contexto ⇒ mesmo plano. Testável com fixtures de FOMODs reais.
- Encodings: XML em UTF-8/UTF-16 com BOM e declarações de encoding comuns (Windows-1252) devem ser aceitos.

## 5. FOMOD: fluxo de UI (resumo; detalhes em `ui/telas/dialogos.md`)

Assistente modal (paridade Vortex): cabeçalho com nome/imagem do módulo, lista de passos à esquerda (visíveis), grupos do passo atual com radio/checkbox conforme tipo, painel de descrição e imagem da opção em foco, botões Voltar / Próximo / Instalar / Cancelar. Reinstalar abre com as escolhas anteriores pré-selecionadas e um botão "Usar escolhas anteriores e instalar".

A operação de import fica em `await_decision` enquanto o assistente está aberto; a avaliação a cada clique é uma consulta de domínio (a UI não avalia condições, anti-pattern 1).

Ao concluir: resumo com arquivos a instalar (contagem por destino), warnings e requisitos detectados; confirmar executa `stage`.

## 6. Instaladores do adapter

Adapter pode registrar instaladores com a mesma interface, por exemplo:
- Skyrim `skse-runtime`: detecta `skse64_loader.exe`; instala os binários na raiz (mod type `root`) e `Data/*` no target `data`.
- Tipos de mod por conteúdo (`modtype-*` do Vortex): ENB (`d3d11.dll` + `enbseries.ini` → `root`).

Instaladores de adapter também produzem só planos (anti-pattern 24).

## 7. Segurança

- Nenhum script é executado (C# `script.cs`, `.bat`, `.exe`): FOMOD com script (sem `ModuleConfig.xml`) para na decisão `fomod_script`, que explica que o instalador com script C# não é suportado e oferece "instalar manualmente escolhendo a pasta" (árvore do DLG-05, instalador `basic` com escolha de root; D086 item 7).
- Imagens do FOMOD são lidas da pasta temporária e servidas à UI como dados (data URL), só as referenciadas pelo módulo ou por uma opção, nunca como caminho de arquivo arbitrário (D086 item 12).
- XML: sem entidades externas (XXE desabilitado), limite de tamanho (padrão 8 MB).

## 8. Erros

`installer_unsupported`, `installer_failed`, `fomod_invalid_xml`, `fomod_module_dependencies_failed`, `fomod_invalid_selection` (não deveria acontecer se a UI respeita a consulta; defesa em profundidade), `fomod_image_unavailable`, `no_installable_files`.

Avisos do plano (não bloqueiam; mostrados no resumo do assistente): `fomod_unknown_version`, `fomod_missing_source`, `fomod_invalid_destination`, `fomod_choice_dropped`.

## 9. Critérios de aceite

- Suite de fixtures com pelo menos 10 FOMODs reais de Skyrim cobrindo todos os tipos de grupo, flags, `conditionalFileInstalls`, `fileDependency` e passos invisíveis: o plano gerado é idêntico ao esperado (`internal/integration/testdata/fomod`, D086 item 13).
- Reinstalar um mod FOMOD sem mudar nada reproduz o mesmo plano.
- FOMOD com script C# é recusado com mensagem clara e alternativa.
- Nenhum instalador escreve em disco (verificável por port de filesystem falso nos testes).

## 10. Fora de escopo V1

Scripts C#, FOMOD aninhado, instaladores de extensões de terceiros (V2), "presets" de FOMOD vindos de coleções (V2, mas `options` já está no formato que coleções usarão).
