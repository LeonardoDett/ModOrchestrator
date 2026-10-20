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

1. Open Mod Orchestrator. **Home** shows the **First steps** and what needs attention.
2. In **Library**, click **Add game**. The list shows the supported games; the app has already looked for installations in Steam, GOG, Epic and the registry. Choose Skyrim Special Edition and click **Manage**. If it is not there, use **Point to the folder** and choose the folder that has `SkyrimSE.exe`: the app tells which game it recognized.
3. The wizard suggests the game folders: **staging** (where mods stay isolated), archives and backups of originals. Prefer the game's drive: deployment then uses hardlinks, which are fast and take no extra space.
4. If Vortex or Mod Organizer 2 already manage this game, the app offers **Import everything** (mods, order, rules, profiles and plugins, copied; nothing changes in the other program), **Choose what to import** or **Start from scratch**. You can import later, in **Mods › Import › From another manager…**.

Nothing is written to the game folder at this step.

## 3. Add mods

1. Open **Mods** and use **Add mods** (ZIP, 7z or RAR) or the **Import** menu (file, folder or another manager). You can also drag several files onto the list; they go to the **Install queue**.
2. Mods with a FOMOD installer open the wizard with the author's options. SKSE goes to the game root by itself.
3. Enable the mods you want. The order is the profile's priority: the later one wins file conflicts. **Filters** splits by status, category, tags, conflicts and contents; the detail of each mod (click the row) shows files, conflicts and history. Rules are in **More actions › Rules between mods**, and the **Conflicts** screen shows who wins each pair.

## 4. Deploy

1. With automatic deployment on (the default), the game folder follows the list by itself. Otherwise use the deployment card in the game menu or **Mods › More actions › Deploy now**; the plan shows what will change before it runs.
2. Original game files a mod replaces are kept outside the game folder and come back with **Clean the deployment**. Nothing the app did not place is deleted.
3. If another tool changes deployed files, the app warns and asks for a decision per file.

## 5. Plugins and play

1. In **Plugins**, enable the plugins and use **Sort now** for the automatic order; **Load order** shows why each one is where it is and **Apply in the game** writes the order file.
2. Click **Play**, at the foot of the game menu. The app checks that the deployment is up to date and that nothing blocks, and launches through `skse64_loader.exe` when SKSE is installed.

## When something goes wrong

- **Diagnostics** lists the problems by severity; each one says what it causes, what was found and how to solve it, with the action button.
- **Diagnostics › History** shows what changed and undoes it when possible; **Profiles** keeps restore points.
- The bell shows the notifications; **Need action** separates the ones that need you.
- To ask for help, use **Export diagnostic package** in Diagnostics and attach it to the GitHub issue. Logs are in `%APPDATA%\ModOrchestrator\logs`.

## Updates

The app does not use the internet by default. In **Settings › Application › Updates**, turn on **Check for updates** to hear about new versions; downloading only happens when you confirm, and the installer is checked against the release checksums and signature before it runs.

## Uninstall

Use Windows "Installed apps". The uninstaller removes the program and keeps your data unless you tick the option to delete it. It never deletes mods, staging or game folders. To remove mods from a game, **Purge** each game in the app before uninstalling.
