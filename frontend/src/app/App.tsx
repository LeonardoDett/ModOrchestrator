import { useState } from "react";
import { ThemeProvider } from "dettmann-ui";
import { Puzzle, Settings, Gamepad2 } from "lucide-react";
import { BackendProvider } from "../bridge/backend-context";
import type { Backend } from "../bridge/types";
import { AppShell } from "../shell/AppShell";
import { DEFAULT_VIEW, type ViewId } from "../shell/navigation";
import { DashboardPage } from "../pages/DashboardPage";
import { PlaceholderPage } from "../pages/PlaceholderPage";

function renderView(view: ViewId) {
  switch (view) {
    case "dashboard":
      return <DashboardPage />;
    case "games":
      return (
        <PlaceholderPage
          title="Games"
          description="Games managed by Mod Orchestrator."
          icon={Gamepad2}
          emptyTitle="No games yet"
          emptyDescription="Game discovery and manual game location are not available in this build."
        />
      );
    case "extensions":
      return (
        <PlaceholderPage
          title="Extensions"
          description="Game support and feature extensions."
          icon={Puzzle}
          emptyTitle="No extensions installed"
          emptyDescription="Installed extensions and the capabilities they provide will be listed here."
        />
      );
    case "settings":
      return (
        <PlaceholderPage
          title="Settings"
          description="Interface, application, deployment and import preferences."
          icon={Settings}
          emptyTitle="Nothing to configure yet"
          emptyDescription="Settings appear here as the features they control become available."
        />
      );
  }
}

export function App({ backend }: { backend: Backend }) {
  const [view, setView] = useState<ViewId>(DEFAULT_VIEW);
  return (
    <ThemeProvider defaultTheme="forest" defaultMode="dark">
      <BackendProvider backend={backend}>
        <AppShell current={view} onNavigate={setView}>
          {renderView(view)}
        </AppShell>
      </BackendProvider>
    </ThemeProvider>
  );
}
