# Dependências e validação

Referências: D014, D027; INV-OPS-06. Vortex: `mod-dependency-manager`, `health_check` (`modRequirementsCheck`, `fileRequirementsCheck`), `script-extender-error-check`, `test-setup`, `test-gameversion`. MO2: aviso de masters faltando, "Problems".

## 1. Tipos de requisito

| Requisito | Origem | Avaliado por |
|---|---|---|
| Mod requer mod | DependencyRule `requires` (usuário, FOMOD aceito, futuro provider) | core |
| Mod recomenda mod | DependencyRule `recommends` | core |
| Mod incompatível com mod | IncompatibilityRule | core |
| Plugin requer master | cabeçalho do plugin | adapter + core/08 |
| Mod requer arquivo/framework | declarado pelo adapter por ContentFlags (ex.: mod com `SKSE/Plugins/*.dll` requer SKSE instalado) | adapter |
| Mod requer versão do jogo | adapter (ex.: plugin SKSE compilado para outra versão, V1.x) | adapter |

## 2. Estados de um requisito

`satisfied`, `missing` (alvo não existe na biblioteca), `disabled` (existe, desabilitado no profile), `wrong_version` (existe, versão fora da faixa, só com ModReference de faixa), `conflicting` (incompatível habilitado), `unknown` (não foi possível avaliar; ex.: regra órfã).

## 3. Momento de validação

Validação é um conjunto de HealthChecks (core/10), recalculados:
- após import/install/remove;
- após qualquer mudança no profile ativo (habilitar, ordem, plugins);
- após deploy e scan;
- sempre no `preflight` de deploy e de launch.

Validar é barato e puro (sobre dados carregados); não há "botão validar" obrigatório, mas existe "Verificar agora" (paridade com Health Check do Vortex).

## 4. Severidade e bloqueio

| Situação | Severidade | Bloqueia |
|---|---|---|
| `requires` com alvo `missing`/`disabled` | error | não bloqueia deploy; bloqueia launch só se o adapter marcar como crítico (ex.: framework obrigatório) |
| `recommends` não atendido | info | não |
| Incompatíveis habilitados juntos | error | deploy **bloqueado** até desabilitar um deles ou desativar a regra |
| Master de plugin faltando | error | launch avisa com "lançar mesmo assim" (o jogo quebra ao carregar, então o aviso é forte) |
| Framework do adapter faltando (SKSE) | error | launch avisa |
| Regra órfã | warning | não |

Princípio: não bloquear operações que não dependem do requisito. Importar e habilitar sempre são permitidos.

## 5. Ações sugeridas (exemplos)

- `missing`: "Importar arquivo…" (abre import), "Remover regra", "Ignorar este requisito" (supressão).
- `disabled`: "Habilitar <mod>" (um clique), "Remover regra".
- Incompatível: "Desabilitar <A>", "Desabilitar <B>", "Desativar regra".
- Master faltando: "Mostrar quem fornece" (se existir desabilitado: "Habilitar <mod>"/"Ativar plugin"), "Desativar <plugin>".

## 6. Dependências no fluxo de habilitar

Ao habilitar um mod que requer mods desabilitados, a UI oferece no próprio toast/inline: "Também habilitar: X, Y" (uma ação). Nunca habilita dependências sem pedir. Ao desabilitar um mod do qual outros habilitados dependem, a UI avisa quais serão afetados, sem bloquear.

## 7. Critérios de aceite

- Mod com `requires` para mod desabilitado gera diagnóstico com ação "Habilitar"; clicar resolve e o diagnóstico some sem recarregar a tela.
- Incompatíveis habilitados bloqueiam deploy com mensagem que cita os dois.
- Plugin com master ausente gera erro no plugin, na linha do mod de origem (indicador) e no diagnóstico geral.
- Nenhum requisito impede importar ou habilitar.
