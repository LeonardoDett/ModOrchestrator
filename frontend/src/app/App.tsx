import { useCallback, useMemo, useState } from "react";
import { Gamepad2, Puzzle } from "lucide-react";
import { ThemeProvider, ToastProvider } from "dettmann-ui";
import { BackendProvider } from "../bridge/backend-context";
import { RefreshContext } from "../bridge/use-backend-query";
import type { Backend } from "../bridge/types";
import { useI18n } from "../i18n/i18n";
import { DashboardPage } from "../pages/DashboardPage";
import { DiagnosticsPage } from "../pages/DiagnosticsPage";
import { HonestEmpty, PageBody } from "../pages/PageBody";
import { SettingsPage } from "../pages/SettingsPage";
import { AppShell } from "../shell/AppShell";
import { DEFAULT_ROUTE, NavigationContext, type Route } from "../shell/navigation";
import { SettingsProvider } from "./settings-context";

function renderRoute(route: Route) {
  switch (route.view) {
    case "dashboard":
      return <DashboardPage />;
    case "games":
      return (
        <PageBody>
          <HonestEmpty icon={Gamepad2} title="games.emptyTitle" description="games.emptyDescription" />
        </PageBody>
      );
    case "extensions":
      return (
        <PageBody>
          <HonestEmpty icon={Puzzle} title="extensions.emptyTitle" description="extensions.emptyDescription" />
        </PageBody>
      );
    case "settings":
      return <SettingsPage />;
    case "diagnostics":
      return <DiagnosticsPage />;
  }
}

/** Toasts need the translator for their close label, so they sit inside i18n. */
function LocalizedToasts({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <ToastProvider closeLabel={t("common.close")}>{children}</ToastProvider>;
}

export function App({ backend }: { backend: Backend }) {
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const navigation = useMemo(() => ({ route, navigate: setRoute }), [route]);
  const refreshValue = useMemo(() => ({ key: refreshKey, refresh }), [refreshKey, refresh]);

  return (
    <ThemeProvider defaultTheme="orchestrator" defaultMode="dark">
      <BackendProvider backend={backend}>
        <RefreshContext.Provider value={refreshValue}>
          <SettingsProvider>
            <LocalizedToasts>
              <NavigationContext.Provider value={navigation}>
                <AppShell>{renderRoute(route)}</AppShell>
              </NavigationContext.Provider>
            </LocalizedToasts>
          </SettingsProvider>
        </RefreshContext.Provider>
      </BackendProvider>
    </ThemeProvider>
  );
}
