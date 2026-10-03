import { useEffect, useState } from "react";
import { FolderOpen, RotateCcw, ScrollText } from "lucide-react";
import { Alert, Button, Spinner, Stack, Switch, Tabs, Typography, useToast } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { useBackend } from "../bridge/backend-context";
import { useGamesView, useInstanceSettings, useSuppressions, useWorkspace } from "../bridge/queries";
import type { ManagedGame } from "../bridge/types";
import { DeployMethodSection, GameFoldersSection } from "../features/deploy/DeploySettings";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { AppSettingRows, GameSettingsSelect, InstanceSettingRows, RestartBanner, SettingLine, SettingsSection, settingLabel } from "../features/settings/SettingControls";
import { WorkaroundsTab } from "../features/settings/WorkaroundsTab";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { useNavigation } from "../shell/navigation";
import { PageBody } from "./PageBody";

/**
 * Settings (ui/telas/settings-extensions.md, core/13) in the Vortex tab
 * order: Interface · Aplicação · Mods · Plugins* · Workarounds · Tema
 * (* only when a managed game has the `plugins` capability; Download is
 * reserved and hidden, D013). Per-game sections have the game select at
 * the top. Where each setting is shown is presentation; values, defaults
 * and validation come from the backend catalog.
 */
type TabId = "interface" | "application" | "mods" | "plugins" | "workarounds" | "theme";

const TAB_LABEL: Record<TabId, MessageKey> = {
  interface: "settings.tab.interface",
  application: "settings.tab.application",
  mods: "settings.tab.mods",
  plugins: "settings.tab.plugins",
  workarounds: "settings.tab.workarounds",
  theme: "settings.tab.theme",
};

export function SettingsPage() {
  const { t } = useI18n();
  const { route } = useNavigation();
  const settings = useSettings();
  const workspace = useWorkspace();
  const gamesView = useGamesView(false);
  const games: ManagedGame[] = gamesView.status === "ready" ? gamesView.data.managed : [];
  const active = workspace.status === "ready" ? (workspace.data.active?.id ?? "") : "";
  const [instance, setInstance] = useState("");
  const selected = games.some((g) => g.id === instance) ? instance : games.some((g) => g.id === active) ? active : (games[0]?.id ?? "");
  const pluginGames = games.filter((g) => g.capabilities.includes("plugins"));
  const tabs: TabId[] = ["interface", "application", "mods", ...(pluginGames.length > 0 ? (["plugins"] as const) : []), "workarounds", "theme"];
  const [tab, setTab] = useState<TabId>((route.settingsTab as TabId) ?? "interface");

  useEffect(() => {
    if (route.settingsTab) setTab(route.settingsTab as TabId);
  }, [route.settingsTab]);

  if (settings.status === "loading") return <PageBody><Spinner label={t("common.loading")} /></PageBody>;
  if (settings.status === "unavailable") {
    return (
      <PageBody>
        <Alert.Root variant="info">
          <Alert.Description>{t("settings.offline")}</Alert.Description>
        </Alert.Root>
      </PageBody>
    );
  }
  if (settings.status === "error" && settings.error) {
    return (
      <PageBody>
        <ErrorAlert title="settings.loadError" error={settings.error} />
      </PageBody>
    );
  }

  const current = tabs.includes(tab) ? tab : "interface";
  const pluginInstance = pluginGames.some((g) => g.id === selected) ? selected : (pluginGames[0]?.id ?? "");

  return (
    <PageBody>
      <Stack gap="md">
        <RestartBanner />
        <Tabs.Root value={current} onValueChange={(v) => setTab(v as TabId)}>
          <Tabs.List>
            {tabs.map((id) => (
              <Tabs.Trigger key={id} value={id}>
                {t(TAB_LABEL[id])}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Panel value="interface" className="pt-4">
            <InterfaceTab games={games} instance={selected} onInstance={setInstance} />
          </Tabs.Panel>
          <Tabs.Panel value="application" className="pt-4">
            <ApplicationTab />
          </Tabs.Panel>
          <Tabs.Panel value="mods" className="pt-4">
            <ModsTab games={games} instance={selected} onInstance={setInstance} />
          </Tabs.Panel>
          {pluginGames.length > 0 ? (
            <Tabs.Panel value="plugins" className="pt-4">
              <Stack gap="lg" className="max-w-3xl">
                <GameSettingsSelect games={pluginGames} value={pluginInstance} onChange={setInstance} />
                <InstanceSection id="plugins" title={t("settings.plugins.title")} instance={pluginInstance} keys={["plugins.autoSort", "plugins.enableOnModEnable", "plugins.enableExternallyAdded"]} />
              </Stack>
            </Tabs.Panel>
          ) : null}
          <Tabs.Panel value="workarounds" className="pt-4">
            <div className="max-w-3xl">
              <WorkaroundsTab games={games} instance={selected} onInstance={setInstance} />
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="theme" className="pt-4">
            <div className="max-w-3xl">
              <SettingsSection id="theme" title={t("settings.theme.title")}>
                <AppSettingRows keys={["theme.mode", "theme.id", "theme.fontScale", "theme.density"]} />
              </SettingsSection>
            </div>
          </Tabs.Panel>
        </Tabs.Root>
      </Stack>
    </PageBody>
  );
}

/** Instance settings of one game in a section. */
function InstanceSection({ id, title, instance, keys, children }: { id: string; title: string; instance: string; keys: string[]; children?: React.ReactNode }) {
  const { t } = useI18n();
  const settings = useInstanceSettings(instance);
  return (
    <SettingsSection id={id} title={title}>
      {settings.status === "loading" ? (
        <div className="px-4 py-3">
          <Spinner label={t("common.loading")} />
        </div>
      ) : null}
      {settings.status === "error" ? (
        <div className="px-4 py-3">
          <ErrorAlert title="settings.loadError" error={settings.error} onRetry={settings.reload} />
        </div>
      ) : null}
      {settings.status === "ready" ? <InstanceSettingRows instance={instance} settings={settings.data} keys={keys} onSaved={settings.reload} /> : null}
      {children}
    </SettingsSection>
  );
}

function InterfaceTab({ games, instance, onInstance }: { games: readonly ManagedGame[]; instance: string; onInstance: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <Stack gap="lg" className="max-w-3xl">
      <SettingsSection id="language" title={t("settings.section.language")}>
        <AppSettingRows keys={["ui.language"]} />
      </SettingsSection>
      {games.length > 0 ? <GameSettingsSelect games={games} value={instance} onChange={onInstance} /> : null}
      {instance ? (
        <InstanceSection id="automation" title={t("settings.section.automation")} instance={instance} keys={["automation.deployOnChange", "automation.enableOnInstall"]}>
          <AppSettingRows keys={["automation.deployDelayMs"]} />
        </InstanceSection>
      ) : (
        <SettingsSection id="automation" title={t("settings.section.automation")}>
          <AppSettingRows keys={["automation.deployDelayMs"]} />
          <NoGameLine />
        </SettingsSection>
      )}
      <SettingsSection id="notifications" title={t("settings.section.notifications")}>
        <AppSettingRows keys={["ui.desktopNotifications"]} />
        <SuppressedLine />
      </SettingsSection>
      {instance ? <InstanceSection id="diagnostics" title={t("settings.section.diagnostics")} instance={instance} keys={["diagnostics.showUnreviewedConflicts"]} /> : null}
      <SettingsSection id="display" title={t("settings.section.display")}>
        <AppSettingRows keys={["ui.customTitleBar", "ui.hideTopLevelCategory", "ui.relativeTimes", "ui.reduceMotion", "ui.compactHeaders"]} />
      </SettingsSection>
      <DashboardSection />
      <SettingsSection id="advanced" title={t("settings.section.advanced")}>
        <AppSettingRows keys={["ui.advancedMode"]} />
      </SettingsSection>
    </Stack>
  );
}

function NoGameLine() {
  const { t } = useI18n();
  return (
    <div className="px-4 py-3">
      <Typography variant="caption" color="muted-fg">
        {t("settings.perGame.none")}
      </Typography>
    </div>
  );
}

/** Settings › Interface "Redefinir notificações suprimidas" (core/10 §1.2, Vortex parity). */
function SuppressedLine() {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const suppressions = useSuppressions();
  const count = suppressions.status === "ready" ? suppressions.data.length : 0;
  const reset = async () => {
    const result = await run(() => backend.resetSuppressedDiagnostics());
    if (result.ok) addToast({ title: tp("settings.suppressed.done", result.value), variant: "success", duration: 3000 });
  };
  if (suppressions.status !== "ready") return null;
  return (
    <SettingLine label={t("settings.suppressed.title")} description={tp("settings.suppressed.description", count)}>
      <Button size="sm" variant="outline" disabled={count === 0} startIcon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void reset()}>
        {t("settings.suppressed.reset")}
      </Button>
    </SettingLine>
  );
}

/**
 * Interface › Dashboard (ui.dashboard.dashlets): show or hide each dashlet;
 * the order is changed in Dashboard › Personalizar. The layout rules
 * (first steps hiding itself, attention locked) are the backend's.
 */
function DashboardSection() {
  const { t } = useI18n();
  const settings = useSettings();
  const setting = settings.get("ui.dashboard.dashlets");
  const { navigate } = useNavigation();
  if (!setting) return null;
  const items = parseLayout(setting.value, setting.options ?? []);
  const toggle = (id: string, on: boolean) => {
    const next = items.map((it) => (it.id === id ? { id, mode: on ? (id === "first_steps" ? "+" : "") : "-" } : it));
    void settings.set(setting.key, next.map((it) => it.mode + it.id).join(","));
  };
  return (
    <SettingsSection
      id="dashboard"
      title={t("settings.section.dashboard")}
      description={t("settings.ui.dashboard.dashlets.description")}
      actions={
        <div className="flex gap-2">
          {!setting.isDefault ? (
            <Button size="sm" variant="ghost" startIcon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void settings.reset(setting.key)}>
              {t("settings.reset")}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => navigate({ view: "dashboard", customize: true })}>
            {t("dashboard.customize")}
          </Button>
        </div>
      }
    >
      {items.map((it) => (
        <SettingLine key={it.id} label={t(`dashboard.dashlet.${it.id}` as MessageKey)}>
          <Switch checked={it.mode !== "-"} aria-label={t(`dashboard.dashlet.${it.id}` as MessageKey)} onCheckedChange={(on) => toggle(it.id, on)} />
        </SettingLine>
      ))}
    </SettingsSection>
  );
}

/** Reads the list value of ui.dashboard.dashlets for display ("-id" hidden, "+id" pinned). */
function parseLayout(value: string, options: string[]): { id: string; mode: "" | "-" | "+" }[] {
  const out: { id: string; mode: "" | "-" | "+" }[] = [];
  for (const raw of value.split(",").map((s) => s.trim()).filter(Boolean)) {
    const mode = raw[0] === "-" || raw[0] === "+" ? (raw[0] as "-" | "+") : "";
    const id = mode ? raw.slice(1) : raw;
    if (options.includes(id) && !out.some((o) => o.id === id)) out.push({ id, mode });
  }
  for (const id of options) if (!out.some((o) => o.id === id)) out.push({ id, mode: "" });
  return out;
}

function ApplicationTab() {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const settings = useSettings();
  const dataDir = settings.get("app.dataDir");
  return (
    <Stack gap="lg" className="max-w-3xl">
      <SettingsSection id="data" title={t("settings.section.data")}>
        {dataDir ? (
          <SettingLine {...settingLabel(i18n, "app.dataDir")}>
            <span className="max-w-xs break-all font-mono text-xs text-fg">{dataDir.value}</span>
            <Button size="sm" variant="ghost" startIcon={<FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.openDataFolder())}>
              {t("settings.open")}
            </Button>
          </SettingLine>
        ) : null}
      </SettingsSection>
      <SettingsSection
        id="log"
        title={t("settings.section.log")}
        actions={
          <Button size="sm" variant="ghost" startIcon={<ScrollText aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.openLogFolder())}>
            {t("settings.openLogFolder")}
          </Button>
        }
      >
        <AppSettingRows keys={["app.logLevel", "app.anonymizeSupportBundle"]} />
      </SettingsSection>
      <SettingsSection id="performance" title={t("settings.section.performance")}>
        <AppSettingRows keys={["app.gpuAcceleration"]} />
      </SettingsSection>
      <SettingsSection id="history" title={t("settings.section.history")}>
        <AppSettingRows keys={["history.retentionDays", "snapshots.autoRetention", "snapshots.bulkThreshold"]} />
      </SettingsSection>
    </Stack>
  );
}

function ModsTab({ games, instance, onInstance }: { games: readonly ManagedGame[]; instance: string; onInstance: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <Stack gap="lg" className="max-w-3xl">
      {games.length > 0 && instance ? (
        <>
          <GameSettingsSelect games={games} value={instance} onChange={onInstance} />
          <GameFoldersSection instance={instance} />
          <DeployInstanceSection instance={instance} />
        </>
      ) : (
        <Alert.Root variant="info">
          <Alert.Description>{t("settings.perGame.none")}</Alert.Description>
        </Alert.Root>
      )}
      <SettingsSection id="import" title={t("settings.section.import")}>
        <AppSettingRows keys={["mods.importRetention", "mods.useSuggestedStaging", "library.verifyStagingOnStartup", "import.maxExtractedSizeGB", "import.maxEntries"]} />
      </SettingsSection>
      <SettingsSection id="order" title={t("settings.section.order")}>
        <AppSettingRows keys={["order.snapshotMoveThreshold"]} />
      </SettingsSection>
    </Stack>
  );
}

function DeployInstanceSection({ instance }: { instance: string }) {
  const settings = useInstanceSettings(instance);
  return (
    <DeployMethodSection instance={instance}>
      {settings.status === "ready" ? <InstanceSettingRows instance={instance} settings={settings.data} keys={["deploy.cleanEmptyDirs", "deploy.autoRestoreMissing"]} onSaved={settings.reload} /> : null}
      <AppSettingRows keys={["deploy.verifyOnFocus"]} />
    </DeployMethodSection>
  );
}
