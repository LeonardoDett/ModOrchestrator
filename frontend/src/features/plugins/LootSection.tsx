import { DownloadIcon, RefreshIcon } from "dettmann-ui/icons";
import { Button, useToast } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useLootStatus } from "../../bridge/queries";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { SettingLine, SettingsSection } from "../settings/SettingControls";

/**
 * Settings › Plugins › Dados do LOOT (D141), in the pattern of the
 * Atualizações section: which copy of the masterlist is in use,
 * "Atualizar masterlist" (the only download, on the user's click) and
 * "Importar regras do LOOT" from the userlist LOOT keeps for the game.
 * Shown only for games the backend says LOOT knows.
 */
export function LootSection({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const status = useLootStatus(instance);
  if (!instance || status.status !== "ready" || !status.data.supported) return null;
  const st = status.data;
  const when = st.date ? i18n.formatDateTime(st.date) : "";
  const source = st.source === "downloaded" ? t("settings.loot.downloaded", { when }) : t("settings.loot.bundled", { when });

  const update = () => void run(() => backend.updateLootMasterlist(instance), { success: "settings.loot.updated" });
  const importUserlist = async () => {
    const r = await run(() => backend.importLootUserlist(instance, ""));
    if (r.ok) {
      addToast({
        title: t("settings.loot.imported", { rules: r.value.rules, groups: r.value.groups, assignments: r.value.assignments, skipped: r.value.skipped }),
        variant: "success",
        duration: 5000,
      });
    }
  };

  return (
    <SettingsSection id="loot" title={t("settings.loot.title")} description={t("settings.loot.description")}>
      <SettingLine label={t("settings.loot.masterlist")} description={st.enabled ? source : t("settings.loot.off")}>
        <Button size="sm" disabled={!st.canUpdate} title={!st.canUpdate ? t("settings.loot.cannotUpdate") : undefined} startIcon={<RefreshIcon size="sm" />} onClick={update}>
          {t("settings.loot.update")}
        </Button>
      </SettingLine>
      <SettingLine label={t("settings.loot.userlist")} description={st.userlist ? t("settings.loot.userlistFound", { path: st.userlist }) : t("settings.loot.userlistMissing")}>
        <Button size="sm" disabled={!st.userlist} startIcon={<DownloadIcon size="sm" />} onClick={() => void importUserlist()}>
          {t("settings.loot.import")}
        </Button>
      </SettingLine>
    </SettingsSection>
  );
}
