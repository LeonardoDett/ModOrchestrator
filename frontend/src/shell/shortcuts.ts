import { useEffect, useRef } from "react";
import type { MessageKey } from "../i18n/i18n";

/**
 * Global shortcuts implemented so far (ui/00 §5). Key captions are key
 * names, identical in every language; descriptions come from the catalog.
 * Shortcuts of later phases (Ctrl+I import, Ctrl+1..7 workspace) join
 * this list with the features they trigger.
 */
export const SHORTCUTS: readonly { keys: string; description: MessageKey }[] = [
  { keys: "Ctrl K", description: "shortcuts.commandPalette" },
  { keys: "F5", description: "shortcuts.refresh" },
  { keys: "Ctrl D", description: "shortcuts.deploy" },
  { keys: "Esc", description: "shortcuts.close" },
  { keys: "↑ ↓ Home End", description: "shortcuts.tableMove" },
  { keys: "Shift ↑ ↓", description: "shortcuts.tableExtend" },
  { keys: "Ctrl Space", description: "shortcuts.tableToggle" },
  { keys: "Ctrl A", description: "shortcuts.tableSelectAll" },
  { keys: "Enter", description: "shortcuts.tableActivate" },
  { keys: "Alt ↑ ↓", description: "shortcuts.moveRows" },
  { keys: "Ctrl Z", description: "shortcuts.undoOrder" },
];

export const PALETTE_KEYS = "Ctrl K";

interface GlobalShortcutHandlers {
  onCommandPalette: () => void;
  onRefresh: () => void;
  onDeploy?: () => void;
}

/** Window-level shortcuts: Ctrl/Cmd+K, Ctrl/Cmd+D (deploy the active game) and F5 (rereads instead of reloading the page). */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ref.current.onCommandPalette();
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "d" && ref.current.onDeploy) {
        event.preventDefault();
        ref.current.onDeploy();
      } else if (event.key === "F5" && !event.ctrlKey) {
        event.preventDefault();
        ref.current.onRefresh();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
