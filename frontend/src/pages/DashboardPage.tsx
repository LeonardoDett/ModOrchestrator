import { Activity, Gamepad2 } from "lucide-react";
import { Alert, Button, Spinner, Stack, Typography } from "dettmann-ui";
import { useAppInfo, useOperations } from "../bridge/queries";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { AttentionDashlet } from "../features/diagnostics/AttentionDashlet";
import { OperationsTable } from "../features/operations/OperationsTable";
import { useI18n } from "../i18n/i18n";
import { useNavigation } from "../shell/navigation";
import { HonestEmpty, PageBody } from "./PageBody";

/** Triage center (ui/telas/dashboard.md): "Precisa de atenção" first (F9); the other dashlets arrive in F12. */
export function DashboardPage() {
  const { t, tp } = useI18n();
  const info = useAppInfo();
  const interrupted = info.status === "ready" ? info.data.interruptedOperations : 0;

  return (
    <PageBody>
      <Stack gap="xl">
        {interrupted > 0 ? (
          <Alert.Root variant="warning">
            <Alert.Title>{t("operations.interruptedTitle")}</Alert.Title>
            <Alert.Description>{tp("operations.interruptedDescription", interrupted)}</Alert.Description>
          </Alert.Root>
        ) : null}

        <AttentionDashlet />

        <Stack as="section" gap="sm" aria-labelledby="setup-status">
          <Typography id="setup-status" variant="heading-6" color="fg">
            {t("dashboard.setupStatus")}
          </Typography>
          <HonestEmpty icon={Gamepad2} title="dashboard.noGameTitle" description="dashboard.noGameDescription" />
        </Stack>

        <Stack as="section" gap="sm" aria-labelledby="recent-operations">
          <Typography id="recent-operations" variant="heading-6" color="fg">
            {t("dashboard.recentOperations")}
          </Typography>
          <RecentOperations />
        </Stack>
      </Stack>
    </PageBody>
  );
}

function RecentOperations() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const query = useOperations(10);

  switch (query.status) {
    case "loading":
      return <Spinner label={t("common.loading")} />;
    case "unavailable":
      return (
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      );
    case "error":
      return <ErrorAlert title="operations.loadError" error={query.error} onRetry={query.reload} />;
    case "ready":
      return query.data.length === 0 ? (
        <HonestEmpty icon={Activity} title="operations.emptyTitle" description="operations.emptyDescription" />
      ) : (
        <Stack gap="sm">
          <OperationsTable operations={query.data} className="flex h-80 min-h-0 flex-col" />
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate({ view: "diagnostics", tab: "operations" })}>
              {t("operations.openDiagnostics")}
            </Button>
          </div>
        </Stack>
      );
  }
}
