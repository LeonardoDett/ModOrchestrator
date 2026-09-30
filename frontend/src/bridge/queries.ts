import { useBackendQuery } from "./use-backend-query";
import type { LogFilter } from "./types";

export function useAppInfo() {
  return useBackendQuery((b) => b.getAppInfo(), []);
}

export function useOperations(limit = 50) {
  return useBackendQuery(async (b) => (await b.listRecentOperations(limit)) ?? [], [limit], { onOperationEvents: true });
}

export function useLogTail(filter: LogFilter) {
  const { levels, operation, text, limit } = filter;
  return useBackendQuery(
    async (b) => (await b.logTail({ levels, operation, text, limit })) ?? [],
    [levels.join(","), operation, text, limit],
    { onOperationEvents: true },
  );
}

/** Games screen content; rereads on operation events (manage, search). */
export function useGamesView(showHidden: boolean) {
  return useBackendQuery((b) => b.gamesView(showHidden), [showHidden], { onOperationEvents: true });
}

/** Shell navigation derived by the backend from the active game's capabilities. */
export function useWorkspace() {
  return useBackendQuery((b) => b.workspace(), [], { onOperationEvents: true });
}

export function useInstanceDetails(id: string) {
  return useBackendQuery((b) => b.gameInstanceDetails(id), [id], { onOperationEvents: true });
}
