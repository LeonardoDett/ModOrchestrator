import type { CSSProperties } from "react";
import { Minus, Square, X } from "lucide-react";
import { Button } from "dettmann-ui";
import logo from "../assets/logo.png";
import { useBackend } from "../bridge/backend-context";
import { GameSwitcher } from "../features/games/GameSwitcher";
import { useI18n } from "../i18n/i18n";

/** Wails frameless windows move by dragging elements with this CSS property. */
const drag = { "--wails-draggable": "drag" } as CSSProperties;
const noDrag = { "--wails-draggable": "no-drag" } as CSSProperties;

/**
 * Custom title bar (ui/00 §2.1, ui.customTitleBar): launcher area (active
 * game select and Play arrive with games, F3/F12), a reserved area for the
 * tools hotbar (V1.x, D045: space only, no action) and the window controls
 * when the window is frameless.
 */
export function TitleBar({ windowControls }: { windowControls: boolean }) {
  const { t } = useI18n();
  const backend = useBackend();
  const controls = windowControls ? backend.window : null;

  return (
    <header className="flex h-10 shrink-0 select-none items-center border-b border-border bg-structure" style={drag}>
      <div className="flex h-full items-center px-3">
        <img src={logo} alt={t("app.name")} className="h-6 w-auto" draggable={false} />
      </div>
      <div role="group" aria-label={t("titlebar.launcher")} data-slot="launcher" className="flex h-full items-center gap-2 border-l border-border px-3">
        <span style={noDrag}>
          <GameSwitcher />
        </span>
      </div>
      {/* Reserved: tools hotbar (V1.x). */}
      <div data-slot="tools" className="h-full flex-1" />
      {controls ? (
        <div className="flex h-full items-center" style={noDrag}>
          <Button variant="ghost" size="icon-sm" aria-label={t("titlebar.minimize")} className="h-10 w-11 rounded-none" onClick={controls.minimise}>
            <Minus aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("titlebar.maximize")} className="h-10 w-11 rounded-none" onClick={controls.toggleMaximise}>
            <Square aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("titlebar.close")}
            className="h-10 w-11 rounded-none hover:bg-danger hover:text-on-danger"
            onClick={controls.quit}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </header>
  );
}
