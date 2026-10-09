# Getting started

[Português](primeiros-passos.md)

From installing to playing Skyrim Special Edition with mods. The same steps apply to any supported game; Skyrim is the example.

## 1. Install

1. Download `ModOrchestrator-amd64-installer.exe` from [Releases](https://github.com/LeonardoDett/ModOrchestrator/releases). Optionally compare its hash with the release's `SHA256SUMS` (`Get-FileHash .\ModOrchestrator-amd64-installer.exe`).
2. Run the installer. It installs for your user only, in `%LOCALAPPDATA%\Programs\ModOrchestrator`, and **does not ask for administrator rights**.
3. If Windows shows "Windows protected your PC" (SmartScreen), the file is new or has no reputation yet. Click **More info** and check the publisher (signed releases show "SignPath Foundation") before **Run anyway**. See the [signing policy](../README.md#instalação) in the README.

Requires Windows 10 or 11 (64-bit). The installer adds WebView2 if it is missing.

Portable version: the release `.zip` runs without installing. Data is kept in the same place (`%APPDATA%\ModOrchestrator`).

## 2. Manage the game

1. Open Mod Orchestrator. The **Dashboard** shows **First steps**.
2. In **Games**, the app already looked for Steam, GOG, Epic and registry installations. Click **Manage** on Skyrim Special Edition. If it is not there, use **Locate manually…** and pick the folder with `SkyrimSE.exe`.
3. The assistant suggests the game's folders: **staging** (where mods stay isolated), archives and backups of originals. Prefer the game's drive: deploy then uses hardlinks, which are fast and take no extra space.

Nothing is written to the game folder in this step.

## 3. Import mods

1. Open **Mods** and use **Import file** (ZIP, 7z or RAR) or **Import folder…**. You can also drop several files on the list.
2. Mods with a FOMOD installer open the assistant with the author's options. SKSE goes to the game root by itself.
3. Enable the mods you want. The list order is the priority: the lower a mod, the more file conflicts it wins. Rules ("wins over", "requires", "incompatible") are in **Rules**, and **Conflicts** shows which mod wins each file.

## 4. Deploy

1. Click **Deploy** (status bar or Dashboard). **See what the deploy will do** shows the plan before it runs.
2. Original game files replaced by a mod are kept outside the game folder and come back on **Purge**. Nothing the app did not put there is deleted.
3. If another tool changes deployed files, the app tells you and asks for a decision per file in **Review changes**.

## 5. Plugins and play

1. In **Plugins**, enable the `.esp`/`.esm`/`.esl` files and use **Sort now** for automatic ordering. `plugins.txt` is written on deploy.
2. Click **Play**. The app checks that the deploy is current and nothing blocks the game, and launches through `skse64_loader.exe` when SKSE is installed.

## When something goes wrong

- **Diagnostics** lists problems, from what stops the game from working to what is only informative, each with an action that leads to the fix.
- **Diagnostics › History** shows what changed and undoes it when possible; **Profiles** keep restore points.
- To ask for help, use **Export diagnostic package** in Diagnostics › Problems and attach it to a GitHub issue. Logs are in `%APPDATA%\ModOrchestrator\logs`.

## Updates

The app does not use the internet by default. In **Settings › Application › Updates**, turn on **Check for updates** to hear about new versions; downloading only happens when you confirm, and the installer is checked against the release checksums and signature before it runs.

## Uninstall

Use Windows "Installed apps". The uninstaller removes the program and keeps your data unless you tick the option to delete it. It never deletes mods, staging or game folders. To remove mods from a game, **Purge** each game in the app before uninstalling.
