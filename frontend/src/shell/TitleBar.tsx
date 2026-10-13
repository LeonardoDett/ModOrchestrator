import type { CSSProperties } from "react";
import { Square } from "lucide-react";
import { MinusIcon, XIcon } from "dettmann-ui/icons";
import { Button, Icon } from "dettmann-ui";
import logo from "../assets/logo.png";
import { useBackend } from "../bridge/backend-context";
import { GameSwitcher } from "../features/games/GameSwitcher";
import { PlayButton } from "../features/launch/PlayButton";
import { useI18n } from "../i18n/i18n";

/** Wails frameless windows move by dragging elements with this CSS property. */
const drag = { "--wails-draggable": "drag" } as CSSProperties;
const noDrag = { "--wails-draggable": "no-drag" } as CSSProperties;

/**
 * The logo artwork is a white PNG: painted as a mask with the foreground role it
 * follows the theme (it vanished on the light theme as an <img>). 1702 x 694 px.
 */
const logoMask: CSSProperties = {
  maskImage: `url(${logo})`,
  WebkitMaskImage: `url(${logo})`,
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
  aspectRatio: "1702 / 694",
};

/**
 * Custom title bar (ui/00 §2.1, ui.customTitleBar): launcher area (active
 * game select and Play, F3/F12), a reserved area for the
 * tools hotbar (V1.x, D045: space only, no action) and the window controls
 * when the window is frameless.
 */
export function TitleBar({ windowControls }: { windowControls: boolean }) {
  const { t } = useI18n();
  const backend = useBackend();
  const controls = windowControls ? backend.window : null;

  return (
    <header data-layer="medium" className="flex h-10 shrink-0 select-none items-center border-b border-border bg-structure" style={drag}>
      <div className="flex h-full items-center px-3">
        <span role="img" aria-label={t("app.name")} className="block h-6 bg-fg" style={logoMask} />
      </div>
      <div role="group" aria-label={t("titlebar.launcher")} data-slot="launcher" className="flex h-full items-center gap-2 border-l border-border px-3">
        <span style={noDrag}>
          <GameSwitcher />
        </span>
        <span style={noDrag}>
          <PlayButton />
        </span>
      </div>
      {/* Reserved: tools hotbar (V1.x). */}
      <div data-slot="tools" className="h-full flex-1" />
      {controls ? (
        <div className="flex h-full items-center" style={noDrag}>
          <Button emphasis="low" size="icon-sm" aria-label={t("titlebar.minimize")} className="h-10 w-11 rounded-none" onClick={controls.minimise}>
            <MinusIcon size="sm" />
          </Button>
          <Button emphasis="low" size="icon-sm" aria-label={t("titlebar.maximize")} className="h-10 w-11 rounded-none" onClick={controls.toggleMaximise}>
            <Icon icon={Square} size="sm" />
          </Button>
          <Button
            emphasis="low"
            size="icon-sm"
            aria-label={t("titlebar.close")}
            className="h-10 w-11 rounded-none hover:bg-danger-fill hover:text-on-danger"
            onClick={controls.quit}
          >
            <XIcon size="sm" />
          </Button>
        </div>
      ) : null}
    </header>
  );
}
