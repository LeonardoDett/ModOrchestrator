import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, LoadOrderView, PluginDetails, PluginList, PluginRow } from "../bridge/types";

const row = (name: string, position: number, extra: Partial<PluginRow> = {}): PluginRow => ({
  name,
  enabled: true,
  implicit: false,
  locked: false,
  position,
  index: (position - 1).toString(16).toUpperCase().padStart(2, "0"),
  origin: "mod",
  mod: `m-${name}`,
  modName: name.replace(/\.es[pml]$/, ""),
  flags: [],
  group: "default",
  masters: 0,
  problems: 0,
  problem: "",
  severity: "",
  author: "",
  version: "",
  description: "",
  rules: 0,
  ...extra,
});

const ROWS: PluginRow[] = [
  row("Skyrim.esm", 1, { implicit: true, locked: true, origin: "base_game", mod: "", modName: "", flags: ["master"] }),
  row("Lib.esm", 2, { flags: ["master"] }),
  row("Patch.esp", 3, { problems: 1, problem: "plugin_missing_master", severity: "error", masters: 1 }),
];

const LIST: PluginList = {
  rows: ROWS,
  limits: [
    { kind: "full", used: 3, max: 254 },
    { kind: "light", used: 0, max: 4096 },
  ],
  active: 3,
  errors: 1,
  autoSort: true,
  disabled: [],
  external: false,
  cycle: [],
  manualOrder: true,
  hasLoadOrder: true,
};

function world(over: Partial<LoadOrderView["state"]> = {}) {
  const calls: string[] = [];
  const details: PluginDetails = {
    ...ROWS[2]!,
    path: "C:/s/Patch.esp",
    headerError: "",
    mastersList: [{ name: "Missing.esm", present: false, active: false, before: false, mod: "m-missing", modName: "Missing Mod", disabled: true }],
    dependents: [],
    ruleList: [],
    diagnostics: [],
  };
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 8, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({
      active: { id: "i1", name: "Skyrim", gameName: "Skyrim" },
      instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }],
      items: ["overview", "mods", "plugins", "load_order", "conflicts"],
    }),
    pluginList: async () => LIST,
    pluginDetails: async () => details,
    pluginRules: async () => ({ rules: [], groups: [{ name: "default", after: [], plugins: [], default: true }], plugins: ROWS.map((r) => r.name) }),
    loadOrderView: async () => ({
      ...LIST,
      canUndoSort: false,
      state: { supported: true, applied: false, differences: 2, external: false, fileExists: true, unreadable: false, canRestorePrevious: false, ...over },
    }),
    loadOrderExplain: async (_i, name) => ({
      plugin: name,
      position: 3,
      fixed: false,
      locked: false,
      group: "default",
      after: [{ kind: "master", rule: "", group: "", afterGroup: "", other: "Lib.esm", before: true, plugin: name }],
      dependents: [],
    }),
    setPluginsEnabled: async (_i, names, enabled) => {
      calls.push(`enabled:${names.join(",")}:${enabled}`);
    },
    setModsEnabled: async (_i, ids, enabled) => {
      calls.push(`mods:${ids.join(",")}:${enabled}`);
    },
    sortPreview: async () => ({ moves: [], confirmAbove: 20, cycle: [] }),
    movePlugins: async (_i, names, index) => {
      calls.push(`move:${names.join(",")}:${index}`);
      return { applied: false, violated: [{ kind: "master", rule: "", group: "", afterGroup: "", other: "Lib.esm", before: true, plugin: "Patch.esp" }], nearest: 2 };
    },
    applyLoadOrder: async () => {
      calls.push("apply");
      return "op1";
    },
    loadOrderDiffApplied: async () => ({ desired: [{ name: "Lib.esm", enabled: true }], applied: [{ name: "Old.esp", enabled: true }], exists: true }),
    resolveLoadOrderChange: async (_i, action) => {
      calls.push(`resolve:${action}`);
      return "op2";
    },
  };
  return { backend, calls };
}

async function open(user: ReturnType<typeof userEvent.setup>, name: string) {
  const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;
  await user.click(await within(nav).findByRole("button", { name }));
}

describe("Plugins screen (F11)", () => {
  beforeEach(() => localStorage.clear());

  it("shows limits, problems and resolves a missing master from the Inspector", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await open(user, "Plugins");
    expect(await screen.findByText("3 plugins · 3 active · Full 3/254 · Light 0/4,096 · 1 with errors")).toBeInTheDocument();
    // The problem is identifiable without opening anything (icon + count).
    expect(screen.getByRole("img", { name: /1 problem: A plugin is missing a master/ })).toBeInTheDocument();
    // The implicit plugin cannot be turned off.
    expect(screen.getByRole("switch", { name: "Skyrim.esm is always active" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("switch", { name: "Activate Lib.esm" }));
    expect(calls).toContain("enabled:Lib.esm:false");
    await user.click(screen.getByText("Patch.esp"));
    await user.click(await screen.findByRole("button", { name: "Enable Missing Mod" }));
    expect(calls).toContain("mods:m-missing:true");
  });
});

describe("Load Order screen (F11)", () => {
  beforeEach(() => localStorage.clear());

  it("tells why a plugin is in place, applies and refuses a move with an alternative", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await open(user, "Load Order");
    expect(await screen.findByText("Different from the applied order (2 differences)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(calls).toContain("apply");
    await user.click(screen.getByText("Patch.esp"));
    expect(await screen.findByText("after Lib.esm (master)")).toBeInTheDocument();
    // Sorting an order that is already valid says so and moves nothing.
    await user.click(screen.getByRole("button", { name: "Sort now" }));
    expect(await screen.findByText("The order already respects every constraint; nothing moved.")).toBeInTheDocument();
  });

  it("an external change is reviewed before anything is written (INV-PLG-03)", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({ external: true });
    render(<App backend={backend} />);
    await open(user, "Load Order");
    await user.click(await screen.findByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    expect(calls).not.toContain("apply");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Action" }), "import_load_order");
    await user.click(within(dialog).getByRole("button", { name: "Apply decision" }));
    expect(calls).toContain("resolve:import_load_order");
  });
});
