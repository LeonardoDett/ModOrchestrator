# Deploy e Purge

## Modelo

Deploy reconcilia o estado desejado do Profile com a pasta do jogo.

`inspect -> validate -> plan -> protect unmanaged -> purge/reconcile -> apply -> verify -> persist manifest`

Purge remove somente artefatos que pertencem ao DeploymentManifest. Vortex define purge como operação não destrutiva e reversível via novo deploy. citehttps://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-FAQ

## Métodos

Preferência inicial: hardlink quando possível. Métodos alternativos dependem das capabilities do SO e do jogo. Cópia é fallback explícito.

O método não deve ser decidido apenas globalmente: pode existir restrição por arquivo/mod type.

## Proteção

Antes de substituir destino, verificar se ele pertence ao manifesto anterior. Arquivo não gerenciado é protegido e gera diagnóstico.

## Idempotência

A mesma intenção aplicada duas vezes deve produzir o mesmo estado final.

## Plano de deploy

Antes de tocar no filesystem, gerar plano contendo:

- create;
- replace;
- remove;
- preserve;
- conflict;
- external-change;
- unsupported.

Se o plano contiver operações destrutivas ou ambíguas, pedir decisão.

## Verificação

Após aplicação, verificar existência, tipo de link/cópia e integridade suficiente para afirmar que o estado foi aplicado.
