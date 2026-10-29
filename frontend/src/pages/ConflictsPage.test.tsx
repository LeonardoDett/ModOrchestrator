import { render, screen, within } from "@testing-library/react";
import { openScreen } from "../test/shell";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, ConflictFile, ConflictOpponent, ConflictPair, ConflictPairs, PairDecision } from "../bridge/types";
import { buildFileTree } from "../features/conflicts/PairFiles";
import { chooseOption } from "../test/select";

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

function world(opponent: Partial<ConflictOpponent> = {}) {
  const calls: string[] = [];
  const decisions: PairDecision[][] = [];
  const pairs: ConflictPairs = {
    pairs: [PAIR],
    totals: { pairs: 1, unreviewed: 1, override: 0, redundant: 0, rule: 0, order: 1, mixed: 0 },
    stale: [],
    pendingHashes: 0,
  };
  const opponentOf = (mod: string): ConflictOpponent => ({
    opponent: mod === "a" ? B : A,
    files: 2,
    wins: mod === "a" ? 0 : 2,
    loses: mod === "a" ? 2 : 0,
    redundant: 0,
    decision: "order",
    reviewed: false,
    needsReview: true,
    ...opponent,
  });
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 4, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods", "conflicts"] }),
    conflictPairs: async () => pairs,
    modConflicts: async (_i, mod) => ({ mod: mod === "a" ? A : B, indicator: "loses_all", opponents: [opponentOf(mod)] }),
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
  await openScreen(user, "Conflicts");
}

describe("Conflicts screen (F6, RD11)", () => {
  beforeEach(() => localStorage.clear());

  it("lists the mods with conflicts and chooses another winner for a single file", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openConflicts(user);
    const mods = await screen.findByRole("complementary", { name: "Mods with conflicts" });
    expect(within(mods).getByText("Texture A")).toBeInTheDocument();
    expect(within(mods).getAllByText("against 1 mod").length).toBe(2);
    const section = await screen.findByRole("region", { name: "Conflicts of Texture A" });
    expect(await within(section).findByText("to decide")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "2 files" }));
    const dialog = await screen.findByRole("dialog");
    const select = await within(dialog).findByRole("combobox", { name: "Winner of data: textures/sky.dds" });
    await chooseOption(user, select, /Texture A/);
    expect(calls).toContain("override:a:textures/sky.dds");
    // No rule exists just because the mods conflict (D004).
    expect(calls.some((c) => c.startsWith("rule"))).toBe(false);
  });

  it("says the mod also disputes files inside archives, which is not chosen here (D147, board JogoConflitosArchives)", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    backend.modArchiveConflicts = async (_i, id) => ({
      supported: true,
      archives: [],
      unread: [],
      opponents:
        id === "a"
          ? [{ own: { mod: A, archive: "" }, opponent: { mod: B, archive: "B.bsa" }, wins: true, reason: "loose", files: 7 }]
          : [],
      filesWon: 7,
      filesLost: 0,
    });
    render(<App backend={backend} />);
    await openConflicts(user);
    const section = await screen.findByRole("region", { name: "Conflicts of Texture A" });
    const strip = await within(section).findByRole("note", { name: "Inside archives" });
    expect(within(strip).getByText("Also disputes 7 files inside archives, with 1 mod")).toBeInTheDocument();
    expect(within(strip).getByText(/This is not chosen here/)).toBeInTheDocument();
    await user.click(within(strip).getByRole("button", { name: "See in the mod details" }));
    expect(screen.queryByRole("region", { name: "Conflicts of Texture A" })).not.toBeInTheDocument();
  });

  it("stages a winner and saves it after showing what moves in the order", async () => {
    const user = userEvent.setup();
    const { backend, decisions } = world();
    render(<App backend={backend} />);
    await openConflicts(user);
    const section = await screen.findByRole("region", { name: "Conflicts of Texture A" });
    const group = await within(section).findByRole("radiogroup", { name: "Who wins between Texture A and Texture B" });
    await user.click(within(group).getByRole("radio", { name: /Texture A/ }));
    const bar = await screen.findByRole("region", { name: "Unsaved changes" });
    expect(await within(bar).findByText("1 unsaved change. Saving moves 1 mod in the order.")).toBeInTheDocument();
    expect(decisions).toHaveLength(0);
    await user.click(within(bar).getByRole("button", { name: "Save" }));
    expect(decisions).toEqual([[{ mod: "a", opponent: "b", choice: "wins" }]]);
  });

  it("marks the suggested winner with its reason and uses the suggestions everywhere (D126)", async () => {
    const user = userEvent.setup();
    const { backend } = world({ suggestion: { winner: "a", reason: "requires", rule: "d1" } });
    backend.conflictPairs = async () => ({
      pairs: [{ ...PAIR, suggestion: { winner: "a", reason: "requires", rule: "d1" } }],
      totals: { pairs: 1, unreviewed: 1, override: 0, redundant: 0, rule: 0, order: 1, mixed: 0 },
      stale: [],
      pendingHashes: 0,
    });
    render(<App backend={backend} />);
    await openConflicts(user);
    const section = await screen.findByRole("region", { name: "Conflicts of Texture A" });
    expect(await within(section).findByText("Suggested")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the suggestions everywhere" }));
    expect(await screen.findByRole("region", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(within(section).getByText("not saved")).toBeInTheDocument();
  });

  it("shows a pair decided through other mods as locked, without a suggestion when there is no fact", async () => {
    const user = userEvent.setup();
    const { backend } = world({
      needsReview: false,
      lock: { winner: "b", rules: [{ id: "r1", winner: { id: "m", name: "Middle" }, loser: { id: "a", name: "Texture A" }, source: "user" }] },
    });
    render(<App backend={backend} />);
    await openConflicts(user);
    const section = await screen.findByRole("region", { name: "Conflicts of Texture A" });
    expect(await within(section).findByText(/decided by rules through other mods \(Middle wins Texture A\); change it there/)).toBeInTheDocument();
    expect(within(section).getByRole("radio", { name: /Texture A/ })).toBeDisabled();
    expect(within(section).queryByText("Suggested")).not.toBeInTheDocument();
  });
});

describe("disputed file tree", () => {
  it("groups files by target and folder", () => {
    const tree = buildFileTree([file("textures/a.dds", "b"), file("textures/x/b.dds", "b"), file("c.esp", "a")]);
    expect(tree.map((n) => n.label)).toEqual(["data"]);
    expect(tree[0]!.children!.map((n) => n.label)).toEqual(["textures", "c.esp"]);
  });
});
