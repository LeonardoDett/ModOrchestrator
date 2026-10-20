import { render, screen, waitFor, within } from "@testing-library/react";
import { openScreen } from "../test/shell";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, ModOrder, ModRow, MoveRequest, ProfileSummary } from "../bridge/types";
import { moveRequestFor, orderedRows } from "../features/mods/mod-order";

const mod = (id: string, name: string, over: Partial<ModRow> = {}): ModRow => ({
  id,
  name,
  detectedName: name,
  version: "1",
  author: "",
  category: "",
  categoryPath: [],
  state: "installed",
  enabled: true,
  size: 10,
  files: 1,
  type: "default",
  typeName: "Default",
  content: [],
  installer: "basic",
  source: `${name}.zip`,
  hasNotes: false,
  queued: false,
  ...over,
});

const ORDER: ModOrder = {
  profileId: "p1",
  profileName: "Default",
  entries: [
    { kind: "mod", modId: "a", priority: 1 },
    { kind: "separator", separator: { id: "s1", label: "Textures", collapsed: false, enabled: 1, total: 2 } },
    { kind: "mod", modId: "b", priority: 2 },
    { kind: "mod", modId: "c", priority: 3 },
  ],
};

function world() {
  const state = {
    mods: [mod("a", "Alpha"), mod("b", "Beta", { enabled: false }), mod("c", "Gamma"), mod("x", "Pending", { state: "imported" })],
    profiles: [
      { id: "p1", name: "Default", notes: "", active: true, enabled: 2, mods: 3, snapshots: 2, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z" },
      { id: "p2", name: "Survival", notes: "Hard mode", active: false, enabled: 1, mods: 3, snapshots: 0, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z" },
    ] as ProfileSummary[],
    moves: [] as MoveRequest[],
    calls: [] as string[],
  };
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 4, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods", "profiles"] }),
    modList: async () => state.mods,
    modOrder: async () => ORDER,
    importQueue: async () => [],
    categories: async () => [],
    modRules: async () => [],
    onFileDrop: () => () => {},
    profileList: async () => state.profiles,
    profileSnapshots: async () => [],
    activateProfile: async (id) => {
      state.calls.push(`activate:${id}`);
    },
    createProfile: async (_i, name, from) => {
      state.calls.push(`create:${name}:${from}`);
      return "p3";
    },
    moveMods: async (_i, request) => {
      state.moves.push(request);
      return request.mode === "exact"
        ? {
            applied: false,
            hasNearest: true,
            nearestPriority: 2,
            violated: [{ id: "r1", kind: "wins", a: { id: "c", name: "Gamma" }, b: { id: "a", name: "Alpha" }, source: "user", disabled: false, orphan: false }],
          }
        : { applied: true, hasNearest: false, violated: [] };
    },
  };
  return { state, backend };
}

async function open(user: ReturnType<typeof userEvent.setup>, page: "Mods" | "Profiles") {
  await openScreen(user, page);
}

describe("mod order rows (presentation of ModOrder)", () => {
  const mods = [mod("a", "Alpha"), mod("b", "Beta"), mod("c", "Gamma"), mod("x", "Pending", { state: "imported" })];

  it("interleaves separators, hides collapsed blocks and appends mods outside the order", () => {
    expect(orderedRows(mods, ORDER).map((r) => r.id)).toEqual(["a", "\u0000sep:s1", "b", "c", "x"]);
    const collapsed: ModOrder = {
      ...ORDER,
      entries: ORDER.entries.map((e) => (e.separator ? { ...e, separator: { ...e.separator, collapsed: true } } : e)),
    };
    expect(orderedRows(mods, collapsed).map((r) => r.id)).toEqual(["a", "\u0000sep:s1", "x"]);
  });

  it("turns a drop into a move request, skipping rows outside the order", () => {
    const rows = orderedRows(mods, ORDER);
    expect(moveRequestFor({ ids: ["c", "x"], targetId: "\u0000sep:s1", position: "before" }, rows)).toEqual({
      entries: [{ mod: "c" }],
      anchor: { kind: "before", entry: { separator: "s1" } },
      mode: "exact",
    });
    expect(moveRequestFor({ ids: ["x"], targetId: "a", position: "after" }, rows)).toBeNull();
  });
});

describe("Mods screen: priority and order (F5)", () => {
  beforeEach(() => localStorage.clear());

  it("lists the mods in the priority of the active profile, without drag handles (board JogoMods)", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await open(user, "Mods");
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    // The board has no priority column, no separators and no drag: the
    // order changes through "Move to" and the detail of the mod.
    expect(screen.queryAllByRole("button", { name: "Drag to change priority" })).toHaveLength(0);
    const names = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const pos = (n: string) => names.findIndex((t) => t.includes(n));
    expect(pos("Alpha")).toBeLessThan(pos("Gamma"));
  });

  it("explains a refused move and applies the alternative chosen (DLG-11)", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await open(user, "Mods");
    const row = (await screen.findByText("Gamma")).closest('[role="row"]') as HTMLElement;
    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(await screen.findByRole("menuitem", { name: "Move to top" }));
    const dialog = await screen.findByRole("dialog", { name: "Move refused" });
    expect(within(dialog).getByText("Gamma wins Alpha")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Move to nearest valid position (#2)" }));
    await waitFor(() => expect(state.moves.map((m) => m.mode)).toEqual(["exact", "nearest"]));
    expect(state.moves[1]).toEqual({ entries: [{ mod: "c" }], anchor: { kind: "top", entry: {} }, mode: "nearest" });
  });
});

describe("Profiles (F5)", () => {
  beforeEach(() => localStorage.clear());

  it("switches the active profile from the top bar of the game (D120)", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Overview");
    await user.click(await screen.findByRole("button", { name: /^Profile .*, change$/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Survival" }));
    await waitFor(() => expect(state.calls).toContain("activate:p2"));
  });

  it("shows which profile is active, refuses deleting it with a reason and creates a profile", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await open(user, "Profiles");
    const list = await screen.findByRole("list", { name: "Profiles" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("Active")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Not deployed")).toBeInTheDocument();
    expect(within(cards[0]!).getByRole("button", { name: "In use" })).toBeDisabled();

    await user.click(within(cards[0]!).getByRole("button", { name: "More actions for Default" }));
    const del = await screen.findByRole("menuitem", { name: /^Delete…/ });
    expect(del).toBeDisabled();
    expect(within(del).getByText("The active profile cannot be deleted")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "New profile" }));
    const dialog = await screen.findByRole("dialog", { name: "New profile" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Hardcore");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(state.calls).toContain("create:Hardcore:"));
  });

  it("warns when the active profile is not the deployed one, without plugin numbers in a game without plugins (board JogoPerfis)", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    state.profiles = state.profiles.map((p) => ({ ...p, plugins: 4, deployed: p.id === "p2" }));
    render(<App backend={backend} />);
    await open(user, "Profiles");
    const list = await screen.findByRole("list", { name: "Profiles" });
    expect(within(within(list).getAllByRole("listitem")[1]!).getByText("Deployed")).toBeInTheDocument();
    expect(await screen.findByText("The active profile is Default, but the game folder still has Survival. Deploy so the game uses the active profile.")).toBeInTheDocument();
    expect(within(list).queryByText("active plugins")).not.toBeInTheDocument();
  });
});
