import { createContext, useContext } from "react";
import {
  Activity,
  Gamepad2,
  GitCompareArrows,
  House,
  Layers,
  LayoutDashboard,
  ListOrdered,
  Package,
  Plug,
  Puzzle,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceItemId } from "../bridge/types";
import type { MessageKey } from "../i18n/i18n";

/**
 * Navigation (ui/00-principios-e-shell.md §2.2).
 *
 * Sections: global top (Dashboard, Games), the active game's workspace and
 * global bottom (Extensions, Settings). Which workspace screens exist is
 * decided by the backend from the adapter capabilities (core/11 §5); the UI
 * only maps each id it receives to an icon and a label, and ignores ids it
 * does not know. Without an active game the workspace section does not exist
 * (D023). Reserved areas (Downloads, Tools, Collections, Saves) are
 * intentionally absent (anti-pattern 18).
 */
export type WorkspaceViewId = WorkspaceItemId;
export type ViewId = "dashboard" | "games" | "extensions" | "settings" | WorkspaceViewId;
export type DiagnosticsTab = "problems" | "history" | "operations" | "log";

export interface Route {
  view: ViewId;
  /** Diagnostics tab. */
  tab?: DiagnosticsTab;
  /** Log filter by operation id (Diagnostics › Log). */
  operation?: string;
  /** Diagnostics › Problems: the diagnostic to select (key) or the code to filter. */
  diagnostic?: string;
  /** Diagnostics › History: filter by mod (Mods toolbar "Histórico", core/10 §3). */
  mod?: { id: string; name: string };
  /** Settings tab to open. */
  settingsTab?: string;
  /** Initial filter of a list screen (Overview numbers lead to the filtered screen). */
  filter?: string;
  /** Dashboard: open in customize mode (Settings › Interface › Dashboard). */
  customize?: boolean;
  /** Plugins / Load Order: the plugin to select in the Inspector. */
  plugin?: string;
  /** Plugins: a dialog to open (DLG-23 rules, DLG-24 groups). */
  pluginDialog?: "rules" | "groups";
  /** Load Order: open the review of an external change of the load order file. */
  review?: boolean;
  /** Mods: the mod to select (from "Mod de origem" of a plugin). */
  focusMod?: string;
}

export interface NavEntry {
  id: ViewId;
  label: MessageKey;
  icon: LucideIcon;
}

export interface NavSection {
  id: string;
  placement: "start" | "end";
  items: readonly NavEntry[];
}

export const VIEWS: Record<ViewId, NavEntry> = {
  dashboard: { id: "dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  games: { id: "games", label: "nav.games", icon: Gamepad2 },
  extensions: { id: "extensions", label: "nav.extensions", icon: Puzzle },
  settings: { id: "settings", label: "nav.settings", icon: Settings },
  overview: { id: "overview", label: "nav.overview", icon: House },
  mods: { id: "mods", label: "nav.mods", icon: Package },
  plugins: { id: "plugins", label: "nav.plugins", icon: Plug },
  load_order: { id: "load_order", label: "nav.loadOrder", icon: ListOrdered },
  conflicts: { id: "conflicts", label: "nav.conflicts", icon: GitCompareArrows },
  profiles: { id: "profiles", label: "nav.profiles", icon: Layers },
  diagnostics: { id: "diagnostics", label: "nav.diagnostics", icon: Activity },
};

/** Sections that exist without an active game. */
export const NAV_SECTIONS: readonly NavSection[] = [
  { id: "global", placement: "start", items: [VIEWS.dashboard, VIEWS.games] },
  { id: "app", placement: "end", items: [VIEWS.extensions, VIEWS.settings] },
];

/** Full navigation: the workspace section sits between the global ones. */
export function buildSections(workspaceItems: readonly string[] | undefined): readonly NavSection[] {
  const entries = (workspaceItems ?? []).flatMap((id) => (isWorkspaceView(id) ? [VIEWS[id]] : []));
  if (entries.length === 0) return NAV_SECTIONS;
  const [global, app] = NAV_SECTIONS;
  return [global!, { id: "workspace", placement: "start", items: entries }, app!];
}

const WORKSPACE_VIEWS: readonly string[] = ["overview", "mods", "plugins", "load_order", "conflicts", "profiles", "diagnostics"];

export function isWorkspaceView(id: string): id is WorkspaceViewId {
  return WORKSPACE_VIEWS.includes(id);
}

export const DEFAULT_ROUTE: Route = { view: "dashboard" };

export interface NavigationValue {
  route: Route;
  navigate: (route: Route) => void;
}

export const NavigationContext = createContext<NavigationValue>({ route: DEFAULT_ROUTE, navigate: () => {} });

export function useNavigation() {
  return useContext(NavigationContext);
}
