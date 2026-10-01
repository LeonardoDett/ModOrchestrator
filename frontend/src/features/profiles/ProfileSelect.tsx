import { Input } from "dettmann-ui";
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
  return (
    <Input.Root
      value={active?.id ?? ""}
      onChange={(id: string) => {
        if (id && id !== active?.id) void run(() => backend.activateProfile(id), { success: "profiles.activated" });
      }}
    >
      <Input.Select
        aria-label={t("topbar.profile")}
        className="min-w-40"
        options={profiles.data.map((p) => ({ value: p.id, label: p.name }))}
      />
    </Input.Root>
  );
}
