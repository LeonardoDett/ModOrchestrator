import { createContext, useContext } from "react";
import { Activity, Gamepad2, LayoutDashboard, Puzzle, Settings, type LucideIcon } from "lucide-react";
import type { MessageKey } from "../i18n/i18n";

/**
 * Navigation (ui/00-principios-e-shell.md §2.2).
 *
 * Sections: global top (Dashboard, Games), the active game's workspace
 * (Overview, Mods, ... derived from adapter capabilities, F3) and global
 * bottom (Extensions, Settings). Without an active game the workspace
 * section does not exist (D023). Reserved areas (Downloads, Tools,
 * Collections, Saves) are intentionally absent (anti-pattern 18).
 *
 * Diagnostics belongs to the game workspace; until F3 it is reached from
 * Help, the operations drawer and the command palette (its Operations and
 * Log tabs are global).
 */
export type ViewId = "dashboard" | "games" | "extensions" | "settings" | "diagnostics";
export type DiagnosticsTab = "operations" | "log";

export interface Route {
  view: ViewId;
  /** Diagnostics tab. */
  tab?: DiagnosticsTab;
  /** Log filter by operation id (Diagnostics › Log). */
  operation?: string;
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
  diagnostics: { id: "diagnostics", label: "nav.diagnostics", icon: Activity },
};

export const NAV_SECTIONS: readonly NavSection[] = [
  { id: "global", placement: "start", items: [VIEWS.dashboard, VIEWS.games] },
  { id: "app", placement: "end", items: [VIEWS.extensions, VIEWS.settings] },
];

export const DEFAULT_ROUTE: Route = { view: "dashboard" };

export interface NavigationValue {
  route: Route;
  navigate: (route: Route) => void;
}

export const NavigationContext = createContext<NavigationValue>({ route: DEFAULT_ROUTE, navigate: () => {} });

export function useNavigation() {
  return useContext(NavigationContext);
}
