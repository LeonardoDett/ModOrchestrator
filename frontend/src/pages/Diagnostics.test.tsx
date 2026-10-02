import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { AppNotification, Backend, Diagnostic, HistoryEntry, Problems } from "../bridge/types";
import { PLACES } from "../features/diagnostics/use-diagnostic-action";

const requirement: Diagnostic = {
  key: "mod_requirement_missing#1",
  code: "mod_requirement_missing",
  severity: "error",
  blocking: false,
  blocks: [],
  module: "rules",
  instance: "i1",
  params: { mod: "Patch", target: "Base", status: "disabled" },
  evidence: [{ kind: "requirement", params: { target: "Base", status: "disabled" } }],
  actions: [
    { id: "mods.enable", target: { kind: "mod", id: "m2" }, params: { mod: "Base" } },
    { id: "rules.remove", target: { kind: "rule", id: "r1" } },
  ],
  related: [],
  new: true,
  suppressed: false,
};

const incompatible: Diagnostic = {
  ...requirement,
  key: "mods_incompatible#1",
  code: "mods_incompatible",
  blocking: true,
  blocks: ["deploy"],
  params: { a: "Alpha", b: "Beta" },
  actions: [{ id: "mods.disable", target: { kind: "mod", id: "a" }, params: { mod: "Alpha" } }],
  new: false,
};

const orphan: Diagnostic = {
  ...requirement,
  key: "rule_orphan#1",
  code: "rule_orphan",
  severity: "warning",
  params: { missing: "Old" },
  actions: [{ id: "rules.remove", target: { kind: "rule", id: "r9" } }],
  new: false,
};

function world() {
  const calls: string[] = [];
  let items = [incompatible, requirement, orphan];
  let suppressed: Diagnostic[] = [];
  const notes: AppNotification[] = [
    { id: "n1", kind: "diagnostic", code: "rule_orphan", params: { missing: "Old", key: orphan.key }, severity: "warning", count: 2, state: "unread", createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", instance: "i1" },
    { id: "n2", kind: "operation_result", code: "operation_failed", params: { kind: "deploy", error: "mods_incompatible", "error.a": "Alpha", "error.b": "Beta" }, severity: "error", count: 1, state: "read", createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", instance: "i1" },
  ];
  const history: HistoryEntry[] = [
    { id: "e2", sequence: 2, type: "mod.enabled", at: "2026-10-02T10:00:00Z", origin: "user", subject: { kind: "mod", id: "m2" }, params: { name: "Base", profile: "p1" }, items: 1, reversible: true },
    { id: "e1", sequence: 1, type: "order.changed", at: "2026-10-02T09:00:00Z", origin: "auto", subject: { kind: "profile", id: "p1" }, params: { moved: "12" }, items: 12, reversible: true },
  ];
  const problems = (): Problems => ({
    instance: "i1",
    items,
    suppressed,
    counts: { blocking: items.filter((d) => d.blocking).length, errors: items.filter((d) => !d.blocking && d.severity === "error").length, warnings: 1, infos: 0 },
    partial: false,
  });
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 7, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods", "diagnostics"] }),
    profileList: async () => [{ id: "p1", name: "Default", notes: "", active: true, enabled: 2, mods: 3 } as never],
    deployStatus: async () => ({ instance: "i1", kind: "blocked", reason: "mods_incompatible", activeProfile: { id: "p1", name: "Default" }, method: "hardlink", entries: 0, externalChanges: 0, newFiles: 0, foreign: [], failures: [] }),
    pendingDeployDecision: async () => null,
    diagnostics: async () => problems(),
    attentionDiagnostics: async () => [{ ...problems(), name: "Skyrim" }],
    markDiagnosticsVisited: async () => {
      calls.push("visited");
    },
    executeDiagnosticAction: async (_i, key, id, index) => {
      calls.push(`execute:${key}:${id}:${index}`);
      items = items.filter((d) => d.key !== key);
      return { operations: [] };
    },
    suppressDiagnostic: async (_i, key, whole) => {
      calls.push(`suppress:${key}:${whole}`);
      suppressed = items.filter((d) => d.key === key).map((d) => ({ ...d, suppressed: true }));
      items = items.filter((d) => d.key !== key);
    },
    unsuppressDiagnostic: async (key, code) => {
      calls.push(`unsuppress:${key}:${code}`);
    },
    notifications: async () => notes,
    markNotificationsRead: async (ids) => {
      calls.push(`read:${ids.join(",")}`);
    },
    dismissNotifications: async () => {},
    history: async (filter) => {
      calls.push(`history:${filter.mod}:${filter.types.join(",")}`);
      return history;
    },
    revertHistoryEntry: async (id) => {
      calls.push(`revert:${id}`);
    },
    modList: async () => [],
  };
  return { backend, calls };
}

async function openProblems(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "2 problems need attention" }));
  return screen.findByRole("grid", { name: "Problems" });
}

describe("Diagnostics (F9)", () => {
  beforeEach(() => localStorage.clear());

  it("counts blocking + errors in the top bar and lists problems by severity with evidence and actions", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    const grid = await openProblems(user);
    expect(within(grid).getByText("Blocking")).toBeInTheDocument();
    expect(within(grid).getByText("Alpha and Beta are incompatible and both enabled")).toBeInTheDocument();
    expect(within(grid).getByText("Patch requires Base, which is disabled")).toBeInTheDocument();
    expect(within(grid).getByText("New")).toBeInTheDocument();
    await user.click(within(grid).getByText("Patch requires Base, which is disabled"));
    expect(await screen.findByText("Required mod: Base (disabled)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable Base" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ignore this" })).toBeInTheDocument();
  });

  it("executes an action and the solved problem leaves the list", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    const grid = await openProblems(user);
    await user.click(within(grid).getByText("Patch requires Base, which is disabled"));
    await user.click(await screen.findByRole("button", { name: "Enable Base" }));
    expect(calls).toContain("execute:mod_requirement_missing#1:mods.enable:0");
    await vi.waitFor(() => expect(within(grid).queryByText("Patch requires Base, which is disabled")).not.toBeInTheDocument());
  });

  it("never offers suppression for a blocking problem; suppressed ones can be reactivated", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    const grid = await openProblems(user);
    await user.click(within(grid).getByText("Alpha and Beta are incompatible and both enabled"));
    expect(await screen.findByText("Blocking problems cannot be ignored.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ignore this" })).not.toBeInTheDocument();
    await user.click(within(grid).getByText("A rule refers to a removed mod (Old)"));
    await user.click(await screen.findByRole("button", { name: "Ignore this" }));
    expect(calls).toContain("suppress:rule_orphan#1:false");
    await user.click(await screen.findByRole("button", { name: "Suppressed (1)" }));
    await user.click(screen.getByRole("button", { name: "Reactivate" }));
    expect(calls).toContain("unsuppress:rule_orphan#1:");
  });

  it("shows the bell with unread notifications and opens the problem", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Notifications: 1 unread notification" }));
    const list = await screen.findByRole("list", { name: "Notifications" });
    expect(within(list).getByText("A rule refers to a removed mod (Old)")).toBeInTheDocument();
    expect(within(list).getByText("and 1 more like it")).toBeInTheDocument();
    expect(within(list).getByText("Deploy failed")).toBeInTheDocument();
    expect(within(list).getByText("Alpha and Beta are incompatible; disable one of them or the rule before deploying.")).toBeInTheDocument();
    await user.click(within(list).getAllByRole("button", { name: "Open" })[0]!);
    expect(calls).toContain("read:n1");
    expect(await screen.findByRole("grid", { name: "Problems" })).toBeInTheDocument();
  });

  it("reverts from the history, confirming above 10 items", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openProblems(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    const grid = await screen.findByRole("grid", { name: "History" });
    expect(within(grid).getByText("Enabled Base")).toBeInTheDocument();
    const reverts = within(grid).getAllByRole("button", { name: "Revert" });
    await user.click(reverts[0]!);
    expect(calls).toContain("revert:e2");
    await user.click(reverts[1]!);
    const dialog = await screen.findByRole("dialog", { name: "Revert 12 items?" });
    await user.click(within(dialog).getByRole("button", { name: "Revert" }));
    expect(calls).toContain("revert:e1");
  });

  it("the Dashboard lists what needs attention with the main action", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Disable Alpha" }));
    expect(calls).toContain("execute:mods_incompatible#1:mods.disable:0");
  });

  it("every navigation target of the backend has a place in the UI (INV-OPS-06)", () => {
    const internal = join(import.meta.dirname, "..", "..", "..", "internal");
    const sources = [
      join(internal, "core", "application", "diagnostics", "checks.go"),
      join(internal, "core", "domain", "health", "rules.go"),
      join(internal, "core", "application", "conflicts", "diagnostics.go"),
      join(internal, "core", "domain", "health", "plugins.go"),
    ]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const targets = [...sources.matchAll(/Navigate\w*\s*=\s*"([\w.]+)"/g)].map((m) => m[1]!);
    expect(targets.length).toBeGreaterThan(5);
    for (const target of targets) expect(Object.keys(PLACES), target).toContain(target);
  });
});
