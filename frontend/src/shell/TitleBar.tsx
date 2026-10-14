import type { CSSProperties } from "react";
import { Square } from "lucide-react";
import { MinusIcon, XIcon } from "dettmann-ui/icons";
import { Button, Icon } from "dettmann-ui";
import logo from "../assets/logo.png";
import { useBackend } from "../bridge/backend-context";
import { useI18n } from "../i18n/i18n";

/** Wails frameless windows move by dragging elements with this CSS property. */
export const dragRegion = { "--wails-draggable": "drag" } as CSSProperties;
export const noDrag = { "--wails-draggable": "no-drag" } as CSSProperties;

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

/** App logo for the app-level top bar (D120). */
export function AppLogo() {
  const { t } = useI18n();
  return <span role="img" aria-label={t("app.name")} className="block h-6 bg-fg" style={logoMask} />;
}

/**
 * Window controls of a frameless window (ui.customTitleBar): minimise,
 * maximise and close, flush right in the top bar. Nothing without a
 * frameless window.
 */
export function WindowControls({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const backend = useBackend();
  const controls = enabled ? backend.window : null;
  if (!controls) return null;
  return (
    <div className="flex h-full items-stretch" style={noDrag}>
      <Button emphasis="low" size="icon-sm" aria-label={t("titlebar.minimize")} className="h-full w-11 rounded-none" onClick={controls.minimise}>
        <MinusIcon size="sm" />
      </Button>
      <Button emphasis="low" size="icon-sm" aria-label={t("titlebar.maximize")} className="h-full w-11 rounded-none" onClick={controls.toggleMaximise}>
        <Icon icon={Square} size="sm" />
      </Button>
      <Button
        emphasis="low"
        size="icon-sm"
        aria-label={t("titlebar.close")}
        className="h-full w-11 rounded-none hover:bg-danger-fill hover:text-on-danger"
        onClick={controls.quit}
      >
        <XIcon size="sm" />
      </Button>
    </div>
  );
}
