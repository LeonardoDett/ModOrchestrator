import {
  GetAppInfo,
  GetOperationEvents,
  ListAppSettings,
  ListRecentOperations,
  LogTail,
  OpenLogFolder,
  ResetAppSetting,
  SetAppSetting,
} from "../../wailsjs/go/bridge/App";
import type { bridge } from "../../wailsjs/go/models";
import { EventsOn, Quit, WindowMinimise, WindowToggleMaximise } from "../../wailsjs/runtime/runtime";
import type { AppInfo, Backend, LogEntry, Operation, OperationEvent, Setting } from "./types";

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
  };
}
