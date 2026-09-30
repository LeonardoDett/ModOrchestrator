# Biblioteca e Importação

## Objetivo

Receber archives locais, normalizar seu conteúdo e criar uma instalação isolada por mod.

## Pipeline

`selecionar archive -> validar arquivo -> identificar jogo -> inspecionar estrutura -> detectar installer -> extrair temporariamente -> resolver root -> calcular footprint -> persistir metadata -> instalar na staging -> recalcular footprint -> diagnosticar`

## Importação

V1 aceita ZIP, 7Z e RAR quando houver suporte seguro no ambiente.

A importação não deve executar binários arbitrários.

## Estrutura de archive

O sistema deve detectar:

- arquivos diretamente na raiz;
- uma pasta wrapper contendo o mod;
- múltiplas pastas candidatas;
- FOMOD/installer metadata;
- estruturas incompatíveis;
- archive vazio/corrompido;
- caminhos perigosos (`..`, absolute path, links suspeitos).

Quando não puder decidir a root com segurança, o usuário escolhe em um fluxo de preparação.

## Biblioteca física

Cada mod possui diretório próprio e nunca é armazenado diretamente na pasta real do jogo.

## Estado

`Imported -> Installing -> Installed -> Enabled/Disabled -> Removed`.

Falha deve deixar o estado recuperável, nunca parcialmente considerado instalado.

## Categorias e tags

Categorias são metadata e não afetam deployment. Devem permitir filtro, agrupamento e ações futuras.

## Origem

V1: `manual-file`. Futuro: Nexus, Steam Workshop, Thunderstore, URL etc.
