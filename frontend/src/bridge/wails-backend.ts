import {
  CancelOperation,
  GameInstanceDetails,
  GamesView,
  GetAppInfo,
  GetOperationEvents,
  HideGame,
  HideInstance,
  ListAppSettings,
  ListRecentOperations,
  LogTail,
  ManageGame,
  OpenInstanceFolder,
  OpenLogFolder,
  PickFolder,
  RenameInstance,
  ResetAppSetting,
  ScanGames,
  SetActiveInstance,
  SetAppSetting,
  SuggestGameFolders,
  UnmanageGame,
  UpdateInstanceLocation,
  ValidateGameRoot,
  VerifyGameSetup,
  Workspace,
} from "../../wailsjs/go/bridge/App";
import type { bridge } from "../../wailsjs/go/models";
import { EventsOn, Quit, WindowMinimise, WindowToggleMaximise } from "../../wailsjs/runtime/runtime";
import type {
  AppInfo,
  Backend,
  GameFolders,
  GamesView as GamesViewT,
  LogEntry,
  ManagedGame,
  ManageResult,
  Operation,
  OperationEvent,
  RootCheck,
  Setting,
  SetupVerification,
  Workspace as WorkspaceT,
} from "./types";

/** Channel name emitted by internal/bridge (EventOperation). */
export const OPERATION_EVENT_CHANNEL = "operation:event";

export function isWailsRuntime(): boolean {
  const w = window as unknown as { go?: unknown; runtime?: unknown };
  return typeof w.go === "object" && typeof w.runtime === "object";
}

export function createWailsBackend(): Backend {
  return {
    connected: true,
    window: { minimise: WindowMinimise, toggleMaximise: WindowToggleMaximise, quit: Quit },
    getAppInfo: () => GetAppInfo() as Promise<AppInfo>,
    listRecentOperations: (limit) => ListRecentOperations(limit) as unknown as Promise<Operation[]>,
    getOperationEvents: (id) => GetOperationEvents(id) as unknown as Promise<OperationEvent[]>,
    onOperationEvent: (listener) =>
      EventsOn(OPERATION_EVENT_CHANNEL, (event: OperationEvent) => listener(event)),
    listAppSettings: () => ListAppSettings() as unknown as Promise<Setting[]>,
    setAppSetting: (key, value) => SetAppSetting(key, value),
    resetAppSetting: (key) => ResetAppSetting(key),
    logTail: (filter) => LogTail(filter as bridge.LogFilterDTO) as unknown as Promise<LogEntry[]>,
    openLogFolder: () => OpenLogFolder(),
    gamesView: (showHidden) => GamesView(showHidden) as unknown as Promise<GamesViewT>,
    gameInstanceDetails: (id) => GameInstanceDetails(id) as unknown as Promise<ManagedGame>,
    workspace: () => Workspace() as unknown as Promise<WorkspaceT>,
    scanGames: (mode) => ScanGames(mode),
    cancelOperation: (id) => CancelOperation(id),
    validateGameRoot: (gameId, root) => ValidateGameRoot(gameId, root) as unknown as Promise<RootCheck>,
    suggestGameFolders: (gameId, root, name) => SuggestGameFolders(gameId, root, name) as unknown as Promise<GameFolders>,
    verifyGameSetup: (setup) => VerifyGameSetup(setup as bridge.SetupDTO) as unknown as Promise<SetupVerification>,
    manageGame: (setup) => ManageGame(setup as bridge.SetupDTO) as unknown as Promise<ManageResult>,
    setActiveInstance: (id) => SetActiveInstance(id),
    renameInstance: (id, name) => RenameInstance(id, name),
    hideInstance: (id, hidden) => HideInstance(id, hidden),
    hideGame: (gameId, hidden) => HideGame(gameId, hidden),
    updateInstanceLocation: (id, root) => UpdateInstanceLocation(id, root),
    unmanageGame: (id, options) => UnmanageGame(id, options as bridge.UnmanageOptionsDTO),
    openInstanceFolder: (id, folder) => OpenInstanceFolder(id, folder),
    pickFolder: (title) => PickFolder(title),
  };
}
