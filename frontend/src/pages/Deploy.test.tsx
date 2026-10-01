import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, DeployPlan, DeployStatus } from "../bridge/types";

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
  foreign: [],
  failures: [],
};

const SUMMARY = { create: 2, keep: 10, replace: 1, remove: 0, backupAndCreate: 1, restoreBackup: 0, mkdir: 1, removeDir: 0, extraBytes: 0, decisions: 2 };

const DECISION: DeployPlan = {
  instance: "i1",
  operation: "op1",
  kind: "deploy",
  summary: SUMMARY,
  changes: [{ location: { target: "data", path: "Alpha.esp" }, kind: "replaced", mod: "m1", modName: "Alpha" }],
  blocked: [],
  fallbacks: [{ key: "root|symlink|copy", target: "root", from: "symlink", to: "copy", count: 3, sample: [] }],
  changeCount: 1,
  blockedCount: 0,
  empty: false,
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
    resolveDeployDecision: async (_i, op, accept) => {
      calls.push(`resolve:${op}:${accept.join(",")}`);
      pending = null;
    },
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
    const dialog = await screen.findByRole("dialog", { name: "Deploy plan" });
    expect(within(dialog).getByText("data:Alpha.esp")).toBeInTheDocument();
    expect(within(dialog).getByText("Replaced")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole("combobox"), "accept");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(calls).toContain("resolve:op1:root|symlink|copy");
  });

  it("closing the decision cancels the deploy without writing", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({}, DECISION);
    render(<App backend={backend} />);
    const dialog = await screen.findByRole("dialog", { name: "Deploy plan" });
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
