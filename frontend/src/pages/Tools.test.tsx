import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { CodedError } from "../bridge/errors";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, OperationEvent, ToolEntry, ToolInput, ToolsView } from "../bridge/types";
import { openScreen } from "../test/shell";

const tool = (id: string, name: string, extra: Partial<ToolEntry> = {}): ToolEntry => ({
  id,
  name,
  known: "",
  exe: `{game}\\Tools\\${name}.exe`,
  args: "",
  workDir: "",
  env: [],
  icon: "",
  exclusive: false,
  deployBefore: false,
  position: 0,
  running: false,
  startedAt: "",
  resolvedExe: `C:\\Games\\${name}.exe`,
  problem: "",
  ...extra,
});

function world(opts: { missing?: boolean; sections?: string[] } = {}) {
  const calls: string[] = [];
  const listeners: ((e: OperationEvent) => void)[] = [];
  const view: ToolsView = {
    instance: "i1",
    blocker: "SSEEdit",
    tools: [
      tool("t1", "SSEEdit", { args: "-SSE", exclusive: true, running: true, startedAt: new Date(Date.now() - 12 * 60_000).toISOString() }),
      tool("t2", "Nemesis", { exclusive: true, deployBefore: true, position: 1 }),
      tool("t3", "DynDOLOD", { position: 2, problem: opts.missing ? "tool_executable_missing" : "" }),
    ],
    suggestions: [
      { id: "texgen", name: "TexGen", executables: ["TexGenx64.exe"], exclusive: true, deployBefore: true, found: "{game}\\TexGenx64.exe" },
      { id: "creation_kit", name: "Creation Kit", executables: ["CreationKit.exe"], exclusive: true, deployBefore: true, found: "" },
    ],
    variables: [
      { name: "game", value: "C:\\Games\\Skyrim" },
      { name: "staging", value: "D:\\MO\\mods" },
      { name: "target:data", value: "C:\\Games\\Skyrim\\Data" },
    ],
  };
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 14, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: (l) => {
      listeners.push(l);
      return () => {};
    },
    listAppSettings: async () => [],
    workspace: async () => ({
      active: { id: "i1", name: "Skyrim", gameName: "Skyrim Special Edition" },
      instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim Special Edition" }],
      items: ["overview", "mods", "profiles", "tools"],
      sections: opts.sections ?? ["topbar.tools"],
    }),
    tools: async () => view,
    toolIcon: async () => "",
    saveTool: async (_i, input: ToolInput) => {
      calls.push(`save:${input.id}:${input.name}:${input.args}`);
      if (input.args.includes("{nope}")) throw new CodedError({ code: "tool_invalid", params: { reason: "variable", detail: "{nope}" } });
      return "t9";
    },
    addKnownTool: async (_i, known, exe) => {
      calls.push(`known:${known}:${exe}`);
      return "t8";
    },
    deleteTool: async (_i, id) => {
      calls.push(`delete:${id}`);
    },
    moveTool: async (_i, id, pos) => {
      calls.push(`move:${id}:${pos}`);
    },
    runTool: async (_i, id) => {
      calls.push(`run:${id}`);
      if (id === "t3") throw new CodedError({ code: "tool_executable_missing", params: { tool: "t3", path: "D:\\Modding\\DynDOLOD\\DynDOLODx64.exe" } });
      return "op1";
    },
    pickToolExecutable: async () => "D:\\New\\DynDOLODx64.exe",
  };
  const emit = (e: OperationEvent) => listeners.forEach((l) => l(e));
  return { backend, calls, emit };
}

describe("Tools screen (D146, board JogoFerramentas)", () => {
  beforeEach(() => localStorage.clear());

  it("lists the tools without a status column, opens the panel and starts a tool", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({ missing: true });
    render(<App backend={backend} />);
    await openScreen(user, "Tools");
    const list = await screen.findByRole("list", { name: "Tools, drag to change the order" });
    // Tools are optional: no "ready" or "not found" label in the list.
    expect(within(list).queryByText(/not found|ready/i)).not.toBeInTheDocument();
    expect(within(list).getByText("running")).toBeInTheDocument();
    expect(within(list).getAllByText("Exclusive")).toHaveLength(2);
    expect(within(list).getByText("Deploys first")).toBeInTheDocument();
    // The running tool is "Open"; the exclusive one blocks the others.
    expect(within(list).getByRole("button", { name: "Open" })).toBeDisabled();
    const panel = screen.getByRole("complementary", { name: "Tool details" });
    expect(within(panel).getByText("SSEEdit")).toBeInTheDocument();
    expect(within(panel).getByText(/Running for/)).toBeInTheDocument();
    expect(within(panel).getByText("-SSE")).toBeInTheDocument();
    // Suggestions: found ones are added, the others located.
    expect(screen.getByText("Known tools of Skyrim Special Edition")).toBeInTheDocument();
    expect(screen.getByText("In the game folder")).toBeInTheDocument();
    expect(screen.getByText("Optional. Point to where it is installed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(calls).toContain("known:texgen:");
    await user.click(screen.getAllByRole("button", { name: "Locate…" })[0]!);
    expect(calls).toContain("known:creation_kit:D:\\New\\DynDOLODx64.exe");
  });

  it("shows a missing executable only when the tool is started, with Locate", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world({ missing: true });
    backend.tools = async () => ({ ...(await world({ missing: true }).backend.tools("i1")), blocker: "", tools: [tool("t3", "DynDOLOD")] });
    render(<App backend={backend} />);
    await openScreen(user, "Tools");
    const list = await screen.findByRole("list", { name: "Tools, drag to change the order" });
    expect(screen.queryByText(/was not found/)).not.toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Start" }));
    expect(calls).toContain("run:t3");
    expect(await screen.findByText("The executable of DynDOLOD was not found")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Locate…" })[0]!);
    expect(calls.some((c) => c.startsWith("save:t3:DynDOLOD"))).toBe(true);
  });

  it("edits a tool, inserts a variable and shows the backend's error under the field", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Tools");
    await user.click(await screen.findByRole("button", { name: "Add tool" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Gen");
    await user.click(within(dialog).getByRole("button", { name: "Insert variable" }));
    await user.click(await screen.findByRole("menuitem", { name: /\{target:data\}/ }));
    expect(within(dialog).getByLabelText("Arguments")).toHaveValue("{target:data}");
    await user.type(within(dialog).getByLabelText("Arguments"), " {{nope}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("The variable {nope} does not exist in this game.")).toBeInTheDocument();
    expect(calls).toContain("save::Gen:{target:data} {nope}");
  });

  it("reorders from the row menu and removes after confirming", async () => {
    const user = userEvent.setup();
    const { backend, calls } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Tools");
    await user.click(await screen.findByRole("button", { name: "Actions of Nemesis" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
    expect(calls).toContain("move:t2:0");
    await user.click(screen.getByRole("button", { name: "Actions of Nemesis" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    expect(calls).not.toContain("delete:t2");
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));
    expect(calls).toContain("delete:t2");
  });

  it("the top bar menu lists the tools with the reason the others cannot start", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Tools");
    await user.click(await screen.findByRole("button", { name: "Tools, one is running" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByText("Blocked while SSEEdit is open")).toHaveLength(2);
    expect(within(menu).getByRole("menuitem", { name: "Manage tools…" })).toBeInTheDocument();
  });

  it("has no top bar menu without the tools section", async () => {
    const user = userEvent.setup();
    const { backend } = world({ sections: [] });
    render(<App backend={backend} />);
    await openScreen(user, "Tools");
    await screen.findByRole("list", { name: "Tools, drag to change the order" });
    expect(screen.queryByRole("button", { name: "Tools, one is running" })).not.toBeInTheDocument();
  });

  it("offers the capture when a tool ends with new files, a toast otherwise", async () => {
    const user = userEvent.setup();
    const { backend, emit } = world();
    render(<App backend={backend} />);
    await openScreen(user, "Tools");
    await screen.findByRole("list", { name: "Tools, drag to change the order" });
    act(() =>
      emit({
        id: "e1",
        sequence: 1,
        type: "tool.exited",
        occurredAt: "2026-10-21T21:19:00Z",
        data: { instance: "i1", tool: "t2", name: "Nemesis", started: "2026-10-21T21:14:00Z", scanned: "true", newFiles: "214", changes: "3" },
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nemesis finished" });
    expect(within(dialog).getByText(/It generated 214 new files and changed 3 deployed files/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    act(() => emit({ id: "e2", sequence: 2, type: "tool.exited", occurredAt: "2026-10-21T21:20:00Z", data: { instance: "i1", tool: "t3", name: "BodySlide", scanned: "true", newFiles: "0", changes: "0" } }));
    expect((await screen.findAllByText("BodySlide finished")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
