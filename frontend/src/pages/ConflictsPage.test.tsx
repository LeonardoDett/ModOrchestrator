import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, ConflictFile, ConflictPair, ConflictPairs, PairDecision } from "../bridge/types";
import { buildFileTree } from "../features/conflicts/PairFiles";

const A = { id: "a", name: "Texture A", priority: 1, enabled: true };
const B = { id: "b", name: "Texture B", priority: 2, enabled: true };

const file = (path: string, winner: string, resolution: ConflictFile["resolution"] = "order"): ConflictFile => ({
  location: { target: "data", path },
  providers: [
    { ...A, size: 10 },
    { ...B, size: 12 },
  ],
  winner,
  resolution,
});

const PAIR: ConflictPair = {
  a: A,
  b: B,
  winner: "b",
  files: 2,
  winsA: 0,
  winsB: 2,
  redundant: 0,
  decision: "order",
  reviewed: false,
  needsReview: true,
  potential: false,
};

function world() {
  const calls: string[] = [];
  const decisions: PairDecision[][] = [];
  const pairs: ConflictPairs = {
    pairs: [PAIR],
    totals: { pairs: 1, unreviewed: 1, override: 0, redundant: 0, rule: 0, order: 1, mixed: 0 },
    stale: [],
    pendingHashes: 0,
  };
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 4, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods", "conflicts"] }),
    conflictPairs: async () => pairs,
    conflictPairDetail: async () => ({ pair: PAIR, files: [file("textures/armor.dds", "b"), file("textures/sky.dds", "b")], pendingHashes: 0 }),
    setFileOverrides: async (_i, winner, locations) => {
      calls.push(`override:${winner}:${locations.map((l) => l.path).join(",")}`);
    },
    markConflictsReviewed: async (_i, list) => {
      calls.push(`reviewed:${list.map((p) => `${p.a}|${p.b}`).join(",")}`);
    },
    previewPairDecisions: async () => ({ cycle: [], profiles: [{ profileId: "p1", name: "Default", moves: [{ id: "a", name: "Texture A", from: 1, to: 2, because: ["r"] }] }] }),
    decidePairs: async (_i, list) => {
      decisions.push(list);
    },
  };
  return { backend, calls, decisions };
}

async function openConflicts(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;
  await user.click(await within(nav).findByRole("button", { name: "Conflicts" }));
}

describe("Conflicts screen (F6)", () => {
  beforeEach(() => localStorage.clear());

  it("explains the winner and chooses another winner for a single file", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openConflicts(user);
    expect(await screen.findByText("Texture B wins Texture A in 2 of 2 files")).toBeInTheDocument();
    expect(screen.getByText("Decided by: priority (Texture B #2 > Texture A #1)")).toBeInTheDocument();
    const select = await screen.findByRole("combobox", { name: "Winner of data: textures/sky.dds" });
    await user.selectOptions(select, "a");
    expect(calls).toContain("override:a:textures/sky.dds");
    // No rule exists just because the mods conflict (D004).
    expect(calls.some((c) => c.startsWith("rule"))).toBe(false);
  });

  it("shows the order impact before creating a pair rule", async () => {
    const user = userEvent.setup();
    const { backend, decisions } = world();
    render(<App backend={backend} />);
    await openConflicts(user);
    await user.click(await screen.findByRole("button", { name: "Texture A wins Texture B (create rule)" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Texture A goes from #1 to #2")).toBeInTheDocument();
    expect(decisions).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Save and move" }));
    expect(decisions).toEqual([[{ mod: "a", opponent: "b", choice: "wins" }]]);
  });
});

describe("disputed file tree", () => {
  it("groups files by target and folder", () => {
    const tree = buildFileTree([file("textures/a.dds", "b"), file("textures/x/b.dds", "b"), file("c.esp", "a")]);
    expect(tree.map((n) => n.label)).toEqual(["data"]);
    expect(tree[0]!.children!.map((n) => n.label)).toEqual(["textures", "c.esp"]);
  });
});
