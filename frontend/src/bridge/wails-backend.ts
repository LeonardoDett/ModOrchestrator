import { GetAppInfo, GetOperationEvents, ListRecentOperations } from "../../wailsjs/go/bridge/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import type { AppInfo, Backend, Operation, OperationEvent } from "./types";

/** Channel name emitted by internal/bridge (EventOperation). */
export const OPERATION_EVENT_CHANNEL = "operation:event";

export function isWailsRuntime(): boolean {
  const w = window as unknown as { go?: unknown; runtime?: unknown };
  return typeof w.go === "object" && typeof w.runtime === "object";
}

export function createWailsBackend(): Backend {
  return {
    connected: true,
    getAppInfo: () => GetAppInfo() as Promise<AppInfo>,
    listRecentOperations: (limit) => ListRecentOperations(limit) as unknown as Promise<Operation[]>,
    getOperationEvents: (id) => GetOperationEvents(id) as unknown as Promise<OperationEvent[]>,
    onOperationEvent: (listener) =>
      EventsOn(OPERATION_EVENT_CHANNEL, (event: OperationEvent) => listener(event)),
  };
}
