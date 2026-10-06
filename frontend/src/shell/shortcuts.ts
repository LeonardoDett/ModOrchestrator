import { useEffect, useRef } from "react";
import type { MessageKey } from "../i18n/i18n";

/**
 * Keyboard shortcuts (ui/00 §5). Key captions are key names, identical in
 * every language; descriptions come from the catalog.
 */
export const SHORTCUTS: readonly { keys: string; description: MessageKey }[] = [
  { keys: "Ctrl K", description: "shortcuts.commandPalette" },
  { keys: "Ctrl I", description: "shortcuts.import" },
  { keys: "Ctrl D", description: "shortcuts.deploy" },
  { keys: "Ctrl F", description: "shortcuts.search" },
  { keys: "Ctrl 1…7", description: "shortcuts.workspace" },
  { keys: "F5", description: "shortcuts.refresh" },
  { keys: "Esc", description: "shortcuts.close" },
  { keys: "↑ ↓ Home End", description: "shortcuts.tableMove" },
  { keys: "Shift ↑ ↓", description: "shortcuts.tableExtend" },
  { keys: "Ctrl Space", description: "shortcuts.tableToggle" },
  { keys: "Ctrl A", description: "shortcuts.tableSelectAll" },
  { keys: "Enter", description: "shortcuts.tableActivate" },
  { keys: "Space", description: "shortcuts.toggleEnabled" },
  { keys: "Delete", description: "shortcuts.remove" },
  { keys: "Shift F10", description: "shortcuts.contextMenu" },
  { keys: "Alt ↑ ↓", description: "shortcuts.moveRows" },
  { keys: "Ctrl Z", description: "shortcuts.undoOrder" },
];

export const PALETTE_KEYS = "Ctrl K";

interface GlobalShortcutHandlers {
  onCommandPalette: () => void;
  onRefresh: () => void;
  onDeploy?: () => void;
  onImport?: () => void;
  /** Ctrl+1..7: the n-th screen of the active game (0-based). */
  onWorkspace?: (index: number) => void;
}

/** A dialog owns the keyboard while it is open: shortcuts would act behind it. */
function dialogOpen() {
  return document.querySelector("[aria-modal='true']") !== null;
}

/** Ctrl+F: the search field of the current screen, marked with data-page-search. */
export function focusPageSearch(): boolean {
  const field = document.querySelector<HTMLInputElement>("main input[data-page-search], main [data-page-search] input");
  if (!field) return false;
  field.focus();
  field.select();
  return true;
}

/**
 * Window-level shortcuts: Ctrl/Cmd+K, Ctrl/Cmd+I (import into the active
 * game), Ctrl/Cmd+D (deploy it), Ctrl/Cmd+F (search of the screen),
 * Ctrl/Cmd+1..7 (workspace screens) and F5 (rereads instead of reloading
 * the page). Over a dialog only the palette and F5 work.
 */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = (event.ctrlKey || event.metaKey) && !event.altKey;
      const key = event.key.toLowerCase();
      if (mod && key === "k") {
        event.preventDefault();
        ref.current.onCommandPalette();
        return;
      }
      if (event.key === "F5" && !event.ctrlKey) {
        event.preventDefault();
        ref.current.onRefresh();
        return;
      }
      if (event.defaultPrevented || dialogOpen()) return;
      if (mod && !event.shiftKey && key === "d" && ref.current.onDeploy) {
        event.preventDefault();
        ref.current.onDeploy();
      } else if (mod && !event.shiftKey && key === "i" && ref.current.onImport) {
        event.preventDefault();
        ref.current.onImport();
      } else if (mod && !event.shiftKey && key === "f") {
        if (focusPageSearch()) event.preventDefault();
      } else if (mod && !event.shiftKey && /^[1-7]$/.test(event.key) && ref.current.onWorkspace) {
        event.preventDefault();
        ref.current.onWorkspace(Number(event.key) - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
