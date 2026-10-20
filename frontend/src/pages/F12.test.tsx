import { render, screen, within } from "@testing-library/react";
import { openScreen, SETTINGS_TABS } from "../test/shell";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, Dashlet, DeployStatus, Diagnostic, InstanceOverview, LaunchCheck, ManagedGame, Setting, UpdateStatus } from "../bridge/types";
import { chooseOption } from "../test/select";

const GAME: ManagedGame = {
  id: "i1", gameId: "skyrimse", gameName: "Skyrim Special Edition", custom: false, name: "Skyrim", adapter: "skyrimse",
  store: "steam", root: "C:/Skyrim", staging: "C:/MO/staging", archiveStore: "C:/MO/archives", backupStore: "C:/MO/backups",
  method: "hardlink", version: "1.6", active: true, hidden: false, unavailable: false, rootMissing: false, deployed: true,
  capabilities: ["plugins", "load_order", "launch"], sections: ["settings.plugins", "workarounds.pluginCache", "overview.plugins"], targets: [], modTypes: [], foreign: [],
};

const STATUS: DeployStatus = {
  instance: "i1", kind: "in_sync", reason: "up_to_date", activeProfile: { id: "p1", name: "Default" }, method: "hardlink",
  entries: 3, externalChanges: 0, newFiles: 0, foreign: [], failures: [],
};

const setting = (key: string, type: Setting["type"], value: string, extra: Partial<Setting> = {}): Setting => ({
  key, tab: "interface", type, value, default: value, isDefault: true, advanced: false, restartRequired: false, ...extra,
});

const APP_SETTINGS: Setting[] = [
  setting("ui.language", "enum", "en", { options: ["en", "pt-BR"] }),
  setting("ui.customTitleBar", "bool", "true", { restartRequired: true }),
  setting("ui.relativeTimes", "bool", "false"),
  setting("ui.advancedMode", "bool", "false"),
  setting("ui.dashboard.dashlets", "list", "first_steps,attention,active_game,recent_games,recent_operations,whats_new", {
    options: ["first_steps", "attention", "active_game", "recent_games", "recent_operations", "whats_new"],
  }),
  setting("automation.deployDelayMs", "int", "1500", { min: 0, max: 60000, advanced: true }),
  setting("app.dataDir", "path", "C:/Data"),
  setting("history.retentionDays", "int", "180", { min: 7, max: 3650 }),
  setting("theme.fontScale", "int", "100", { min: 90, max: 125 }),
];

const blocking: Diagnostic = {
  key: "foreign#1", code: "foreign_deployment", severity: "error", blocking: true, blocks: ["deploy", "launch"], module: "deploy",
  instance: "i1", params: { kind: "vortex" }, evidence: [], actions: [{ id: "diagnostics.recheck" }], related: [], new: false, suppressed: false,
};

const CHECK: LaunchCheck = {
  instance: "i1", state: "ready", options: [{ id: "skse", exe: "skse64_loader.exe", default: true }, { id: "game", exe: "SkyrimSE.exe", default: false }],
  deployKind: "in_sync", deployReason: "up_to_date", deployNeeded: false, autoDeploy: true, deployProblem: false, running: [], blocking: [], warnings: [],
};

function world(over: Partial<Backend> = {}, check: Partial<LaunchCheck> = {}) {
  const calls: string[] = [];
  const instanceSettings: Record<string, Setting[]> = {
    i1: [setting("automation.deployOnChange", "bool", "true")],
    i2: [setting("automation.deployOnChange", "bool", "false")],
  };
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1.0.0", dataDir: "/d", schemaVersion: 8, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    settingsTabs: async () => SETTINGS_TABS,
    listAppSettings: async () => APP_SETTINGS,
    setAppSetting: async (k, v) => {
      calls.push(`set:${k}=${v}`);
    },
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods", "plugins"] }),
    gamesView: async () => ({ managed: [GAME, { ...GAME, id: "i2", name: "Skyrim 2", active: false }], discovered: [], supported: [], scanned: true, hiddenCount: 0 }),
    profileList: async () => [],
    deployStatus: async () => STATUS,
    pendingDeployDecision: async () => null,
    listInstanceSettings: async (i) => instanceSettings[i] ?? [],
    setInstanceSetting: async (i, k, v) => {
      calls.push(`setInstance:${i}:${k}=${v}`);
    },
    suppressions: async () => [],
    restartState: async () => ({ settings: [], restore: false }),
    launchCheck: async () => ({ ...CHECK, ...check }),
    launch: async (i, r) => {
      calls.push(`launch:${i}:${JSON.stringify(r)}`);
      return "op1";
    },
    attentionDiagnostics: async () => [],
    notifications: async () => [],
    diagnostics: async () => ({ instance: "i1", items: [], suppressed: [], counts: { blocking: 0, errors: 0, warnings: 0, infos: 0 }, partial: false }),
    ...over,
  };
  return { backend, calls };
}

const sidebar = () => screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

describe("F12: Settings, Extensions, Play, Overview, Dashboard", () => {
  beforeEach(() => localStorage.clear());

  it("Settings shows the V1 tabs in the Vortex order and no reserved one", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    const tabs = await screen.findAllByRole("tab");
    await screen.findByRole("tab", { name: "Plugins" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Interface", "Application", "Mods", "Plugins", "Troubleshooting", "Theme"]);
    expect(tabs.some((t) => /download/i.test(t.textContent ?? ""))).toBe(false);
  });

  it("Settings renders the tabs the backend lists: a module tab only for the games that offer it (D135)", async () => {
    const user = userEvent.setup();
    const plain: ManagedGame = { ...GAME, id: "i2", name: "Valheim", active: false, capabilities: [], sections: [] };
    const { backend, calls } = world({
      settingsTabs: async () => [...SETTINGS_TABS, { id: "saves", section: "settings.saves" }],
      gamesView: async () => ({ managed: [GAME, { ...plain, sections: ["settings.saves"] }], discovered: [], supported: [], scanned: true, hiddenCount: 0 }),
      listInstanceSettings: async (i) => (i === "i2" ? [setting("saves.backupOnLaunch", "bool", "true", { tab: "saves" })] : [setting("plugins.autoSort", "bool", "true", { tab: "plugins" })]),
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await screen.findByRole("tab", { name: "Plugins" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Interface", "Application", "Mods", "Plugins", "Troubleshooting", "Theme", "saves"]);
    await user.click(screen.getByRole("tab", { name: "saves" }));
    const toggle = await screen.findByRole("switch", { name: "saves.backupOnLaunch" });
    await user.click(toggle);
    expect(calls).toContain("setInstance:i2:saves.backupOnLaunch=false");
  });

  it("Settings has no Plugins tab when no managed game offers it", async () => {
    const user = userEvent.setup();
    const { backend } = world({
      gamesView: async () => ({ managed: [{ ...GAME, capabilities: [], sections: [] }], discovered: [], supported: [], scanned: true, hiddenCount: 0 }),
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await screen.findByRole("tab", { name: "Theme" });
    expect(screen.queryByRole("tab", { name: "Plugins" })).toBeNull();
  });

  it("per-game settings follow the game chosen at the top", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    const game = await screen.findByRole("combobox", { name: "Applies to" });
    const toggle = await screen.findByRole("switch", { name: "Deploy when enabling or disabling a mod" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await chooseOption(user, game, "Skyrim 2");
    expect(await screen.findByRole("switch", { name: "Deploy when enabling or disabling a mod" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("switch", { name: "Deploy when enabling or disabling a mod" }));
    expect(calls).toContain("setInstance:i2:automation.deployOnChange=true");
  });

  it("advanced settings appear only in advanced mode; limits use a numeric stepper", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await screen.findByRole("tab", { name: "Interface" });
    expect(screen.queryByRole("spinbutton", { name: "Automatic deploy delay (ms)" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Application" }));
    const retention = await screen.findByRole("spinbutton", { name: "Keep history (days)" });
    await user.clear(retention);
    await user.type(retention, "30{Enter}");
    expect(calls).toContain("set:history.retentionDays=30");
  });

  it("a changed restart-required setting shows a persistent notice with Restart now", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({
      restartState: async () => ({ settings: ["ui.customTitleBar"], restore: false }),
      restartApp: async () => {
        calls.push("restart");
      },
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    expect(await screen.findByText(/Own title bar/, { selector: "span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restart now" }));
    expect(calls).toContain("restart");
  });

  it("DLG-27 restores a chosen backup after stating the consequences", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({
      backupStatus: async () => ({
        lastAuto: "2026-10-03T10:00:00Z",
        backups: [
          { id: "state-b-auto.db", kind: "auto", at: "2026-10-03T10:00:00Z", size: 2048 },
          { id: "state-a-manual.db", kind: "manual", at: "2026-10-02T10:00:00Z", size: 1024 },
        ],
      }),
      workarounds: async () => ({ longPaths: "enabled" }),
      restoreBackup: async (id) => {
        calls.push(`restore:${id}`);
      },
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("tab", { name: "Troubleshooting" }));
    await user.click(await screen.findByRole("button", { name: "Restore…" }));
    const dialog = await screen.findByRole("dialog", { name: "Restore a backup" });
    expect(within(dialog).getByText("The current state is backed up first.")).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole("radio")[1]!);
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(calls).toContain("restore:state-a-manual.db");
  });

  it("Extensions lists the built-in adapters without install actions", async () => {
    const user = userEvent.setup();
    const { backend } = world({
      extensions: async () => [
        { name: "skyrimse", version: "1.0.0", builtIn: true, active: true, capabilities: ["plugins"], games: [{ id: "skyrimse", name: "Skyrim Special Edition", capabilities: ["plugins"], custom: false }] },
      ],
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Extensions" }));
    expect(await screen.findByText("Skyrim Special Edition")).toBeInTheDocument();
    expect(screen.getByText("Third-party extensions will be supported in a future version.")).toBeInTheDocument();
    expect(screen.getAllByText("Built-in").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /install|find more/i })).not.toBeInTheDocument();
  });

  it("Play launches at once when ready, and other options are in its menu", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    // Play sits at the foot of the game menu (D120).
    await openScreen(user, "Overview");
    await user.click(await screen.findByRole("button", { name: /^Play\./ }));
    expect(calls).toContain('launch:i1:{"option":"","deploy":false,"confirmed":false}');
    // The other launch options sit on the context menu of Play (board JogoMods: one Play button).
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: /^Play\./ }) });
    await user.click(await screen.findByRole("menuitem", { name: "Launch the game executable" }));
    expect(calls).toContain('launch:i1:{"option":"game","deploy":false,"confirmed":false}');
  });

  it("DLG-26 asks before a pending deploy when auto-deploy is off", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({}, { state: "deploy", deployNeeded: true, autoDeploy: false, deployKind: "pending", deployReason: "desired_changed" });
    render(<App backend={backend} />);
    // Play sits at the foot of the game menu (D120).
    await openScreen(user, "Overview");
    await user.click(await screen.findByRole("button", { name: /^Play\./ }));
    const dialog = await screen.findByRole("dialog", { name: "Deploy needed" });
    await user.click(within(dialog).getByRole("button", { name: "Deploy and play" }));
    expect(calls).toContain('launch:i1:{"option":"","deploy":true,"confirmed":false}');
  });

  it("DLG-26 blocked offers only the actions that solve the problem", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({}, { state: "blocked", blocking: [blocking] });
    render(<App backend={backend} />);
    // Play sits at the foot of the game menu (D120).
    await openScreen(user, "Overview");
    await user.click(await screen.findByRole("button", { name: /^Play\./ }));
    const dialog = await screen.findByRole("dialog", { name: "Cannot launch" });
    expect(within(dialog).queryByRole("button", { name: /Play/ })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("button").length).toBeGreaterThan(1);
    expect(calls.some((c) => c.startsWith("launch:"))).toBe(false);
  });

  it("the Overview says when nothing needs attention and every number opens its screen", async () => {
    const user = userEvent.setup();
    const overview: InstanceOverview = {
      instance: GAME, status: STATUS, attention: [], attentionPartial: false,
      mods: { enabled: 142, total: 380, size: 1024, files: 10 }, plugins: { active: 287, limits: [] },
      conflicts: { pairs: 38, unreviewed: 12, overrides: 4 }, recent: [],
    };
    const { backend } = world({ instanceOverview: async () => overview, modList: async () => [] });
    render(<App backend={backend} />);
    await openScreen(user, "Overview");
    expect(await screen.findByText("Nothing needs attention. The setup is ready to play.")).toBeInTheDocument();
    // Numbers of the game (board JogoGenerico): each opens the screen it counts.
    expect(screen.getByRole("button", { name: /38.*conflicts, 12 to decide/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /142 of 380.*mods active/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Mods" })).toBeInTheDocument();
  });

  it("Instance settings: a game without plugins shows them as not for this game, base ones without a switch (D127)", async () => {
    const user = userEvent.setup();
    const generic: ManagedGame = { ...GAME, gameId: "generic", gameName: "Generic", custom: true, name: "Meu jogo", adapter: "generic", capabilities: [], sections: [] };
    const calls: string[] = [];
    const { backend } = world({
      workspace: async () => ({ active: { id: "i1", name: "Meu jogo", gameName: "Generic" }, instances: [{ id: "i1", name: "Meu jogo", gameName: "Generic" }], items: ["overview", "mods", "instance_settings"] }),
      gameInstanceDetails: async () => generic,
      instanceFeatures: async () => [
        { id: "plugins", status: "not_applicable", class: "optional", requires: [], enabled: false, effective: false, blockedBy: [], screen: "plugins" },
        { id: "launch", status: "available", class: "optional", requires: [], enabled: true, effective: true, blockedBy: [] },
        { id: "filesystem_mod_target", status: "available", class: "base", requires: [], enabled: true, effective: true, blockedBy: [] },
      ],
      setInstanceFeature: async (_i, f, on) => {
        calls.push(`feature:${f}=${on}`);
      },
    });
    render(<App backend={backend} />);
    await openScreen(user, "Instance settings");
    const optional = await screen.findByText("Optional features");
    expect(optional).toBeInTheDocument();
    expect(screen.getByText("Not for this game")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Turn on Plugins" })).not.toBeInTheDocument();
    expect(screen.getByText("Always on")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Turn off Launch" }));
    expect(calls).toContain("feature:launch=false");
  });

  it("the Dashboard renders only visible dashlets and customizes them", async () => {
    const user = userEvent.setup();
    const layout: Dashlet[] = [
      { id: "whats_new", hidden: false, pinned: false, visible: true, locked: false },
      { id: "first_steps", hidden: false, pinned: false, visible: false, locked: false },
      { id: "attention", hidden: false, pinned: false, visible: true, locked: true },
      { id: "recent_games", hidden: true, pinned: false, visible: false, locked: false },
    ];
    const { backend, calls } = world({ dashboardLayout: async () => layout, firstSteps: async () => ({ steps: [], complete: true }) });
    render(<App backend={backend} />);
    expect(await screen.findByText("What's new")).toBeInTheDocument();
    expect(screen.queryByText("Recent games")).not.toBeInTheDocument();
    expect(screen.queryByText("First steps")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.getByRole("switch", { name: "Show Needs attention" })).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "Show Recent games" }));
    expect(calls).toContain("set:ui.dashboard.dashlets=whats_new,first_steps,attention,recent_games");
  });
});

describe("F15: app update (opt-in)", () => {
  beforeEach(() => localStorage.clear());

  const OFFER = {
    version: "1.1.0", published: "2026-10-20T12:00:00Z", size: 15 * 1024 * 1024,
    notes: [{ version: "1.1.0", text: "### Added\n- Faster deploy" }],
  };
  const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
    enabled: true, channel: "stable", installed: "1.0.0", checking: false, installing: false, done: 0, total: -1, launched: false, ...over,
  });
  const withUpdates = (on: boolean) => [
    ...APP_SETTINGS,
    setting("app.updateCheck", "bool", on ? "true" : "false", { tab: "application" }),
    setting("app.updateChannel", "enum", "stable", { tab: "application", options: ["stable", "beta"] }),
  ];

  it("is off by default: Check now stays disabled and nothing is asked", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({
      listAppSettings: async () => withUpdates(false),
      updateStatus: async () => status({ enabled: false }),
      checkForUpdate: async () => {
        calls.push("check");
        return status();
      },
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("tab", { name: "Application" }));
    expect(await screen.findByRole("switch", { name: "Check for updates" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Update checks are off.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled();
    expect(calls).not.toContain("check");
  });

  it("shows the notes of the offered version before installing it", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({
      listAppSettings: async () => withUpdates(true),
      updateStatus: async () => status({ checkedAt: "2026-10-20T13:00:00Z", offer: OFFER }),
      installUpdate: async (v) => {
        calls.push(`install:${v}`);
      },
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("tab", { name: "Application" }));
    expect(await screen.findByText("Version 1.1.0 is available")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See what's new" }));
    const dialog = await screen.findByRole("dialog", { name: "Update to 1.1.0" });
    expect(within(dialog).getByText(/Faster deploy/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Download and install" }));
    expect(calls).toContain("install:1.1.0");
  });

  it("a refused installer says why", async () => {
    const user = userEvent.setup();
    const { backend } = world({
      listAppSettings: async () => withUpdates(true),
      updateStatus: async () => status({ offer: OFFER }),
      installUpdate: async () => {
        throw new Error(JSON.stringify({ code: "update_checksum_mismatch", params: {} }));
      },
    });
    render(<App backend={backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("tab", { name: "Application" }));
    await user.click(await screen.findByRole("button", { name: "See what's new" }));
    const dialog = await screen.findByRole("dialog", { name: "Update to 1.1.0" });
    await user.click(within(dialog).getByRole("button", { name: "Download and install" }));
    expect(await within(dialog).findByText("The downloaded installer does not match the release checksum, so it was discarded.")).toBeInTheDocument();
  });
});
