import { CheckIcon, ChevronDownIcon } from "dettmann-ui/icons";
import { Button, Menu } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useProfiles, useWorkspace } from "../../bridge/queries";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";

/**
 * Profile select of the top bar (ui/telas/profiles.md §5, divergence 4):
 * switches the active profile of the active game from any screen. Only the
 * desired state changes; the deploy status arrives with F7.
 */
export function ProfileSelect() {
  const ws = useWorkspace();
  const instance = ws.status === "ready" ? ws.data.active?.id : undefined;
  if (!instance) return null;
  return <ProfileSelectFor key={instance} instance={instance} />;
}

function ProfileSelectFor({ instance }: { instance: string }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const profiles = useProfiles(instance);
  if (profiles.status !== "ready" || profiles.data.length === 0) return null;
  const active = profiles.data.find((p) => p.active);
  // Board JogoVisaoGeral: a bordered button "Perfil <name> ▾" opening the list.
  return (
    <Menu.Root>
      <Menu.Trigger>
        <Button size="sm" endIcon={<ChevronDownIcon size="sm" />} aria-label={t("topbar.profileOf", { name: active?.name ?? "" })}>
          <span className="text-fg-muted">{t("topbar.profile")}</span>
          <span className="font-medium">{active?.name}</span>
        </Button>
      </Menu.Trigger>
      <Menu.Content>
        {profiles.data.map((p) => (
          <Menu.Item
            key={p.id}
            label={p.name}
            onSelect={() => {
              if (p.id !== active?.id) void run(() => backend.activateProfile(p.id), { success: "profiles.activated" });
            }}
          >
            <span className="flex items-center gap-2">
              <CheckIcon size="sm" className={p.id === active?.id ? "" : "invisible"} />
              {p.name}
            </span>
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}
