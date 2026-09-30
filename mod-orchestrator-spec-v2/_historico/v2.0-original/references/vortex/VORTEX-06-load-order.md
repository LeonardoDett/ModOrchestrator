# VORTEX-06 — Load order

## Filosofia

Vortex delega sorting para um mecanismo automático quando o jogo suporta isso e usa regras customizadas para exceções. Não exige drag-and-drop manual como mecanismo primário.

## Regras

Pode haver regras entre plugins e grupos. Regras contraditórias podem gerar ciclos, que devem ser diagnosticados.

## Aplicação

**ADOPT:** sorter é capability.

**ADAPT:** core define contrato; adapter escolhe mecanismo.

Fontes:
- https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-The-Vortex-Approach-to-Load-Order
- https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Managing-your-Load-Order
