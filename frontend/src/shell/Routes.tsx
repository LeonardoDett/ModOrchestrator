import { useEffect } from "react";
import { Puzzle } from "lucide-react";
import { useWorkspace } from "../bridge/queries";
import { ConflictsPage } from "../pages/ConflictsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DiagnosticsPage } from "../pages/DiagnosticsPage";
import { GamesPage } from "../pages/GamesPage";
import { HonestEmpty, PageBody } from "../pages/PageBody";
import { SettingsPage } from "../pages/SettingsPage";
import { ModsPage } from "../pages/ModsPage";
import { ProfilesPage } from "../pages/ProfilesPage";
import { LoadOrderPage } from "../pages/LoadOrderPage";
import { PluginsPage } from "../pages/PluginsPage";
import { OverviewPage } from "../pages/WorkspacePages";
import { isWorkspaceView, useNavigation } from "./navigation";

/**
 * Renders the current route. A workspace route the backend no longer offers
 * (the game was unmanaged, or the active game has no such capability) sends
 * the user back to Games instead of showing a screen that cannot work.
 * Diagnostics stays reachable without a game: its Operations and Log tabs
 * are global (D054).
 */
export function Routes() {
  const { route, navigate } = useNavigation();
  const ws = useWorkspace();
  const offered = ws.status === "ready" ? ws.data.items : null;
  const stale = offered !== null && isWorkspaceView(route.view) && route.view !== "diagnostics" && !offered.includes(route.view);

  useEffect(() => {
    if (stale) navigate({ view: "games" });
  }, [stale, navigate]);

  if (stale) return null;
  switch (route.view) {
    case "dashboard":
      return <DashboardPage />;
    case "games":
      return <GamesPage />;
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
    case "overview":
      return <OverviewPage />;
    case "mods":
      return <ModsPage />;
    case "profiles":
      return <ProfilesPage />;
    case "conflicts":
      return <ConflictsPage />;
    case "plugins":
      return <PluginsPage />;
    case "load_order":
      return <LoadOrderPage />;
  }
}
