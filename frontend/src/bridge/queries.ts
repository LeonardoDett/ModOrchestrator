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
