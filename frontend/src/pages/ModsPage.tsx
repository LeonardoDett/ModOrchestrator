import { Alert, Spinner } from "dettmann-ui";
import { useWorkspace } from "../bridge/queries";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useI18n } from "../i18n/i18n";
import { ModsWorkspace } from "./ModsWorkspace";
import { PageBody } from "./PageBody";

/**
 * Mods (ui/telas/mods.md) of the active game. Deploy (F7)
 * and problem (F9) columns and actions arrive with their phases and are not
 * shown before that (anti-pattern 18).
 */
export function ModsPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  if (ws.status === "loading") return <PageBody><Spinner label={t("common.loading")} /></PageBody>;
  if (ws.status === "unavailable") {
    return (
      <PageBody>
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      </PageBody>
    );
  }
  if (ws.status === "error") return <PageBody><ErrorAlert title="games.loadError" error={ws.error} onRetry={ws.reload} /></PageBody>;
  if (!ws.data.active) return null; // Routes sends the user back to Games
  return <ModsWorkspace key={ws.data.active.id} instance={ws.data.active.id} />;
}
