import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, DeployChange, DeployPlan, DeployStatus, ExternalChanges } from "../bridge/types";

const STATUS: DeployStatus = {
  instance: "i1",
  kind: "pending",
  reason: "desired_changed",
  activeProfile: { id: "p1", name: "Default" },
  appliedProfile: { id: "p1", name: "Default" },
  appliedAt: "2026-10-01T10:00:00Z",
  method: "hardlink",
  entries: 12,
  externalChanges: 0,
  newFiles: 0,
  foreign: [],
  failures: [],
};

const SUMMARY = { create: 2, keep: 10, replace: 1, remove: 0, backupAndCreate: 1, restoreBackup: 0, mkdir: 1, removeDir: 0, extraBytes: 0, decisions: 2 };

const DECISION: DeployPlan = {
  instance: "i1",
  operation: "op1",
  kind: "deploy",
  summary: SUMMARY,
  changes: [
    {
      location: { target: "data", path: "Alpha.esp" },
      kind: "replaced",
      mod: "m1",
      modName: "Alpha",
      method: "hardlink",
      wanted: true,
      actions: ["revert", "save_to_mod", "ignore_now"],
      suggested: "revert",
      before: { size: 10, modTime: "2026-10-01T10:00:00Z" },
      after: { size: 12, modTime: "2026-10-01T11:00:00Z" },
    },
  ],
  blocked: [],
  fallbacks: [{ key: "root|symlink|copy", target: "root", from: "symlink", to: "copy", count: 3, sample: [] }],
  changeCount: 1,
  blockedCount: 0,
  newFileCount: 0,
  empty: false,
};

const generated = (path: string, hint = false): DeployChange => ({
  location: { target: "data", path },
  kind: "unexpected",
  wanted: false,
  actions: hint ? ["leave_unmanaged", "capture", "ignore_now"] : ["capture", "leave_unmanaged", "ignore_now"],
  suggested: hint ? "leave_unmanaged" : undefined,
  after: { size: 5, modTime: "2026-10-01T12:00:00Z" },
});

const REVIEW: ExternalChanges = {
  instance: "i1",
  changes: [generated("meshes/actors/character/behaviors/a.hkx"), generated("meshes/actors/character/behaviors/b.hkx"), generated("Nemesis.log", true)],
  changeCount: 0,
  newFileCount: 3,
};

function world(status: Partial<DeployStatus> = {}, decision: DeployPlan | null = null) {
  const calls: string[] = [];
  let pending = decision;
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 5, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods"] }),
    profileList: async () => [],
    deployStatus: async () => ({ ...STATUS, ...status, pendingDecision: pending?.operation }),
    pendingDeployDecision: async () => pending,
    previewDeploy: async () => ({ ...DECISION, operation: undefined, changes: [], fallbacks: [], changeCount: 0 }),
    deploy: async (i) => {
      calls.push(`deploy:${i}`);
      return "op2";
    },
    reconcileDeploy: async (i) => {
      calls.push(`reconcile:${i}`);
      return "op3";
    },
    resolveDeployDecision: async (_i, op, accept, decisions) => {
      calls.push(`resolve:${op}:${accept.join(",")}`);
      calls.push(`decisions:${JSON.stringify(decisions)}`);
      pending = null;
    },
    verifyDeployment: async () => REVIEW,
    resolveExternalChanges: async (_i, decisions) => {
      calls.push(`review:${JSON.stringify(decisions)}`);
      return "op4";
    },
    scanExternalChanges: async (i) => {
      calls.push(`scan:${i}`);
    },
    modList: async () => [],
    cancelDeployDecision: async (_i, op) => {
      calls.push(`cancel:${op}`);
      pending = null;
    },
  };
  return { backend, calls };
}

describe("Deploy (F7)", () => {
  beforeEach(() => localStorage.clear());

  it("shows the status in the top bar and deploys from its popover", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    const status = await screen.findByRole("button", { name: "Deploy status: Deploy pending" });
    await user.click(status);
    expect(await screen.findByText("Mods, order or file choices changed since the last deploy.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deploy" }));
    expect(calls).toContain("deploy:i1");
  });

  it("Ctrl+D deploys the active game", async () => {
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await screen.findByRole("button", { name: "Deploy status: Deploy pending" });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    await vi.waitFor(() => expect(calls).toContain("deploy:i1"));
  });

  it("opens the plan when a deploy waits for a decision and applies it", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({}, DECISION);
    render(<App backend={backend} />);
    // DLG-15 opens over the plan: external changes are what it waits for.
    const changes = await screen.findByRole("dialog", { name: "External changes" });
    expect(within(changes).getByText("data:Alpha.esp")).toBeInTheDocument();
    expect(within(changes).getByRole("combobox", { name: "Action for data:Alpha.esp" })).toHaveValue("revert");
    await user.click(within(changes).getByRole("button", { name: "Apply decisions" }));
    // The plan still has a method fallback to decide.
    const plan = await screen.findByRole("dialog", { name: "Deploy plan" });
    expect(within(plan).getByText("1 decision chosen.")).toBeInTheDocument();
    await user.selectOptions(within(plan).getByRole("combobox"), "accept");
    await user.click(within(plan).getByRole("button", { name: "Apply" }));
    expect(calls).toContain("resolve:op1:root|symlink|copy");
    expect(calls).toContain(`decisions:${JSON.stringify([{ location: { target: "data", path: "Alpha.esp" }, action: "revert" }])}`);
  });

  it("closing the decision cancels the deploy without writing", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({}, DECISION);
    render(<App backend={backend} />);
    const dialog = await screen.findByRole("dialog", { name: "External changes" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel operation" }));
    expect(calls).toContain("cancel:op1");
    expect(calls.some((c) => c.startsWith("resolve"))).toBe(false);
  });

  it("an interrupted deploy is reconciled from the status popover", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({ kind: "unknown", reason: "journal_pending" });
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Deploy status: Check" }));
    expect(screen.queryByRole("button", { name: "Deploy" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Reconcile now" }));
    expect(calls).toContain("reconcile:i1");
  });
});

describe("External changes (F8, DLG-15)", () => {
  beforeEach(() => localStorage.clear());

  it("reviews generated files outside a deploy: nothing pre-selected, apply to all, capture destination", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({ kind: "in_sync", reason: "up_to_date", newFiles: 3 });
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Deploy status: In sync" }));
    await user.click(await screen.findByRole("button", { name: "Review changes" }));
    const dialog = await screen.findByRole("dialog", { name: "External changes" });
    const hkx = within(dialog).getByRole("combobox", { name: "Action for data:meshes/actors/character/behaviors/a.hkx" });
    expect(hkx).toHaveValue("");
    expect(within(dialog).getByRole("combobox", { name: "Action for data:Nemesis.log" })).toHaveValue("leave_unmanaged");
    expect(within(dialog).getByText("2 rows without a decision stay as they are.")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Apply to all: New" }), "capture");
    // Capturing asks where to; the suggested new mod is prefilled.
    expect(within(dialog).getByRole("heading", { name: "Capture destination" })).toBeInTheDocument();
    const name = within(dialog).getByRole("textbox", { name: "Name of the new mod" });
    await user.clear(name);
    await user.type(name, "Nemesis output");
    await user.click(within(dialog).getByRole("button", { name: "Apply decisions" }));
    const sent = calls.find((c) => c.startsWith("review:"));
    expect(sent).toBeDefined();
    const decisions = JSON.parse(sent!.slice("review:".length)) as { action: string; captureName?: string; location: { path: string } }[];
    expect(decisions).toHaveLength(3);
    expect(decisions.filter((d) => d.action === "capture").map((d) => d.captureName)).toEqual(["Nemesis output", "Nemesis output", "Nemesis output"]);
  });

  it("asks the backend for a limited scan when the window gets the focus", async () => {
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await screen.findByRole("button", { name: "Deploy status: Deploy pending" });
    fireEvent.focus(window);
    await vi.waitFor(() => expect(calls).toContain("scan:i1"));
  });
});
