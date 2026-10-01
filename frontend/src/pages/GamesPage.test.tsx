import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, DiscoveredGame, ForeignFinding, GameSetup, ManagedGame, SetupVerification, Workspace, WorkspaceItemId } from "../bridge/types";

const SKYRIM: DiscoveredGame = { gameId: "skyrimse", gameName: "The Elder Scrolls V: Skyrim Special Edition", root: "C:\\Steam\\Skyrim", store: "steam", version: "1.6.1170.0", hidden: false };

const FULL: WorkspaceItemId[] = ["overview", "mods", "plugins", "load_order", "conflicts", "profiles", "diagnostics"];
const GENERIC: WorkspaceItemId[] = ["overview", "mods", "conflicts", "profiles", "diagnostics"];

const managed = (over: Partial<ManagedGame>): ManagedGame => ({
  id: "i1",
  gameId: "skyrimse",
  gameName: SKYRIM.gameName,
  custom: false,
  name: "Skyrim Main",
  adapter: "skyrimse",
  store: "steam",
  root: SKYRIM.root,
  staging: "C:\\ModOrchestrator\\Main\\staging",
  archiveStore: "C:\\ModOrchestrator\\Main\\archives",
  backupStore: "C:\\ModOrchestrator\\Main\\backups",
  method: "hardlink",
  version: "1.6.1170.0",
  active: true,
  hidden: false,
  unavailable: false,
  rootMissing: false,
  deployed: false,
  capabilities: ["plugins"],
  targets: [{ id: "data", path: "C:\\Steam\\Skyrim\\Data" }],
  modTypes: [{ id: "default", name: "Default", target: "data" }],
  foreign: [],
  ...over,
});

interface World {
  instances: ManagedGame[];
  discovered: DiscoveredGame[];
  items: WorkspaceItemId[];
  verification: Partial<SetupVerification>;
  calls: string[];
  setups: GameSetup[];
  unmanaged: { id: string; deleteFiles: boolean; confirmName: string }[];
}

function fakeWorld(over: Partial<World> = {}) {
  const world: World = { instances: [], discovered: [SKYRIM], items: FULL, verification: {}, calls: [], setups: [], unmanaged: [], ...over };
  const listeners = new Set<() => void>();
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 3, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    getOperationEvents: async () => [],
    onOperationEvent: (l) => {
      listeners.add(l as () => void);
      return () => listeners.delete(l as () => void);
    },
    listAppSettings: async () => [],
    gamesView: async () => ({
      managed: world.instances,
      discovered: world.discovered.filter((d) => !world.instances.some((i) => i.root === d.root)),
      supported: [],
      scanned: true,
      hiddenCount: 0,
    }),
    gameInstanceDetails: async (id) => world.instances.find((i) => i.id === id)!,
    workspace: async (): Promise<Workspace> => {
      const active = world.instances.find((i) => i.active);
      return {
        active: active && { id: active.id, name: active.name, gameName: active.gameName },
        instances: world.instances.map((i) => ({ id: i.id, name: i.name, gameName: i.gameName })),
        items: active ? world.items : [],
      };
    },
    validateGameRoot: async (_g, root) =>
      root.includes("Wrong")
        ? { root, problem: { code: "root_invalid", params: { reason: "marker_missing", marker: "SkyrimSE.exe" } } }
        : { root, version: "1.6.1170.0" },
    suggestGameFolders: async () => ({ staging: "C:\\ModOrchestrator\\Main\\staging", archiveStore: "C:\\ModOrchestrator\\Main\\archives", backupStore: "C:\\ModOrchestrator\\Main\\backups" }),
    verifyGameSetup: async (setup) => ({
      name: setup.name,
      root: setup.root,
      targets: [{ id: "data", path: `${setup.root}\\Data` }],
      staging: "C:\\ModOrchestrator\\Main\\staging",
      archiveStore: "C:\\ModOrchestrator\\Main\\archives",
      backupStore: "C:\\ModOrchestrator\\Main\\backups",
      methods: [
        { method: "hardlink", available: true },
        { method: "copy", available: true },
      ],
      foreign: [],
      problems: [],
      warnings: [],
      ...world.verification,
    }),
    manageGame: async (setup) => {
      world.calls.push("manage");
      world.setups.push(setup);
      world.instances = [
        managed({
          id: "new",
          name: setup.name,
          root: setup.root,
          custom: setup.gameId === "generic",
          gameName: setup.gameId === "generic" ? "Generic game" : SKYRIM.gameName,
          method: setup.method,
        }),
      ];
      return { instanceId: "new", operationId: "op" };
    },
    setActiveInstance: async (id) => {
      world.instances = world.instances.map((i) => ({ ...i, active: i.id === id }));
    },
    unmanageGame: async (id, options) => {
      world.unmanaged.push({ id, ...options });
      world.instances = world.instances.filter((i) => i.id !== id);
      return "op";
    },
    pickFolder: async () => "",
  };
  return { world, backend };
}

const sidebar = () => screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

async function openGames(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(sidebar()).getByRole("button", { name: "Games" }));
}

describe("Games screen and assistant (F3)", () => {
  beforeEach(() => localStorage.clear());

  it("lists a discovered game and manages it only after the assistant (nothing is managed by discovery)", async () => {
    const user = userEvent.setup();
    const { world, backend } = fakeWorld();
    render(<App backend={backend} />);
    await openGames(user);

    expect(await screen.findByText(SKYRIM.gameName)).toBeInTheDocument();
    expect(screen.getByText(/Discovered \(1\)/)).toBeInTheDocument();
    expect(world.calls).toEqual([]);
    // No workspace without a managed game (D023).
    expect(within(sidebar()).queryByRole("button", { name: "Mods" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manage" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/This folder is a valid installation./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(await within(dialog).findByText("C:\\ModOrchestrator\\Main\\staging")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    // Hardlink is preselected because it is available; nothing is managed yet.
    const hardlink = await within(dialog).findByRole("radio", { name: /Hardlink/ });
    expect(hardlink).toBeChecked();
    expect(world.calls).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Manage game" }));
    expect(await within(dialog).findByText(/is now managed/)).toBeInTheDocument();
    expect(world.setups[0]).toMatchObject({ gameId: "skyrimse", root: SKYRIM.root, method: "hardlink", store: "steam" });

    await user.click(within(dialog).getByRole("button", { name: "Open workspace" }));
    // The workspace appears from what the backend offers, with Plugins and Load Order.
    const nav = sidebar();
    expect(await within(nav).findByRole("button", { name: "Plugins" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Load Order" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
  });

  it("a generic game has no Plugins or Load Order screens (navigation by capability)", async () => {
    const user = userEvent.setup();
    const { backend } = fakeWorld({ items: GENERIC, instances: [managed({ custom: true, gameId: "generic", gameName: "Generic game", name: "Valheim", capabilities: [] })], discovered: [] });
    render(<App backend={backend} />);
    const nav = sidebar();
    expect(await within(nav).findByRole("button", { name: "Mods" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Plugins" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Load Order" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Conflicts" })).toBeInTheDocument();
    // Reserved areas never appear (anti-pattern 18).
    for (const reserved of ["Downloads", "Tools", "Collections", "Saves"]) {
      expect(within(nav).queryByRole("button", { name: reserved })).not.toBeInTheDocument();
    }
    await user.click(within(nav).getByRole("button", { name: "Conflicts" }));
    // Conflicts is a real screen since F6 (no placeholder).
    expect(screen.queryByText("Conflicts is not available yet")).not.toBeInTheDocument();
  });

  it("refuses a wrong folder with the reason and keeps Next disabled", async () => {
    const user = userEvent.setup();
    const { backend } = fakeWorld({ discovered: [] });
    // Supported (not found) games are listed by the backend; emulate one.
    backend.gamesView = async () => ({ managed: [], discovered: [], supported: [{ gameId: "skyrimse", gameName: SKYRIM.gameName, hidden: false }], scanned: true, hiddenCount: 0 });
    render(<App backend={backend} />);
    await openGames(user);
    await user.click(await screen.findByRole("button", { name: "Locate manually…" }));
    const dialog = await screen.findByRole("dialog");
    const folder = within(dialog).getByLabelText("Game folder");
    await user.type(folder, "D:\\Wrong folder");
    await user.tab();
    expect(await within(dialog).findByText("This folder does not look like the game: SkyrimSE.exe was not found in it.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("warns about another manager and does not preselect copy when hardlinks are unavailable", async () => {
    const user = userEvent.setup();
    const foreign: ForeignFinding[] = [{ kind: "vortex", target: "data", name: "vortex.deployment.json" }];
    const { backend } = fakeWorld({
      verification: {
        foreign,
        methods: [
          { method: "hardlink", available: false, reason: "different_volume" },
          { method: "copy", available: true },
        ],
        warnings: [{ code: "hardlink_unavailable", params: { reason: "different_volume" } }],
      },
    });
    render(<App backend={backend} />);
    await openGames(user);
    await user.click(await screen.findByRole("button", { name: "Manage" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.click(await within(dialog).findByRole("button", { name: "Next" }));

    expect(await within(dialog).findByText("Another manager deployed to this game")).toBeInTheDocument();
    expect(within(dialog).getByText("Vortex: vortex.deployment.json")).toBeInTheDocument();
    expect(within(dialog).getByText(/Hardlinks are unavailable/)).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Copy/ })).not.toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Hardlink/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Manage game" })).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: /Copy/ }));
    expect(within(dialog).getByRole("button", { name: "Manage game" })).toBeEnabled();
  });

  it("shows the blocking state of a foreign deployment on the game card", async () => {
    const { backend } = fakeWorld({
      discovered: [],
      instances: [managed({ foreign: [{ kind: "mo2", name: "ModOrganizer", target: "" }] })],
    });
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await openGames(user);
    expect(await screen.findByText("Other manager")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("stopping management keeps the files by default and deleting them needs the name typed", async () => {
    const user = userEvent.setup();
    const { world, backend } = fakeWorld({ discovered: [], instances: [managed({})] });
    render(<App backend={backend} />);
    await openGames(user);
    await user.click(await screen.findByRole("button", { name: "More actions for Skyrim Main" }));
    await user.click(await screen.findByRole("menuitem", { name: "Stop managing…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Keep staging and archives" })).toBeChecked();

    await user.click(within(dialog).getByRole("radio", { name: "Delete staging and archives" }));
    const submit = within(dialog).getByRole("button", { name: "Stop managing" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Type Skyrim Main to confirm"), "Skyrim Main");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(world.unmanaged).toEqual([{ id: "i1", deleteFiles: true, confirmName: "Skyrim Main" }]));
  });

  it("a deployed instance cannot be stopped from the dialog", async () => {
    const user = userEvent.setup();
    const { backend } = fakeWorld({ discovered: [], instances: [managed({ deployed: true })] });
    render(<App backend={backend} />);
    await openGames(user);
    await user.click(await screen.findByRole("button", { name: "More actions for Skyrim Main" }));
    await user.click(await screen.findByRole("menuitem", { name: "Stop managing…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Purge them first/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Stop managing" })).toBeDisabled();
  });
});
