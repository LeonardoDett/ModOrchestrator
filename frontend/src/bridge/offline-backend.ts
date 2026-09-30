import { CodedError, OFFLINE_ERROR } from "./errors";
import type { Backend } from "./types";

/**
 * Used when the UI is loaded outside the Wails shell. It reports the absence
 * of a backend instead of inventing data (D021).
 */
export function createOfflineBackend(): Backend {
  const unavailable = () => Promise.reject(new CodedError({ code: OFFLINE_ERROR, params: {} }));
  return {
    connected: false,
    window: null,
    getAppInfo: unavailable,
    listRecentOperations: unavailable,
    getOperationEvents: unavailable,
    onOperationEvent: () => () => {},
    listAppSettings: unavailable,
    setAppSetting: unavailable,
    resetAppSetting: unavailable,
    logTail: unavailable,
    openLogFolder: unavailable,
  };
}
