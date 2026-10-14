import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, DeployStatus, MenuBadge, Workspace } from "../bridge/types";
import { openScreen, sidebar } from "../test/shell";

const STATUS: DeployStatus = {
  instance: "i1", kind: "in_sync", reason: "up_to_date", activeProfile: { id: "p1", name: "Default" }, method: "hardlink",
  entries: 3, externalChanges: 0, newFiles: 0, foreign: [], failures: [],
};

const SKYRIM: Workspace = {
  active: { id: "i1", name: "Skyrim", gameName: "Skyrim Special Edition", accent: "#7FA6D9" },
  instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim Special Edition", accent: "#7FA6D9" }],
  items: ["overview", "mods", "plugins", "load_order", "conflicts", "profiles", "diagnostics"],
  groups: [
    { id: "entry", items: ["overview"] },
    { id: "content", items: ["mods", "plugins", "load_order", "conflicts"] },
    { id: "setup", items: ["profiles"] },
    { id: "health", items: ["diagnostics"] },
  ],
};

/** Valheim and generic games: the backend leaves plugins and load order out. */
const NO_PLUGINS: Workspace = {
  active: { id: "i2", name: "Valheim", gameName: "Valheim" },
  instances: [{ id: "i2", name: "Valheim", gameName: "Valheim" }],
  items: ["overview", "mods", "conflicts", "profiles", "diagnostics"],
  groups: [
    { id: "entry", items: ["overview"] },
    { id: "content", items: ["mods", "conflicts"] },
    { id: "setup", items: ["profiles"] },
    { id: "health", items: ["diagnostics"] },
  ],
};

function world(workspace: Workspace, badges: MenuBadge[] = []): Backend {
  return {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 8, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: () => () => {},
    listAppSettings: async () => [],
    workspace: async () => workspace,
    menuBadges: async () => badges,
    deployStatus: async () => STATUS,
    pendingDeployDecision: async () => null,
  };
}

describe("shell in two levels (D120)", () => {
  beforeEach(() => localStorage.clear());

  it("starts at the app level and enters the game through Jump to", async () => {
    const user = userEvent.setup();
    render(<App backend={world(SKYRIM)} />);
    const jump = await within(sidebar()).findByRole("group", { name: "Jump to" });
    expect(within(sidebar()).getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar()).queryByRole("button", { name: "Mods" })).not.toBeInTheDocument();
    await user.click(within(jump).getByRole("button", { name: "Skyrim" }));
    expect(await within(sidebar()).findByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    // Game level: grouped menu, game selector, back to the Library.
    for (const group of ["Content", "Setup", "Health"]) expect(within(sidebar()).getByRole("group", { name: group })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Active game: Skyrim/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(within(sidebar()).queryByRole("group", { name: "Content" })).not.toBeInTheDocument();
  });

  it("paints the game level with the game's accent and leaves the app level alone (D122)", async () => {
    const user = userEvent.setup();
    const { container } = render(<App backend={world(SKYRIM)} />);
    await within(sidebar()).findByRole("group", { name: "Jump to" });
    expect(container.querySelector('[data-theme="game-i1"]')).toBeNull();
    await openScreen(user, "Overview");
    await waitFor(() => expect(container.querySelector('[data-theme="game-i1"]')).not.toBeNull());
  });

  it("a game without an accent keeps the app theme", async () => {
    const user = userEvent.setup();
    const { container } = render(<App backend={world(NO_PLUGINS)} />);
    await openScreen(user, "Overview");
    expect(container.querySelector('[data-theme^="game-"]')).toBeNull();
  });

  it("draws the backend's badges: attention on conflicts, plain count on diagnostics", async () => {
    const user = userEvent.setup();
    render(<App backend={world(SKYRIM, [{ item: "conflicts", count: 12, attention: true }, { item: "diagnostics", count: 2, attention: false }])} />);
    await openScreen(user, "Overview");
    const conflicts = await within(sidebar()).findByRole("button", { name: "Conflicts, 12 to decide" });
    expect(conflicts).toHaveAttribute("data-intent", "warning");
    const diagnostics = within(sidebar()).getByRole("button", { name: "Diagnostics, 2 problems" });
    expect(diagnostics).not.toHaveAttribute("data-intent");
  });

  it("a game without plugins has no Plugins or Load Order item, whatever the UI knows (D112)", async () => {
    const user = userEvent.setup();
    render(<App backend={world(NO_PLUGINS)} />);
    await openScreen(user, "Mods");
    expect(within(sidebar()).queryByRole("button", { name: "Plugins" })).not.toBeInTheDocument();
    expect(within(sidebar()).queryByRole("button", { name: "Load Order" })).not.toBeInTheDocument();
    expect(within(sidebar()).getByRole("button", { name: "Conflicts" })).toBeInTheDocument();
  });

  it("puts the deployment card at the foot of the game menu, not in the top bar", async () => {
    const user = userEvent.setup();
    render(<App backend={world(SKYRIM)} />);
    await within(sidebar()).findByRole("group", { name: "Jump to" });
    expect(screen.queryByRole("button", { name: /^Deploy status/ })).not.toBeInTheDocument();
    await openScreen(user, "Overview");
    // In sync there is nothing to show (board JogoVisaoGeral): the card appears only when something is pending.
    expect(screen.queryByRole("button", { name: /^Deploy status/ })).not.toBeInTheDocument();
  });
});
