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

1. Abra o Mod Orchestrator. O **Início** mostra os **Primeiros passos** e o que precisa de atenção.
2. Em **Biblioteca**, clique em **Adicionar jogo**. A lista mostra os jogos suportados; o app já procurou instalações na Steam, GOG, Epic e no registro. Escolha o Skyrim Special Edition e clique em **Gerenciar**. Se ele não estiver lá, use **Apontar a pasta** e escolha a pasta que tem `SkyrimSE.exe`: o app diz que jogo reconheceu.
3. O assistente sugere as pastas do jogo: **staging** (onde os mods ficam isolados), arquivos e backups de originais. Prefira o mesmo disco do jogo: assim a implantação usa hardlinks, que são rápidos e não ocupam espaço extra.
4. Se o Vortex ou o Mod Organizer 2 já cuidam deste jogo, o app oferece **Importar tudo** (mods, ordem, regras, perfis e plugins, copiados; nada muda no outro programa), **Escolher o que importar** ou **Começar do zero**. Dá para importar depois, em **Mods › Importar › De outro gerenciador…**.

Nada é escrito na pasta do jogo nesta etapa.

## 3. Adicionar mods

1. Abra **Mods** e use **Adicionar mods** (ZIP, 7z ou RAR) ou o menu **Importar** (arquivo, pasta ou outro gerenciador). Também dá para arrastar vários arquivos para a lista; eles entram na **Fila de instalação**.
2. Mods com instalador FOMOD abrem o assistente com as opções do autor. O SKSE vai sozinho para a raiz do jogo.
3. Ligue os mods que quer usar. A ordem é a prioridade do perfil: quem vem depois vence os conflitos de arquivo. **Filtros** separa por situação, categoria, tags, conflitos e conteúdo; o detalhe de cada mod (clique na linha) mostra arquivos, conflitos e histórico. Regras ficam em **Mais ações › Regras entre mods**, e a tela **Conflitos** mostra quem vence cada par.

## 4. Implantar

1. Com a implantação automática ligada (padrão), a pasta do jogo acompanha a lista sozinha. Senão, use o cartão de implantação no menu do jogo ou **Mods › Mais ações › Implantar agora**; o plano mostra o que vai mudar antes de rodar.
2. Arquivos originais do jogo que um mod substitui são guardados fora da pasta do jogo e voltam ao **Limpar a implantação**. Nada que o app não colocou é apagado.
3. Se outra ferramenta mudar arquivos implantados, o app avisa e pede uma decisão por arquivo.

## 5. Plugins e jogar

1. Em **Plugins**, ligue os plugins e use **Ordenar agora** se quiser a ordenação automática; **Ordem de carga** mostra por que cada um está onde está e **Aplicar no jogo** grava o arquivo de ordem.
2. Clique em **Jogar**, no pé do menu do jogo. O app confere se a implantação está em dia e se há problemas bloqueantes, e lança pelo `skse64_loader.exe` quando o SKSE está instalado.

## Quando algo dá errado

- **Diagnóstico** lista os problemas por gravidade; cada um diz o que causa, o que foi encontrado e como resolver, com o botão da ação.
- **Diagnóstico › Histórico** mostra o que mudou e permite desfazer quando possível; **Perfis** guarda pontos de restauração.
- O sino mostra as notificações; **Pedem ação** separa as que precisam de você.
- Para pedir ajuda, use **Exportar pacote de diagnóstico** no Diagnóstico e anexe-o à issue no GitHub. Os logs ficam em `%APPDATA%\ModOrchestrator\logs`.

## Atualizações

O app não acessa a internet por padrão. Em **Configurações › Aplicação › Atualizações**, ligue **Verificar atualizações** para ser avisado de versões novas; o download só acontece quando você confirma, e o instalador é conferido com os hashes e a assinatura da release antes de rodar.

## Desinstalar

Use "Aplicativos instalados" do Windows. O desinstalador remove o programa e mantém seus dados, a menos que você marque a opção de apagá-los. Ele nunca apaga mods, staging nem pastas de jogo. Para tirar os mods do jogo, faça o **Purge** de cada jogo no app antes de desinstalar.
