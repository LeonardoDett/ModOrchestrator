# Protocolo universal para Cursor

Use este bloco no início de qualquer sessão do projeto:

```text
Você está trabalhando no Mod Orchestrator.

ANTES DE ESCREVER CÓDIGO:
1. Leia README.md.
2. Leia docs-ia/00-manifesto.md.
3. Leia docs-ia/decisoes.md.
4. Leia docs-ia/anti-patterns.md.
5. Leia o documento da fase atual em plano-de-desenvolvimento.md.
6. Leia todos os documentos de core/ui citados pelo prompt da fase.
7. Leia as referências Vortex relevantes se a tarefa envolver comportamento de UX ou fluxo.
8. Verifique as skills em .cursor/skills ou skills/ deste pacote.

REGRAS:
- Não invente comportamento que contradiga os documentos.
- Não coloque regra de negócio na UI.
- Não trate conflito, diagnóstico ou log como a mesma coisa.
- Não confunda install order com load order.
- Não sobrescreva arquivo externo sem triagem.
- Não altere contrato existente sem primeiro registrar impacto e decisão.
- Use dettmann-ui para toda UI.

DURANTE:
- Liste mentalmente as fontes de verdade envolvidas.
- Prefira mudanças pequenas e testáveis.
- Ao encontrar ambiguidade real, pare antes de criar uma regra implícita.

AO FINAL:
1. Rode testes/lint/build aplicáveis.
2. Verifique anti-patterns.
3. Registre decisões novas em docs-ia/decisoes.md.
4. Se um contrato mudou, atualize todos os documentos afetados.
5. Relate arquivos alterados, testes executados e riscos restantes.
```
