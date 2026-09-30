import { Gamepad2, LayoutDashboard, Puzzle, Settings, type LucideIcon } from "lucide-react";

/**
 * Global navigation (ui/00-plano-interface-v2.md › Shell global).
 *
 * The per-game workspace section (Overview, Mods, Conflicts, ...) is added
 * once a game is active and is driven by adapter capabilities (F2/F11).
 * Reserved areas (Downloads, Tools, Collections) are intentionally absent:
 * they must not appear as navigable entries until they exist.
 */
export type ViewId = "dashboard" | "games" | "extensions" | "settings";

export interface NavEntry {
  id: ViewId;
  label: string;
  icon: LucideIcon;
}

export const GLOBAL_NAVIGATION: readonly NavEntry[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "extensions", label: "Extensions", icon: Puzzle },
  { id: "settings", label: "Settings", icon: Settings },
];

export const DEFAULT_VIEW: ViewId = "dashboard";
