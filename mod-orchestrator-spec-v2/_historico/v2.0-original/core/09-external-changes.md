# Alterações externas

## Problema

O filesystem pode divergir do que o gerenciador acredita que implantou.

Exemplos: ferramenta externa editou arquivo, usuário apagou link, jogo gerou arquivo, antivírus removeu artefato, Steam reparou arquivos.

## Detecção

Comparar DeploymentManifest com filesystem atual.

Classificar:

- missing;
- modified;
- replaced;
- moved;
- unexpected;
- permission-change.

## Triagem

Oferecer ações como:

- restaurar estado gerenciado;
- aceitar alteração e atualizar origem/manifesto quando seguro;
- ignorar temporariamente;
- abrir localização.

Vortex apresenta diálogo de External Changes e permite reverter ou manter mudanças externas. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-General-Managing-External-Changes

Nenhuma decisão destrutiva deve ser tomada silenciosamente.
