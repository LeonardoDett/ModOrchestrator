import { Check, ChevronDown, Gamepad2 } from "lucide-react";
import { Button, Menu, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useWorkspace } from "../../bridge/queries";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useAction } from "./use-action";

/**
 * Launcher area of the title bar (ui/00 §2.1): the active game and a switch
 * between managed instances. Play sits next to it (PlayButton, D045).
 */
export function GameSwitcher() {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  const ws = useWorkspace();

  if (ws.status !== "ready" || !ws.data.active) {
    return (
      <>
        <Gamepad2 aria-hidden="true" className="h-4 w-4 text-fg-subtle" />
        <Typography variant="body-sm" color="muted-fg">
          {t("titlebar.noGame")}
        </Typography>
      </>
    );
  }
  const { active, instances } = ws.data;
  return (
    <Menu.Root>
      <Menu.Trigger>
        <Button size="sm" variant="ghost" startIcon={<Gamepad2 aria-hidden="true" className="h-4 w-4" />} endIcon={<ChevronDown aria-hidden="true" className="h-4 w-4" />} aria-label={t("titlebar.switchGame", { name: active.name })}>
          {active.name}
        </Button>
      </Menu.Trigger>
      <Menu.Content>
        {instances.map((inst) => (
          <Menu.Item key={inst.id} label={inst.name} onSelect={() => void run(() => backend.setActiveInstance(inst.id))}>
            <span className="flex items-center gap-2">
              <Check aria-hidden="true" className={`h-4 w-4 ${inst.id === active.id ? "" : "invisible"}`} />
              <span>{inst.name}</span>
              {inst.gameName && inst.gameName !== inst.name ? <span className="text-xs text-fg-muted">{inst.gameName}</span> : null}
            </span>
          </Menu.Item>
        ))}
        <Menu.Item label={t("titlebar.manageGames")} onSelect={() => navigate({ view: "games" })}>
          {t("titlebar.manageGames")}
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
