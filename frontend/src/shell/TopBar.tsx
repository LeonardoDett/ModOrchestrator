import { Activity, CircleHelp, Command as CommandIcon, Info, Keyboard, Loader2, ScrollText, WifiOff } from "lucide-react";
import { Badge, Button, Kbd, Menu, Typography } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useOperations } from "../bridge/queries";
import { useI18n } from "../i18n/i18n";
import { ProfileSelect } from "../features/profiles/ProfileSelect";
import { DeployStatusButton } from "../features/deploy/DeployStatusButton";
import { PALETTE_KEYS } from "./shortcuts";

export type ShellDialog = "palette" | "shortcuts" | "about";

interface TopBarProps {
  title: string;
  onOpenOperations: () => void;
  onOpenDialog: (dialog: ShellDialog) => void;
  onOpenLog: () => void;
}

/**
 * Page top bar (ui/00 §2.3), with the profile select and the deploy status
 * of the active game. Slots that depend on later phases (problems and
 * notifications F9, provider account V2) keep their place but render
 * nothing until they exist (anti-pattern 18).
 */
export function TopBar({ title, onOpenOperations, onOpenDialog, onOpenLog }: TopBarProps) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const operations = useOperations(20);
  const running = operations.status === "ready" ? operations.data.filter((op) => op.status === "running").length : 0;

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-structure px-4">
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
        <Badge tone="warning" className="gap-1" title={t("app.offlineHint")}>
          <WifiOff aria-hidden="true" className="h-3 w-3" />
          {t("app.offline")}
        </Badge>
      ) : null}
      <div data-slot="problems" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenOperations}
        aria-label={running > 0 ? `${t("topbar.operations")}: ${tp("topbar.operationsRunning", running)}` : t("topbar.operations")}
        startIcon={
          running > 0 ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-brand-text" />
          ) : (
            <Activity aria-hidden="true" className="h-4 w-4" />
          )
        }
      >
        {t("topbar.operations")}
        {running > 0 ? (
          <Badge tone="primary" size="sm" aria-hidden="true">
            {running}
          </Badge>
        ) : null}
      </Button>
      <div data-slot="notifications" />
      <Menu.Root placement="bottom-end">
        <Menu.Trigger>
          <Button variant="ghost" size="icon-sm" aria-label={t("topbar.help")}>
            <CircleHelp aria-hidden="true" className="h-4 w-4" />
          </Button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item label={t("help.commandPalette")} onSelect={() => onOpenDialog("palette")}>
            <CommandIcon aria-hidden="true" className="h-4 w-4" />
            <span className="flex-1">{t("help.commandPalette")}</span>
            <Kbd>{PALETTE_KEYS}</Kbd>
          </Menu.Item>
          <Menu.Item label={t("help.shortcuts")} onSelect={() => onOpenDialog("shortcuts")}>
            <Keyboard aria-hidden="true" className="h-4 w-4" />
            {t("help.shortcuts")}
          </Menu.Item>
          <Menu.Item label={t("help.openLog")} onSelect={onOpenLog}>
            <ScrollText aria-hidden="true" className="h-4 w-4" />
            {t("help.openLog")}
          </Menu.Item>
          <Menu.Item label={t("help.about")} onSelect={() => onOpenDialog("about")}>
            <Info aria-hidden="true" className="h-4 w-4" />
            {t("help.about")}
          </Menu.Item>
        </Menu.Content>
      </Menu.Root>
    </div>
  );
}
