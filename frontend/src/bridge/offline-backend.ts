import type { Backend } from "./types";

/**
 * Used when the UI is loaded outside the Wails shell. It reports the absence
 * of a backend instead of inventing data.
 */
export function createOfflineBackend(): Backend {
  const unavailable = () => Promise.reject(new Error("Backend unavailable outside the desktop app"));
  return {
    connected: false,
    getAppInfo: unavailable,
    listRecentOperations: unavailable,
    getOperationEvents: unavailable,
    onOperationEvent: () => () => {},
  };
}
