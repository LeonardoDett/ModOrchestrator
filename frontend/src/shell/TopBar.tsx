import { Activity, Command as CommandIcon, Keyboard, ScrollText, WifiOff } from "lucide-react";
import { CircleHelpIcon, InfoIcon } from "dettmann-ui/icons";
import { Badge, Button, Kbd, Loader, Menu, Typography, Icon } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useOperations } from "../bridge/queries";
import { useI18n } from "../i18n/i18n";
import { ProfileSelect } from "../features/profiles/ProfileSelect";
import { DeployStatusButton } from "../features/deploy/DeployStatusButton";
import { NotificationBell } from "../features/diagnostics/NotificationBell";
import { ProblemsButton } from "../features/diagnostics/ProblemsButton";
import { PALETTE_KEYS } from "./shortcuts";

export type ShellDialog = "palette" | "shortcuts" | "about";

interface TopBarProps {
  title: string;
  onOpenOperations: () => void;
  onOpenDialog: (dialog: ShellDialog) => void;
  onOpenLog: () => void;
}

/**
 * Page top bar (ui/00 §2.3), with the profile select, the deploy status
 * and the problems counter of the active game, and the notification bell.
 * The provider account (V2) keeps no place until it exists
 * (anti-pattern 18).
 */
export function TopBar({ title, onOpenOperations, onOpenDialog, onOpenLog }: TopBarProps) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const operations = useOperations(20);
  const running = operations.status === "ready" ? operations.data.filter((op) => op.status === "running").length : 0;

  return (
    <div data-slot="topbar" className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-structure px-4">
      <Typography as="h1" variant="heading-6" className="min-w-0 truncate">
        {title}
      </Typography>
      <div data-slot="profile">
        <ProfileSelect />
      </div>
      <div data-slot="deploy-status">
        <DeployStatusButton />
      </div>
      <div className="flex-1" />
      {!backend.connected ? (
        <Badge intent="warning" className="gap-1" title={t("app.offlineHint")}>
          <Icon icon={WifiOff} size="xs" />
          {t("app.offline")}
        </Badge>
      ) : null}
      <div data-slot="problems">
        <ProblemsButton />
      </div>
      <Button
        emphasis="low"
        size="sm"
        onClick={onOpenOperations}
        aria-label={running > 0 ? `${t("topbar.operations")}: ${tp("topbar.operationsRunning", running)}` : t("topbar.operations")}
        startIcon={
          running > 0 ? (
            <Loader decorative size="sm" intent="brand" />
          ) : (
            <Icon icon={Activity} size="sm" />
          )
        }
      >
        {t("topbar.operations")}
        {running > 0 ? (
          <Badge intent="brand" size="sm" aria-hidden="true">
            {running}
          </Badge>
        ) : null}
      </Button>
      <div data-slot="notifications">
        <NotificationBell onOpenOperations={onOpenOperations} />
      </div>
      <Menu.Root placement="bottom-end">
        <Menu.Trigger>
          <Button emphasis="low" size="icon-sm" aria-label={t("topbar.help")}>
            <CircleHelpIcon size="sm" />
          </Button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item label={t("help.commandPalette")} onSelect={() => onOpenDialog("palette")}>
            <Icon icon={CommandIcon} size="sm" />
            <span className="flex-1">{t("help.commandPalette")}</span>
            <Kbd>{PALETTE_KEYS}</Kbd>
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
    </div>
  );
}
