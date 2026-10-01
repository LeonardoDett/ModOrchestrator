import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useBackend } from "./backend-context";
import { toUIError, type UIError } from "./errors";
import type { Backend } from "./types";

export type QueryState<T> =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; error: UIError }
  | { status: "ready"; data: T };

/** Bumped by F5 / "Refresh" to make every visible query reread the backend. */
export const RefreshContext = createContext<{ key: number; refresh: () => void }>({ key: 0, refresh: () => {} });

export function useRefresh() {
  return useContext(RefreshContext);
}

/** Window in which operation events are coalesced into one reread. */
const EVENT_COALESCE_MS = 120;

interface QueryOptions {
  /** Reread when the backend signals an operation event (D021). */
  onOperationEvents?: boolean;
}

/**
 * Reads backend state. The backend is the source of truth (INV-OPS-04):
 * events are only a signal to read again, never data to merge.
 */
export function useBackendQuery<T>(
  read: (backend: Backend) => Promise<T>,
  deps: readonly unknown[],
  options: QueryOptions = {},
): QueryState<T> & { reload: () => void } {
  const backend = useBackend();
  const { key } = useRefresh();
  const [state, setState] = useState<QueryState<T>>(backend.connected ? { status: "loading" } : { status: "unavailable" });
  const readRef = useRef(read);
  readRef.current = read;
  const generation = useRef(0);

  const load = useCallback(() => {
    if (!backend.connected) return;
    const current = ++generation.current;
    readRef
      .current(backend)
      .then((data) => current === generation.current && setState({ status: "ready", data }))
      .catch((error: unknown) => current === generation.current && setState({ status: "error", error: toUIError(error) }));
  }, [backend, ...deps]); // `read` is intentionally not a dependency: `deps` describe its inputs.

  useEffect(() => {
    load();
  }, [load, key]);

  useEffect(() => {
    if (!backend.connected || !options.onOperationEvents) return;
    // Progress events arrive several times a second during an import; a
    // burst of them causes one reread, not one per event.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = backend.onOperationEvent(() => {
      clearTimeout(timer);
      timer = setTimeout(load, EVENT_COALESCE_MS);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [backend, load, options.onOperationEvents]);

  return { ...state, reload: load };
}
