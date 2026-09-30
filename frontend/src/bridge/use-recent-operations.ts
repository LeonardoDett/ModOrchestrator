import { useCallback, useEffect, useState } from "react";
import { useBackend } from "./backend-context";
import type { Operation } from "./types";

export type RecentOperationsState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; operations: Operation[] };

/**
 * Loads recent operations and reloads them whenever the backend reports an
 * operation event. State is always re-read from the backend (source of
 * truth); events are only a signal to refresh.
 */
export function useRecentOperations(limit = 20): RecentOperationsState {
  const backend = useBackend();
  const [state, setState] = useState<RecentOperationsState>(
    backend.connected ? { status: "loading" } : { status: "unavailable" },
  );

  const load = useCallback(() => {
    backend
      .listRecentOperations(limit)
      .then((operations) => setState({ status: "ready", operations: operations ?? [] }))
      .catch((err: unknown) => setState({ status: "error", message: err instanceof Error ? err.message : String(err) }));
  }, [backend, limit]);

  useEffect(() => {
    if (!backend.connected) return;
    load();
    return backend.onOperationEvent(load);
  }, [backend, load]);

  return state;
}
