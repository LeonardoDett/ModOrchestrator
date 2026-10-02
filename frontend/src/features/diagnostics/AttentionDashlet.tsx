import { CheckCircle2 } from "lucide-react";
import { Alert, Button, Card, Inline, Spinner, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useAttention } from "../../bridge/queries";
import type { Diagnostic } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useDeploy } from "../deploy/DeployContext";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { SEVERITY_LOOK, actionLabel, diagnosticTitle, shownSeverity } from "./diagnostic-labels";
import { useDiagnosticAction } from "./use-diagnostic-action";

const PER_GAME = 5;

/**
 * Dashlet "Precisa de atenção" (ui/telas/dashboard.md §2): blocking, error
 * and warning diagnostics of every managed game, grouped by game, each with
 * its main action. Without problems it shows a compact positive state; it
 * never invents data (offline: explicit state, D021).
 */
export function AttentionDashlet() {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const { navigate } = useNavigation();
  const { instance: active } = useDeploy();
  const act = useDiagnosticAction();
  const attention = useAttention();

  const run = async (d: Diagnostic, index: number) => {
    // Places (dialogs, screens) belong to the active game: switch first.
    if (d.actions[index]?.navigateTo && d.instance !== active) await backend.setActiveInstance(d.instance).catch(() => undefined);
    await act(d, index);
  };

  let body;
  switch (attention.status) {
    case "loading":
      body = <Spinner label={t("common.loading")} />;
      break;
    case "unavailable":
      body = (
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      );
      break;
    case "error":
      body = <ErrorAlert title="diag.loadError" error={attention.error} onRetry={attention.reload} />;
      break;
    case "ready": {
      const games = attention.data.filter((g) => g.items.length > 0);
      body =
        games.length === 0 ? (
          <Inline gap="xs">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success-text" />
            <Typography variant="body-sm">{t("dashboard.attentionNone")}</Typography>
          </Inline>
        ) : (
          <Stack gap="md">
            {games.map((g) => (
              <Stack key={g.instance} gap="xs" as="section" aria-label={g.name ?? g.instance}>
                <Typography variant="label">{t("dashboard.attentionGame", { game: g.name ?? g.instance })}</Typography>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {g.items.slice(0, PER_GAME).map((d) => {
                    const look = SEVERITY_LOOK[shownSeverity(d)];
                    const Icon = look.icon;
                    return (
                      <li key={d.key} className="flex items-center gap-3 px-3 py-2">
                        <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${look.className}`} />
                        <Typography variant="body-sm" className="min-w-0 flex-1">
                          {diagnosticTitle(i18n, d)}
                        </Typography>
                        {d.actions[0] ? (
                          <Button size="sm" variant="outline" onClick={() => void run(d, 0)}>
                            {actionLabel(i18n, d.actions[0])}
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {g.items.length > PER_GAME ? (
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => navigate({ view: "diagnostics", tab: "problems" })}>
                      {tp("diag.band.more", g.items.length - PER_GAME)} · {t("diag.seeAll")}
                    </Button>
                  </div>
                ) : null}
              </Stack>
            ))}
          </Stack>
        );
    }
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>{t("dashboard.attention")}</Card.Title>
      </Card.Header>
      <Card.Body>{body}</Card.Body>
    </Card.Root>
  );
}
