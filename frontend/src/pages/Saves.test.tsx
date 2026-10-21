import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, SaveEntry, SavesView } from "../bridge/types";
import { openScreen } from "../test/shell";

const save = (name: string, extra: Partial<SaveEntry> = {}): SaveEntry => ({
  name,
  size: 1000,
  modTime: "2026-10-20T21:02:00Z",
  companions: [],
  readable: true,
  kind: "manual",
  number: 142,
  character: "Ysolda",
  level: 34,
  location: "Bleak Falls",
  gameTime: "041.14.20",
  gameDay: 41,
  gameHour: 14,
  gameMinute: 20,
  race: "Nord",
  savedAt: "2026-10-20T21:02:00Z",
  plugins: ["Skyrim.esm", "Lanterns.esp"],
  hasScreenshot: false,
  missing: [],
  ...extra,
});

function world(local = true) {
  const calls: string[] = [];
  const view: SavesView = {
    profile: "p1",
    profileName: "Survival",
    local,
    folder: "C:/docs/Saves/p1",
    pluginsChecked: true,
    saves: [
      save("Save142.ess", {
        missing: [
          { name: "Lanterns.esp", present: false, mods: [{ id: "m1", name: "Lanterns", enabled: false }] },
          { name: "Gold.esp", present: false, mods: [] },
        ],
      }),
      save("Quicksave0.ess", { kind: "quick", number: 0 }),
    ],
    profiles: [
      { profile: "p1", name: "Survival", local, active: true },
      { profile: "p2", name: "Main", local: true, active: false },
    ],
  };
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 13, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({
      active: { id: "i1", name: "Skyrim", gameName: "Skyrim" },
      instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }],
      items: ["overview", "mods", "profiles", "saves"],
    }),
    saves: async () => view,
    setLocalSaves: async (p, on) => {
      calls.push(`local:${p}:${on}`);
    },
    enableSaveProviders: async (_i, name) => {
      calls.push(`providers:${name}`);
      return { mods: [{ id: "m1", name: "Lanterns", enabled: false }], plugins: ["Lanterns.esp"], absent: ["Gold.esp"] };
    },
    previewSaveTransfer: async () => ({ renamed: { "Save142.ess": "Save142 (2).ess" } }),
    transferSaves: async (_i, names, to, move) => {
      calls.push(`transfer:${names.join(",")}:${to}:${move}`);
      return { renamed: {} };
    },
    deleteSaves: async (_i, names) => {
      calls.push(`delete:${names.join(",")}`);
    },
  };
  return { backend, calls };
}

describe("Saves screen (D142, board JogoSaves)", () => {
  beforeEach(() => localStorage.clear());

  it("lists the saves, shows missing plugins and enables their providers", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Saves");
    expect(await screen.findByText("Own saves of Survival")).toBeInTheDocument();
    expect(screen.getByText("with missing plugins")).toBeInTheDocument();
    expect(screen.getByText("2 missing")).toBeInTheDocument();
    // The first save is open in the panel, with the plugins it misses.
    const panel = screen.getByRole("complementary", { name: "Save details" });
    expect(within(panel).getByText("Lanterns.esp")).toBeInTheDocument();
    expect(within(panel).getByText("no installed mod provides it")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Enable the mod that provides it" }));
    expect(calls).toContain("providers:Save142.ess");
    await user.click(screen.getByRole("switch", { name: "Own saves" }));
    expect(calls).toContain("local:p1:false");
  });

  it("copies to another profile without replacing and deletes after confirming", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Saves");
    await user.click(await screen.findByRole("checkbox", { name: /Select Ysolda, Save142.ess/ }));
    await user.click(screen.getAllByRole("button", { name: "Copy or move to…" })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/the copy becomes Save142 \(2\)\.ess/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Copy 1 save" }));
    expect(calls).toContain("transfer:Save142.ess:p2:false");

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    const confirm = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    expect(calls.some((c) => c.startsWith("delete:"))).toBe(false);
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(calls).toContain("delete:Save142.ess");
  });
});
