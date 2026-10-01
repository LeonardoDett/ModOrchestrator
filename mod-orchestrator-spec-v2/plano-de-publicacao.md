# Plano de publicação

Como o Mod Orchestrator chega ao usuário: licença, contribuição, build, assinatura, canais e atualização. Complementa a F15 do `plano-de-desenvolvimento.md`. Decisões: D076 (licença e contribuição) e D077 (distribuição e confiança).

**Status: rascunho.** Será testado e refinado depois da F15, antes da primeira release pública. Itens marcados **(verificar)** dependem de fato externo ainda não confirmado.

## Princípios

1. Custo zero: só serviços gratuitos para open source.
2. O usuário não pode achar que está instalando um vírus: assinatura, sem elevação, binário limpo, hashes publicados.
3. Qualquer pessoa compila e testa um PR só com o repositório.
4. Código de PR nunca chega perto do que assina.
5. Release reproduzível pelo CI; nada é publicado a partir da máquina de alguém.

## Etapa 0 — Base do repositório (feito em 2026-10-01)

- [x] `LICENSE` GPL-3.0 na raiz; `license: GPL-3.0-or-later` em `frontend/` e `dettmann-ui-vnext/` (D076).
- [x] CI com core **e** frontend (build da `dettmann-ui` + typecheck + testes), `permissions: contents: read`, só `pull_request`.
- [x] `CONTRIBUTING.md` (licença das contribuições, build, validação, regras da spec).
- [x] Decisões D076 e D077.

## Etapa 1 — Preparação contínua (pode andar em paralelo às fases)

Tarefas que não dependem do app estar pronto:

- [ ] **Conta GitHub**: autenticação em dois fatores (exigida pela SignPath **(verificar)**).
- [ ] **Proteção da `master`**: PR obrigatório, CI verde obrigatório, sem force push.
- [ ] **Actions fixadas por SHA** (não por tag) nos workflows; Dependabot para `github-actions`, `gomod` e `npm`.
- [ ] **`SECURITY.md`**: reporte privado de vulnerabilidade pelo GitHub (Private vulnerability reporting), sem e-mail pessoal.
- [ ] **Templates** de issue (bug com versão, jogo, passos e log de `%APPDATA%\ModOrchestrator\logs`; pedido de feature) e de PR (checklist de validação do `CONTRIBUTING.md`).
- [ ] **`THIRD_PARTY_NOTICES`** gerado por script (Go: `go-licenses`; npm: lista das dependências de produção) e checado no CI: dependência com licença incompatível com GPL-3.0 falha o build.
- [ ] **Metadados do executável**: `build/windows/info.json` com nome, descrição, versão, copyright e licença; versão injetada por `-ldflags` a partir da tag.
- [ ] **README público**: o que é, estado (alpha/beta), capturas, instalação, aviso do SmartScreen explicado com imagem, link para a política de assinatura.
- [ ] **Política de assinatura** (exigida pela SignPath **(verificar)**): página no repositório dizendo o que é assinado, por qual pipeline, quem aprova, e os papéis (autor, revisores, aprovador).

## Etapa 2 — Empacotamento (F15)

- [ ] **Instalador NSIS do Wails** (`wails build -nsis`) **por usuário**: instala em `%LOCALAPPDATA%\Programs\ModOrchestrator`, sem UAC. O template padrão do Wails pede administrador **(verificar)**; ajustar `RequestExecutionLevel user` e o diretório no `project.nsi`.
- [ ] Desinstalador remove o app e **não** apaga dados (`%APPDATA%\ModOrchestrator`) nem staging, a menos que o usuário marque a opção; nunca toca pastas de jogo.
- [ ] **WebView2**: usar o bootstrapper do Wails (baixa só se faltar); documentar o requisito.
- [ ] **Versão portátil** (`.zip`) opcional, avisando que arquivos extraídos herdam a marca "baixado da internet".
- [ ] Build com `-trimpath`, **sem UPX** (D077).
- [ ] Ícone, nome e descrição consistentes no executável, instalador e atalho.

## Etapa 3 — Pipeline de release

Workflow `release.yml`, separado do CI:

1. Disparo: tag `v*` criada na `master` (pré-release para `v*-beta.*`).
2. Job de build (sem segredos): testes completos, `wails build -nsis`, `THIRD_PARTY_NOTICES`, artefatos não assinados.
3. Job de assinatura em **environment protegido** (aprovação manual): envia os artefatos à SignPath, recebe assinados. O executável é assinado **antes** de entrar no instalador, e o instalador depois.
4. Job de publicação: `SHA256SUMS`, notas de versão (do `CHANGELOG.md`), GitHub Release em rascunho para revisão humana.
5. Checklist manual (abaixo) e publicação do rascunho.

## Etapa 4 — Assinatura (SignPath Foundation)

- [ ] Confirmar requisitos atuais no site da SignPath Foundation **(verificar)**: licença OSI, repositório público, build no GitHub Actions, política de assinatura, 2FA, maturidade mínima do projeto (pode exigir release anterior).
- [ ] Inscrever o projeto quando o repositório estiver público e com uma beta utilizável.
- [ ] Se a aprovação exigir release anterior: a primeira beta sai **sem assinatura**, com o aviso explicado no README e nas notas.
- [ ] O certificado sai em nome da SignPath Foundation, não do autor; documentar isso na política de assinatura.
- [ ] Expectativa: mesmo assinado, o SmartScreen avisa até a reputação se formar; manter o mesmo certificado e nome de arquivo estáveis ajuda a acumular reputação.

## Etapa 5 — Canais

| Canal | Quando | Observação |
|---|---|---|
| GitHub Releases | toda release | fonte da verdade; instalador, zip portátil, `SHA256SUMS`, notas |
| winget (`winget-pkgs`) | a partir da primeira estável | PR no repositório da Microsoft; manifesto atualizado a cada versão (automatizável) |
| Scoop (bucket próprio ou `extras`) | a partir da primeira estável | usa o zip portátil |
| Nexus Mods | a partir da primeira estável | página com descrição e link para o GitHub; arquivo hospedado também lá **(verificar regras do Nexus para ferramentas)** |

## Etapa 6 — Atualização do app (opt-in)

- Setting desligado por padrão; é a única chamada de rede da V1 (00-visao-e-escopo).
- Consulta a API de releases do GitHub; canal estável ou beta escolhido pelo usuário.
- Baixa o instalador, confere o hash com o `SHA256SUMS` da release e a assinatura (quando houver); qualquer divergência aborta e mostra o motivo.
- Nunca atualiza com operação em andamento; mostra notas de versão antes de instalar.
- Migrations do banco seguem core/14 (backup antes de migrar).

## Etapa 7 — Depois da F15 (testes e refino pelo usuário)

- [ ] Instalar e desinstalar em Windows 10 e 11 limpos (VM), conta sem administrador, com Defender ativo.
- [ ] Baixar pelo navegador (Edge e Chrome) e anotar exatamente o que o SmartScreen mostra, com e sem assinatura.
- [ ] VirusTotal do instalador e do executável; reportar falsos positivos.
- [ ] Atualizar de uma versão para a seguinte pelo atualizador e pelo instalador manual.
- [ ] Beta fechada/aberta por tags `-beta`; coletar issues pelos templates.
- [ ] Revisar este plano com o que foi observado e registrar decisões novas.

## Checklist de cada release

- [ ] CI verde na `master`; `go vet`, `go test`, typecheck, testes do frontend, `wails build`.
- [ ] `CHANGELOG.md` atualizado; versão da tag igual à do executável.
- [ ] `THIRD_PARTY_NOTICES` regenerado e sem licença incompatível.
- [ ] Artefatos assinados (assinatura conferida com `Get-AuthenticodeSignature`).
- [ ] `SHA256SUMS` confere com os arquivos publicados.
- [ ] VirusTotal sem detecções relevantes (ou falso positivo reportado).
- [ ] Instalação limpa e atualização testadas numa VM.
- [ ] Manifestos do winget/Scoop atualizados.

## Pendências

| # | Pendência | Quando | Quem |
|---|---|---|---|
| PUB-1 | Requisitos atuais da SignPath Foundation | antes da etapa 4 | agente/usuário |
| PUB-2 | Nível de execução padrão do instalador NSIS do Wails | F15 | agente |
| PUB-3 | Regras do Nexus para hospedar ferramentas | antes da etapa 5 | usuário |
| PUB-4 | Quando tornar o repositório público | antes da etapa 4 | usuário |
