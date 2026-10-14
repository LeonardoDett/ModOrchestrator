import { render, screen, waitFor, within } from "@testing-library/react";
import { openScreen } from "../test/shell";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, DeployStatus, ModDetails, ModRow, PluginList, PluginRow } from "../bridge/types";
import { ptBR } from "../i18n/catalog/pt-BR";

const mod = (over: Partial<ModRow>): ModRow => ({
  id: "m1", name: "SkyUI", detectedName: "SkyUI", version: "5.2", author: "", category: "", categoryPath: [], state: "installed",
  enabled: true, size: 2048, files: 3, type: "default", typeName: "Default", content: [], installer: "basic", source: "SkyUI.7z",
  hasNotes: false, queued: false, ...over,
});

const plugin = (over: Partial<PluginRow>): PluginRow => ({
  name: "SkyUI.esp", enabled: false, implicit: false, locked: false, position: 2, index: "", origin: "mod", mod: "m1", modName: "SkyUI",
  flags: [], group: "default", masters: 0, problems: 0, problem: "", severity: "", author: "", version: "", description: "", rules: 0, ...over,
});

const STATUS: DeployStatus = {
  instance: "i1", kind: "in_sync", reason: "up_to_date", activeProfile: { id: "p1", name: "Default" }, method: "hardlink",
  entries: 3, externalChanges: 0, newFiles: 0, foreign: [], failures: [],
};

function world(over: Partial<Backend> = {}) {
  const calls: string[] = [];
  let mods = [mod({}), mod({ id: "m2", name: "Textures", enabled: false })];
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 8, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods", "plugins"] }),
    deployStatus: async () => STATUS,
    pendingDeployDecision: async () => null,
    modList: async () => mods,
    importQueue: async () => [],
    categories: async () => [],
    modDetails: async (id): Promise<ModDetails> => ({ ...mods.find((m) => m.id === id)!, description: "", notes: "", tags: [], modTypes: [] }),
    modFiles: async () => ({ total: 0, files: [] }),
    modHistory: async () => [],
    setModsEnabled: async (_i, ids, enabled) => {
      calls.push(`enable:${ids.join(",")}:${enabled}`);
      mods = mods.map((m) => (ids.includes(m.id) ? { ...m, enabled } : m));
    },
    enableImpact: async () => ({ alsoEnable: [], affected: [] }),
    previewModRemoval: async (_i, ids) => ({ mods: ids.map((id) => ({ id, name: id, version: "" })), orphanRules: 0, sharedArchives: [], deployed: false }),
    pickImportFiles: async () => {
      calls.push("pick");
      return [];
    },
    pluginList: async (): Promise<PluginList> => ({
      rows: [plugin({ name: "Skyrim.esm", implicit: true, enabled: true, index: "00", origin: "base_game", mod: "", modName: "", position: 1 }), plugin({})],
      limits: [], active: 1, errors: 0, autoSort: false, disabled: [], external: false, cycle: [], manualOrder: true, hasLoadOrder: true,
    }),
    pluginRules: async () => ({ rules: [], groups: [{ name: "default", default: true, after: [], members: 0 }] }) as never,
    setPluginsEnabled: async (_i, names, enabled) => {
      calls.push(`plugins:${names.join(",")}:${enabled}`);
    },
    ...over,
  };
  return { backend, calls };
}

const sidebar = () => screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

async function openMods(user: ReturnType<typeof userEvent.setup>) {
  await openScreen(user, "Mods");
  return screen.findByRole("grid", { name: "Mods" });
}

describe("F13: keyboard and page states", () => {
  beforeEach(() => localStorage.clear());

  it("Space toggles the focused mod and Delete asks to remove it", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    const grid = await openMods(user);
    await screen.findByText("Textures");
    grid.focus(); // focuses the first row (SkyUI)
    await user.keyboard("{ArrowDown}"); // Textures
    await user.keyboard(" ");
    await waitFor(() => expect(calls).toContain("enable:m2:true"));
    await user.keyboard("{Delete}");
    expect(await screen.findByRole("dialog", { name: "Remove 1 mod" })).toBeInTheDocument();
  });

  it("Shift+F10 opens the menu of the focused row and Escape returns to the table", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    const grid = await openMods(user);
    await screen.findByText("Textures");
    grid.focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Remove…" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(grid).toHaveFocus();
  });

  it("Escape closes the Inspector opened from the table", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    const grid = await openMods(user);
    await screen.findByText("Textures");
    grid.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("complementary", { name: "SkyUI" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "SkyUI" })).not.toBeInTheDocument());
  });

  it("Ctrl+2 opens the second screen of the game and moves the focus to the content; Ctrl+F finds its search", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await within(sidebar()).findByRole("group", { name: "Jump to" });
    await user.keyboard("{Control>}2{/Control}");
    await screen.findByRole("grid", { name: "Mods" });
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    await user.keyboard("{Control>}f{/Control}");
    expect(screen.getByRole("textbox", { name: "Search mods" })).toHaveFocus();
  });

  it("Ctrl+I opens the import of the active game", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await within(sidebar()).findByRole("group", { name: "Jump to" });
    await user.keyboard("{Control>}i{/Control}");
    await waitFor(() => expect(calls).toContain("pick"));
  });

  it("the palette reaches the game screens and the deploy", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await within(sidebar()).findByRole("group", { name: "Jump to" });
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Go to Plugins")).toBeInTheDocument();
    expect(within(dialog).getByText("Deploy the active game")).toBeInTheDocument();
    expect(within(dialog).getByText("Import files into the active game")).toBeInTheDocument();
  });

  it("offers a skip link to the content", async () => {
    const { backend } = world();
    render(<App backend={backend} />);
    const link = await screen.findByRole("link", { name: "Skip to content" });
    link.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("names the operation holding the game (busy state)", async () => {
    const user = userEvent.setup();
    const { backend } = world({ deployStatus: async () => ({ ...STATUS, busy: "deploy" }) });
    render(<App backend={backend} />);
    await openMods(user);
    expect(await screen.findByText("Deploy in progress. Actions that change this game are unavailable until it finishes.")).toBeInTheDocument();
  });

  it("shows a loading skeleton with an accessible status while the list loads", async () => {
    const user = userEvent.setup();
    const { backend } = world({ modList: () => new Promise(() => {}) });
    render(<App backend={backend} />);
    await openScreen(user, "Mods");
    expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("Space toggles the focused plugin; implicit plugins stay put", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Plugins");
    const grid = await screen.findByRole("grid", { name: "Plugins" });
    await screen.findByText("SkyUI.esp");
    grid.focus(); // Skyrim.esm, implicit
    await user.keyboard(" ");
    expect(calls.filter((c) => c.startsWith("plugins:"))).toEqual([]);
    await user.keyboard("{ArrowDown} ");
    await waitFor(() => expect(calls).toContain("plugins:SkyUI.esp:true"));
  });

  it("pt-BR uses the glossary term Perfil, never profile (docs-ia/01)", () => {
    const offenders = Object.entries(ptBR).filter(([, text]) => /\bprofiles?\b/i.test(text));
    expect(offenders).toEqual([]);
  });
});
