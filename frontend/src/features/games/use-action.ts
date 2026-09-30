import { useCallback } from "react";
import { useToast } from "dettmann-ui";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import { useRefresh } from "../../bridge/use-backend-query";
import { useI18n, type MessageKey } from "../../i18n/i18n";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: UIError };

/**
 * Runs a backend command. On success every visible query rereads the backend
 * (the UI never patches its own copy, INV-OPS-04); on failure the coded error
 * becomes a translated toast and is also returned so a dialog can show it.
 */
export function useAction() {
  const i18n = useI18n();
  const { addToast } = useToast();
  const { refresh } = useRefresh();
  return useCallback(
    async function run<T>(call: () => Promise<T>, options: { success?: MessageKey; quiet?: boolean } = {}): Promise<ActionResult<T>> {
      try {
        const value = await call();
        refresh();
        if (options.success) addToast({ title: i18n.t(options.success), variant: "success", duration: 3000 });
        return { ok: true, value };
      } catch (raw) {
        const error = toUIError(raw);
        if (!options.quiet) addToast({ title: errorMessage(i18n, error), variant: "danger" });
        return { ok: false, error };
      }
    },
    [i18n, addToast, refresh],
  );
}
