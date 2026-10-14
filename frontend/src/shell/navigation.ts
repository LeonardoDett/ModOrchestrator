import { type IconComponent } from "dettmann-ui";
import { createContext, useContext } from "react";
import { Activity, GitCompareArrows, Plug } from "lucide-react";
import { HomeIcon, LayersIcon, ListOrderedIcon, PackageIcon, PuzzleIcon, SettingsIcon } from "dettmann-ui/icons";
import { LayoutGrid } from "lucide-react";
import type { WorkspaceGroup, WorkspaceItemId } from "../bridge/types";
import type { MessageKey } from "../i18n/i18n";

/**
 * Navigation in two levels (ui/00 §2, D120).
 *
 * App level: Home, Library, the managed games to jump into, Extensions and
 * Settings. Game level: the menu of the active game, whose groups and items
 * the backend derives from the effective capabilities (core/11 §5, D115);
 * the UI only maps each id it receives to an icon and a label, and ignores
 * ids it does not know. Without an active game there is no game level
 * (D023). Reserved areas (Downloads, Tools, Collections, Saves) are absent
 * (anti-pattern 18).
 */
export type WorkspaceViewId = WorkspaceItemId;
export type AppViewId = "dashboard" | "games" | "extensions" | "settings";
export type ViewId = AppViewId | WorkspaceViewId;
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
  icon: IconComponent;
}

export const VIEWS: Record<ViewId, NavEntry> = {
  dashboard: { id: "dashboard", label: "nav.dashboard", icon: HomeIcon },
  games: { id: "games", label: "nav.games", icon: LayoutGrid },
  extensions: { id: "extensions", label: "nav.extensions", icon: PuzzleIcon },
  settings: { id: "settings", label: "nav.settings", icon: SettingsIcon },
  overview: { id: "overview", label: "nav.overview", icon: HomeIcon },
  mods: { id: "mods", label: "nav.mods", icon: PackageIcon },
  plugins: { id: "plugins", label: "nav.plugins", icon: Plug },
  load_order: { id: "load_order", label: "nav.loadOrder", icon: ListOrderedIcon },
  conflicts: { id: "conflicts", label: "nav.conflicts", icon: GitCompareArrows },
  profiles: { id: "profiles", label: "nav.profiles", icon: LayersIcon },
  diagnostics: { id: "diagnostics", label: "nav.diagnostics", icon: Activity },
};

/** App level: start and end of the column; the jump-to games sit between them. */
export const APP_START: readonly NavEntry[] = [VIEWS.dashboard, VIEWS.games];
export const APP_END: readonly NavEntry[] = [VIEWS.extensions, VIEWS.settings];

/** Heading of a group of the game menu; the entry group has none. */
export const GROUP_LABELS: Record<string, MessageKey | undefined> = {
  entry: undefined,
  content: "nav.group.content",
  setup: "nav.group.setup",
  health: "nav.group.health",
};

/**
 * The game menu as the backend sent it. A backend that predates the groups
 * sends only the items: they become one group, in the order received.
 */
export function workspaceGroups(groups: readonly WorkspaceGroup[] | undefined, items: readonly string[] | undefined): WorkspaceGroup[] {
  const known = (ids: readonly string[]) => ids.filter(isWorkspaceView);
  if (groups && groups.length > 0) return groups.map((g) => ({ id: g.id, items: known(g.items) })).filter((g) => g.items.length > 0);
  const flat = known(items ?? []);
  return flat.length > 0 ? [{ id: "entry", items: flat }] : [];
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

/** Target of the skip link and of keyboard navigation (screens with their own header put it on their main). */
export const MAIN_ID = "main-content";
