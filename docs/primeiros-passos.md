# Primeiros passos

[English](getting-started.md)

Este guia leva da instalação até jogar Skyrim Special Edition com mods. Vale para qualquer jogo suportado; o Skyrim é o exemplo.

## 1. Instalar

1. Baixe `ModOrchestrator-amd64-installer.exe` na página de [Releases](https://github.com/LeonardoDett/ModOrchestrator/releases). Confira o hash com o arquivo `SHA256SUMS` da mesma release, se quiser (`Get-FileHash .\ModOrchestrator-amd64-installer.exe`).
2. Execute o instalador. Ele instala só para o seu usuário, em `%LOCALAPPDATA%\Programs\ModOrchestrator`, e **não pede administrador**.
3. Se o Windows mostrar "O Windows protegeu o computador" (SmartScreen), é porque o arquivo é novo ou ainda não tem reputação. Clique em **Mais informações** e confira se o editor é o esperado (releases assinadas mostram "SignPath Foundation") antes de **Executar assim mesmo**. Veja a [política de assinatura](../README.md#instalação) no README.

Requisito: Windows 10 ou 11 (64 bits). O WebView2 é instalado pelo instalador se faltar.

Versão portátil: o `.zip` da release roda sem instalar. Os dados ficam no mesmo lugar (`%APPDATA%\ModOrchestrator`).

## 2. Gerenciar o jogo

1. Abra o Mod Orchestrator. O **Dashboard** mostra os **Primeiros passos**.
2. Em **Jogos**, o app já procurou instalações na Steam, GOG, Epic e no registro. Clique em **Gerenciar** no Skyrim Special Edition. Se ele não aparecer, use **Localizar manualmente…** e escolha a pasta que tem `SkyrimSE.exe`.
3. O assistente sugere as pastas do jogo: **staging** (onde os mods ficam isolados), archives e backups de originais. Prefira o mesmo disco do jogo: assim o deploy usa hardlinks, que são rápidos e não ocupam espaço extra.

Nada é escrito na pasta do jogo nesta etapa.

## 3. Importar mods

1. Abra **Mods** e use **Importar arquivo** (ZIP, 7z ou RAR) ou **Importar pasta…**. Também dá para arrastar vários arquivos para a lista.
2. Mods com instalador FOMOD abrem o assistente com as opções do autor. O SKSE vai sozinho para a raiz do jogo.
3. Habilite os mods que quer usar. A ordem da lista é a prioridade: quem está mais abaixo vence os conflitos de arquivo. Regras ("vence", "requer", "incompatível") ficam em **Regras**, e a tela **Conflitos** mostra quem vence cada arquivo.

## 4. Fazer o deploy

1. Clique em **Deploy** (barra de status ou Dashboard). **Ver o que o deploy vai fazer** mostra o plano antes de rodar.
2. Arquivos originais do jogo que um mod substitui são guardados fora da pasta do jogo e voltam no **Purge**. Nada que o app não colocou é apagado.
3. Se outra ferramenta mudar arquivos implantados, o app avisa e pede uma decisão por arquivo em **Revisar alterações**.

## 5. Plugins e jogar

1. Em **Plugins**, ative os `.esp`/`.esm`/`.esl` e use **Ordenar agora** se quiser a ordenação automática. O `plugins.txt` é escrito no deploy.
2. Clique em **Jogar**. O app confere se o deploy está em dia, se há problemas bloqueantes e lança pelo `skse64_loader.exe` quando o SKSE está instalado.

## Quando algo dá errado

- **Diagnóstico** lista os problemas, do que impede o jogo de funcionar ao que é só informativo, cada um com uma ação que leva à solução.
- **Diagnóstico › Histórico** mostra o que mudou e permite desfazer quando possível; **Perfis** guarda pontos de restauração.
- Para pedir ajuda, use **Exportar pacote de diagnóstico** em Diagnóstico › Problemas e anexe-o à issue no GitHub. Os logs ficam em `%APPDATA%\ModOrchestrator\logs`.

## Atualizações

O app não acessa a internet por padrão. Em **Configurações › Aplicação › Atualizações**, ligue **Verificar atualizações** para ser avisado de versões novas; o download só acontece quando você confirma, e o instalador é conferido com os hashes e a assinatura da release antes de rodar.

## Desinstalar

Use "Aplicativos instalados" do Windows. O desinstalador remove o programa e mantém seus dados, a menos que você marque a opção de apagá-los. Ele nunca apaga mods, staging nem pastas de jogo. Para tirar os mods do jogo, faça o **Purge** de cada jogo no app antes de desinstalar.
