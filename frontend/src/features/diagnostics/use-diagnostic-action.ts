import { useCallback } from "react";
import { useBackend } from "../../bridge/backend-context";
import type { Diagnostic } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useDeploy } from "../deploy/DeployContext";
import { useAction } from "../games/use-action";

/**
 * Runs the action at index of a diagnostic (core/10 §1.2). A command goes
 * to the backend, which evaluates the diagnostic again before acting; a
 * navigation opens the screen or dialog where the problem is solved
 * (INV-OPS-06). Either way the UI rereads afterwards, so a solved problem
 * disappears without a manual reload. The places listed here must match
 * diagnostics.Places() in the backend (checked by diagnostics.test.tsx).
 */
export function useDiagnosticAction() {
  const backend = useBackend();
  const run = useAction();
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const deploy = useDeploy();

  return useCallback(
    async (d: Diagnostic, index: number) => {
      const a = d.actions[index];
      if (!a) return;
      if (!a.navigateTo) {
        await run(() => backend.executeDiagnosticAction(d.instance, d.key, a.id, index), { success: "diag.actionDone" });
        return;
      }
      const place = PLACES[a.navigateTo as Place];
      if (place) await place({ d, backend, run, t, navigate, deploy });
    },
    [backend, run, t, navigate, deploy],
  );
}

interface PlaceContext {
  d: Diagnostic;
  backend: ReturnType<typeof useBackend>;
  run: ReturnType<typeof useAction>;
  t: ReturnType<typeof useI18n>["t"];
  navigate: ReturnType<typeof useNavigation>["navigate"];
  deploy: ReturnType<typeof useDeploy>;
}

export type Place =
  | "mods.import"
  | "mods.rules"
  | "deploy.plan"
  | "deploy.changes"
  | "deploy.result"
  | "settings.mods"
  | "games.instance"
  | "folder.staging"
  | "folder.game"
  | "conflicts"
  | "conflicts.mod"
  | "plugins"
  | "plugins.rules"
  | "load_order"
  | "load_order.review";

/** Where each navigation action leads. */
export const PLACES: Record<Place, (c: PlaceContext) => Promise<void> | void> = {
  "mods.import": async ({ d, backend, run, t }) => {
    await run(() => backend.pickImportFiles(d.instance, t("mods.import.pickFiles")));
  },
  "mods.rules": ({ navigate }) => navigate({ view: "mods" }),
  "deploy.plan": ({ deploy }) => deploy.openPreview(),
  "deploy.changes": ({ deploy }) => deploy.openReview(),
  "deploy.result": ({ deploy }) => deploy.openFailures(),
  "settings.mods": ({ navigate }) => navigate({ view: "settings", settingsTab: "mods" }),
  "games.instance": ({ navigate }) => navigate({ view: "games" }),
  "folder.staging": async ({ d, backend, run }) => {
    await run(() => backend.openInstanceFolder(d.instance, "staging"));
  },
  "folder.game": async ({ d, backend, run }) => {
    await run(() => backend.openInstanceFolder(d.instance, "game"));
  },
  conflicts: ({ navigate }) => navigate({ view: "conflicts" }),
  "conflicts.mod": ({ navigate }) => navigate({ view: "conflicts" }),
  plugins: ({ d, navigate }) => navigate({ view: "plugins", plugin: d.params.plugin }),
  "plugins.rules": ({ navigate }) => navigate({ view: "plugins", pluginDialog: "rules" }),
  load_order: ({ navigate }) => navigate({ view: "load_order" }),
  "load_order.review": ({ navigate }) => navigate({ view: "load_order", review: true }),
};
