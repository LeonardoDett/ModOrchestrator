import { useEffect, useRef } from "react";
import type { MessageKey } from "../i18n/i18n";

/**
 * Global shortcuts implemented so far (ui/00 §5). Key captions are key
 * names, identical in every language; descriptions come from the catalog.
 * Shortcuts of later phases (Ctrl+I import, Ctrl+D deploy, Ctrl+1..7
 * workspace) join this list with the features they trigger.
 */
export const SHORTCUTS: readonly { keys: string; description: MessageKey }[] = [
  { keys: "Ctrl K", description: "shortcuts.commandPalette" },
  { keys: "F5", description: "shortcuts.refresh" },
  { keys: "Esc", description: "shortcuts.close" },
  { keys: "↑ ↓ Home End", description: "shortcuts.tableMove" },
  { keys: "Shift ↑ ↓", description: "shortcuts.tableExtend" },
  { keys: "Ctrl Space", description: "shortcuts.tableToggle" },
  { keys: "Ctrl A", description: "shortcuts.tableSelectAll" },
  { keys: "Enter", description: "shortcuts.tableActivate" },
];

export const PALETTE_KEYS = "Ctrl K";

interface GlobalShortcutHandlers {
  onCommandPalette: () => void;
  onRefresh: () => void;
}

/** Window-level shortcuts: Ctrl/Cmd+K and F5 (rereads instead of reloading the page). */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ref.current.onCommandPalette();
      } else if (event.key === "F5" && !event.ctrlKey) {
        event.preventDefault();
        ref.current.onRefresh();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
