import { CheckIcon, ChevronDownIcon } from "dettmann-ui/icons";
import { Avatar, Button, Menu } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useWorkspace } from "../../bridge/queries";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useAction } from "./use-action";

/** Up to three initials of a game name for its monogram ("Skyrim Special Edition" → "SSE"). */
export function gameInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase();
}

/**
 * Game selector of the top bar (D120): the active game with its monogram in
 * the game's accent, and a switch between managed instances.
 */
export function GameSwitcher() {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  const ws = useWorkspace();

  if (ws.status !== "ready" || !ws.data.active) return null;
  const { active, instances } = ws.data;
  return (
    <Menu.Root>
      <Menu.Trigger>
        <Button
          size="sm"
          emphasis="low"
          startIcon={<Avatar shape="square" size="xs" fallback={gameInitials(active.gameName || active.name)} intent="brand" emphasis="high" />}
          endIcon={<ChevronDownIcon size="sm" />}
          aria-label={t("titlebar.switchGame", { name: active.name })}
        >
          {active.name}
        </Button>
      </Menu.Trigger>
      <Menu.Content>
        {instances.map((inst) => (
          <Menu.Item key={inst.id} label={inst.name} onSelect={() => void run(() => backend.setActiveInstance(inst.id))}>
            <span className="flex items-center gap-2">
              <CheckIcon size="sm" className={`${inst.id === active.id ? "" : "invisible"}`} />
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
