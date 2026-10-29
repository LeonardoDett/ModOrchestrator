import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { App } from "../../app/App";
import { createOfflineBackend } from "../../bridge/offline-backend";
import type { Backend, DiscoveredGame, GameSetup, SetupVerification } from "../../bridge/types";

const GAME: DiscoveredGame = {
  gameId: "generic",
  gameName: "Generic game",
  root: "C:\\Games\\Example",
  store: "manual",
  hidden: false,
};

function fakeWorld(warnings: SetupVerification["warnings"] = []) {
  const folders = {
    staging: "C:\\old\\staging",
    archiveStore: "C:\\old\\archives",
    backupStore: "C:\\ModOrchestrator\\backups",
  };
  const manageGame = vi.fn(async (_setup: GameSetup) => ({ instanceId: "new", operationId: "op" }));
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 3, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    getOperationEvents: async () => [],
    onOperationEvent: () => () => undefined,
    listAppSettings: async () => [],
    gamesView: async () => ({ managed: [], discovered: [GAME], supported: [], scanned: true, hiddenCount: 0 }),
    libraryGames: async () => [],
    gamesSupport: async () => [],
    gameEntries: async () => [],
    workspace: async () => ({ instances: [], items: [] }),
    validateGameRoot: async (_game, root) => ({ root }),
    suggestGameFolders: async () => folders,
    verifyGameSetup: async (setup) => ({
      name: setup.name,
      root: setup.root,
      targets: [{ id: "data", path: setup.root }],
      ...folders,
      methods: [
        { method: "hardlink", available: true },
        { method: "copy", available: true },
      ],
      foreign: [],
      problems: [],
      warnings,
    }),
    manageGame,
    importSources: async () => [],
  };
  return { backend, manageGame };
}

async function openVerification(user: ReturnType<typeof userEvent.setup>, backend: Backend) {
  render(<App backend={backend} />);
  const navigation = screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;
  await user.click(within(navigation).getByRole("button", { name: "Library" }));
  await user.click(await screen.findByRole("button", { name: "Manage" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Next" }));
  await user.click(await within(dialog).findByRole("button", { name: "Next" }));
  expect(await within(dialog).findByRole("radio", { name: /Hardlink/ })).toBeChecked();
  return within(dialog);
}

describe("ManageGameWizard folder adoption (D145)", () => {
  beforeEach(() => localStorage.clear());

  it("requires consent for orphan folders and sends it when managing the game", async () => {
    const user = userEvent.setup();
    const { backend, manageGame } = fakeWorld([
      { code: "folder_orphan", params: { folder: "staging", path: "C:\\old\\staging" } },
    ]);
    const dialog = await openVerification(user, backend);
    const consent = dialog.getByRole("checkbox", { name: "Use these folders and recover their mods" });
    const finish = dialog.getByRole("button", { name: "Manage game" });

    expect(consent).not.toBeChecked();
    expect(finish).toBeDisabled();
    expect(manageGame).not.toHaveBeenCalled();
    await user.click(consent);
    expect(finish).toBeEnabled();
    await user.click(finish);
    await waitFor(() => expect(manageGame).toHaveBeenCalledWith(expect.objectContaining({ adoptFolders: true })));
  });

  it("does not show the consent checkbox without an orphan folder warning", async () => {
    const user = userEvent.setup();
    const { backend } = fakeWorld();
    const dialog = await openVerification(user, backend);

    expect(dialog.queryByRole("checkbox", { name: "Use these folders and recover their mods" })).not.toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Manage game" })).toBeEnabled();
  });
});
