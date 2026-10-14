import { Activity, Command as CommandIcon, Keyboard, ScrollText, WifiOff } from "lucide-react";
import { ChevronLeftIcon, CircleHelpIcon, InfoIcon, SearchIcon } from "dettmann-ui/icons";
import { Badge, Button, Kbd, Menu, Navbar, Icon } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useI18n } from "../i18n/i18n";
import { GameSwitcher } from "../features/games/GameSwitcher";
import { ProfileSelect } from "../features/profiles/ProfileSelect";
import { NotificationBell } from "../features/diagnostics/NotificationBell";
import { PALETTE_KEYS } from "./shortcuts";
import { AppLogo, WindowControls, dragRegion, noDrag } from "./TitleBar";

export type ShellDialog = "palette" | "shortcuts" | "about";

interface TopBarProps {
  /** `app`: logo; `game`: back to the Library, game and profile (D120). */
  level: "app" | "game";
  onBackToLibrary: () => void;
  onOpenOperations: () => void;
  onOpenDialog: (dialog: ShellDialog) => void;
  onOpenLog: () => void;
  /** Frameless window: the window controls sit flush right. */
  windowControls: boolean;
}

/**
 * Top bar of both levels (ui/00 §2.2, D120). The status of the deploy, the
 * problems counter and the operations indicator of the old top bar are gone:
 * they reach the user as the bell's count, the deployment card and the menu
 * badges. The palette has a button because the search left the menu.
 */
export function TopBar({ level, onBackToLibrary, onOpenOperations, onOpenDialog, onOpenLog, windowControls }: TopBarProps) {
  const { t } = useI18n();
  const backend = useBackend();

  return (
    <Navbar.Root
      size="compact"
      data-slot="topbar"
      className="select-none"
      style={dragRegion}
      brand={
        level === "game" ? (
          <span className="flex items-center gap-2" style={noDrag}>
            <Button size="sm" startIcon={<ChevronLeftIcon size="sm" />} onClick={onBackToLibrary}>
              {t("nav.backToLibrary")}
            </Button>
            <span aria-hidden="true" className="h-5 w-px bg-border" />
          </span>
        ) : (
          <span className="flex items-center px-2">
            <AppLogo />
          </span>
        )
      }
      actions={
        <span className="flex items-center gap-1" style={noDrag}>
          {!backend.connected ? (
            <Badge intent="warning" className="gap-1" title={t("app.offlineHint")}>
              <Icon icon={WifiOff} size="xs" />
              {t("app.offline")}
            </Badge>
          ) : null}
          <Button
            emphasis="low"
            size="icon"
            aria-label={`${t("topbar.commandPalette")} (${PALETTE_KEYS})`}
            tooltip={`${t("topbar.commandPalette")} · ${PALETTE_KEYS}`}
            onClick={() => onOpenDialog("palette")}
          >
            <SearchIcon size="sm" />
          </Button>
          <span data-slot="notifications">
            <NotificationBell onOpenOperations={onOpenOperations} />
          </span>
          <Menu.Root placement="bottom-end">
            <Menu.Trigger>
              <Button emphasis="low" size="icon" aria-label={t("topbar.help")} title={t("topbar.help")}>
                <CircleHelpIcon size="sm" />
              </Button>
            </Menu.Trigger>
            <Menu.Content>
              <Menu.Item label={t("help.commandPalette")} onSelect={() => onOpenDialog("palette")}>
                <Icon icon={CommandIcon} size="sm" />
                <span className="flex-1">{t("help.commandPalette")}</span>
                <Kbd>{PALETTE_KEYS}</Kbd>
              </Menu.Item>
              <Menu.Item label={t("help.operations")} onSelect={onOpenOperations}>
                <Icon icon={Activity} size="sm" />
                {t("help.operations")}
              </Menu.Item>
              <Menu.Item label={t("help.shortcuts")} onSelect={() => onOpenDialog("shortcuts")}>
                <Icon icon={Keyboard} size="sm" />
                {t("help.shortcuts")}
              </Menu.Item>
              <Menu.Item label={t("help.openLog")} onSelect={onOpenLog}>
                <Icon icon={ScrollText} size="sm" />
                {t("help.openLog")}
              </Menu.Item>
              <Menu.Item label={t("help.about")} onSelect={() => onOpenDialog("about")}>
                <InfoIcon size="sm" />
                {t("help.about")}
              </Menu.Item>
            </Menu.Content>
          </Menu.Root>
        </span>
      }
      windowControls={windowControls ? <WindowControls enabled /> : undefined}
    >
      {level === "game" ? (
        <span className="flex min-w-0 items-center gap-2" style={noDrag}>
          <GameSwitcher />
          <span data-slot="profile">
            <ProfileSelect />
          </span>
        </span>
      ) : null}
    </Navbar.Root>
  );
}
