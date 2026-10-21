import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { CheckIcon, FolderOpenIcon, UndoIcon } from "dettmann-ui/icons";
import { Alert, Button, Input, Loader, ResourcePage, Stack, Switch, Tabs, Typography, useToast, Icon } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { useBackend } from "../bridge/backend-context";
import { useGamesView, useInstanceSettings, useSettingsTabs, useSuppressions, useWorkspace } from "../bridge/queries";
import type { ManagedGame, SettingsTab } from "../bridge/types";
import { DeployMethodSection, GameFoldersSection } from "../features/deploy/DeploySettings";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { AppSettingRows, GameSettingsSelect, InstanceSettingRows, RestartBanner, SettingLine, SettingsSection, settingLabel } from "../features/settings/SettingControls";
import { UpdateSection } from "../features/settings/UpdateSection";
import { LootSection } from "../features/plugins/LootSection";
import { WorkaroundsTab } from "../features/settings/WorkaroundsTab";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";
import { LoadingState, PageBody } from "./PageBody";
import { useRefresh } from "../bridge/use-backend-query";

/**
 * Settings (ui/telas/settings-extensions.md, core/13) in the Vortex tab
 * order: Interface · Aplicação · Mods · Plugins* · Workarounds · Tema.
 * The backend lists the tabs (D135): the core ones and the ones optional
 * modules contribute (* Plugins, from the plugins module). A tab gated by a
 * section is shown while a managed game offers that section, and its game
 * select lists only those games. Download is reserved and never listed
 * (D013). The core tabs keep their layout from the board; a module tab
 * shows its settings for the chosen game. Values, defaults and validation
 * come from the backend catalog.
 */
export function SettingsPage() {
  const i18n = useI18n();
  const { t } = i18n;
  const { route } = useNavigation();
  const settings = useSettings();
  const { refresh } = useRefresh();
  const workspace = useWorkspace();
  const gamesView = useGamesView(false);
  const tabsQuery = useSettingsTabs();
  const games: ManagedGame[] = gamesView.status === "ready" ? gamesView.data.managed : [];
  const active = workspace.status === "ready" ? (workspace.data.active?.id ?? "") : "";
  const [instance, setInstance] = useState("");
  const selected = games.some((g) => g.id === instance) ? instance : games.some((g) => g.id === active) ? active : (games[0]?.id ?? "");
  const gamesOf = (tab: SettingsTab) => (tab.section ? games.filter((g) => g.sections?.includes(tab.section!)) : games);
  const tabs = (tabsQuery.status === "ready" ? tabsQuery.data : []).filter((tab) => !tab.section || gamesOf(tab).length > 0);
  const [tab, setTab] = useState<string>(route.settingsTab ?? "interface");

  useEffect(() => {
    if (route.settingsTab) setTab(route.settingsTab);
  }, [route.settingsTab]);

  if (settings.status === "loading" || tabsQuery.status === "loading") return <PageBody><LoadingState /></PageBody>;
  if (settings.status === "unavailable") {
    return (
      <PageBody>
        <Alert.Root intent="info">
          <Alert.Description>{t("settings.offline")}</Alert.Description>
        </Alert.Root>
      </PageBody>
    );
  }
  if (settings.status === "error" && settings.error) {
    return (
      <PageBody>
        <ErrorAlert title="settings.loadError" error={settings.error} onRetry={refresh} />
      </PageBody>
    );
  }
  if (tabsQuery.status === "error") {
    return (
      <PageBody>
        <ErrorAlert title="settings.loadError" error={tabsQuery.error} onRetry={tabsQuery.reload} />
      </PageBody>
    );
  }

  const current = tabs.some((x) => x.id === tab) ? tab : (tabs[0]?.id ?? "");
  const panel = (tab: SettingsTab) => {
    switch (tab.id) {
      case "interface":
        return <InterfaceTab games={games} instance={selected} onInstance={setInstance} />;
      case "application":
        return <ApplicationTab />;
      case "mods":
        return <ModsTab games={games} instance={selected} onInstance={setInstance} />;
      case "workarounds":
        return (
          <div className="max-w-3xl">
            <WorkaroundsTab games={games} instance={selected} onInstance={setInstance} />
          </div>
        );
      case "theme":
        return (
          <div className="max-w-3xl">
            <SettingsSection id="theme" title={t("settings.theme.title")}>
              <AppSettingRows keys={["theme.mode", "theme.id", "theme.fontScale", "theme.density"]} />
            </SettingsSection>
          </div>
        );
      default:
        return <ModuleTab tab={tab.id} games={gamesOf(tab)} instance={selected} onInstance={setInstance} />;
    }
  };

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      className="focus:outline-none"
      title={t("nav.settings")}
      primaryActions={
        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
          <CheckIcon size="sm" className="text-success" />
          {t("settings.instantNote")}
        </span>
      }
    >
      <Stack gap="md" className="min-h-0 flex-1 overflow-auto pb-6">
        <RestartBanner />
        <Tabs.Root value={current} onValueChange={setTab}>
          <Tabs.List>
            {tabs.map((x) => (
              <Tabs.Trigger key={x.id} value={x.id}>
                {i18nOr(`settings.tab.${x.id}`, x.id)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {tabs.map((x) => (
            <Tabs.Panel key={x.id} value={x.id} className="pt-4">
              {panel(x)}
            </Tabs.Panel>
          ))}
        </Tabs.Root>
      </Stack>
    </ResourcePage>
  );

  function i18nOr(key: string, fallback: string) {
    return i18n.has(key) ? i18n.t(key as MessageKey) : fallback;
  }
}

/**
 * A tab a module contributes (D135): the game select (only the games the
 * tab applies to) and the module's settings for that game, the app-scoped
 * ones first. Labels come from `settings.<key>.label`.
 */
function ModuleTab({ tab, games, instance, onInstance }: { tab: string; games: readonly ManagedGame[]; instance: string; onInstance: (id: string) => void }) {
  const i18n = useI18n();
  const settings = useSettings();
  const chosen = games.some((g) => g.id === instance) ? instance : (games[0]?.id ?? "");
  const appKeys = settings.settings.filter((s) => s.tab === tab).map((s) => s.key);
  const title = i18n.has(`settings.${tab}.title`) ? i18n.t(`settings.${tab}.title` as MessageKey) : tab;
  return (
    <Stack gap="lg" className="max-w-3xl">
      <GameSettingsSelect games={games} value={chosen} onChange={onInstance} />
      {appKeys.length > 0 ? (
        <SettingsSection id={`${tab}-app`} title={title}>
          <AppSettingRows keys={appKeys} />
        </SettingsSection>
      ) : null}
      <InstanceSection id={tab} title={title} instance={chosen} tab={tab} />
      {tab === "plugins" ? <LootSection instance={chosen} /> : null}
    </Stack>
  );
}

/** Instance settings of one game in a section. */
function InstanceSection({
  id,
  title,
  instance,
  keys: listed,
  tab,
  children,
  actions,
}: {
  id: string;
  title: string;
  instance: string;
  /** The settings to show; with `tab` instead, every setting of that tab. */
  keys?: string[];
  tab?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  const settings = useInstanceSettings(instance);
  const keys = listed ?? (settings.status === "ready" ? settings.data.filter((s) => s.tab === tab).map((s) => s.key) : []);
  return (
    <SettingsSection id={id} title={title} actions={actions}>
      {settings.status === "loading" ? (
        <div className="px-4 py-3">
          <Loader label={t("common.loading")} />
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

/**
 * Interface (board Configuracoes): two columns of sections. "Idioma e
 * exibição" and "Notificações" on the left; "Automação", with "Vale para
 * [jogo]" in its header (the settings of one game), and "Avançado" on the
 * right.
 */
function InterfaceTab({ games, instance, onInstance }: { games: readonly ManagedGame[]; instance: string; onInstance: (id: string) => void }) {
  const { t } = useI18n();
  const appliesTo =
    games.length > 0 ? (
      <span className="flex items-center gap-2 text-xs text-fg-muted">
        {t("settings.appliesTo")}
        <Input.Root name="settings-game" value={instance} onChange={(v: string) => onInstance(v)} className="w-52">
          <Input.Box padding="sm">
            <Input.Select aria-label={t("settings.appliesTo")} options={games.map((g) => ({ value: g.id, label: g.name }))} />
          </Input.Box>
        </Input.Root>
      </span>
    ) : null;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <SettingsSection id="display" title={t("settings.section.languageDisplay")}>
          <AppSettingRows keys={["ui.language", "ui.relativeTimes", "ui.compactHeaders", "ui.reduceMotion", "ui.customTitleBar"]} />
        </SettingsSection>
        <SettingsSection id="notifications" title={t("settings.section.notifications")}>
          <AppSettingRows keys={["ui.desktopNotifications"]} />
          <SuppressedLine />
        </SettingsSection>
      </div>
      <div className="flex flex-col gap-4">
        {instance ? (
          <InstanceSection
            id="automation"
            title={t("settings.section.automation")}
            instance={instance}
            keys={["automation.deployOnChange", "automation.enableOnInstall", "diagnostics.showUnreviewedConflicts"]}
            actions={appliesTo}
          >
            <AppSettingRows keys={["automation.deployDelayMs"]} />
          </InstanceSection>
        ) : (
          <SettingsSection id="automation" title={t("settings.section.automation")}>
            <AppSettingRows keys={["automation.deployDelayMs"]} />
            <NoGameLine />
          </SettingsSection>
        )}
        <SettingsSection id="advanced" title={t("settings.section.advanced")}>
          <AppSettingRows keys={["ui.advancedMode"]} />
        </SettingsSection>
      </div>
    </div>
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
      <Button size="sm" disabled={count === 0} onClick={() => void reset()}>
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
            <Button size="sm" emphasis="low" startIcon={<UndoIcon size="sm" />} onClick={() => void settings.reset(setting.key)}>
              {t("settings.reset")}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => navigate({ view: "dashboard", customize: true })}>
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
            <Button size="sm" emphasis="low" startIcon={<FolderOpenIcon size="sm" />} onClick={() => void run(() => backend.openDataFolder())}>
              {t("settings.open")}
            </Button>
          </SettingLine>
        ) : null}
      </SettingsSection>
      <SettingsSection
        id="log"
        title={t("settings.section.log")}
        actions={
          <Button size="sm" emphasis="low" startIcon={<Icon icon={ScrollText} size="sm" />} onClick={() => void run(() => backend.openLogFolder())}>
            {t("settings.openLogFolder")}
          </Button>
        }
      >
        <AppSettingRows keys={["app.logLevel", "app.anonymizeSupportBundle"]} />
      </SettingsSection>
      <UpdateSection />
      <DashboardSection />
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
        <Alert.Root intent="info">
          <Alert.Description>{t("settings.perGame.none")}</Alert.Description>
        </Alert.Root>
      )}
      <SettingsSection id="import" title={t("settings.section.import")}>
        <AppSettingRows keys={["mods.importRetention", "mods.useSuggestedStaging", "library.verifyStagingOnStartup", "import.maxExtractedSizeGB", "import.maxEntries"]} />
      </SettingsSection>
      <SettingsSection id="order" title={t("settings.section.order")}>
        <AppSettingRows keys={["order.snapshotMoveThreshold"]} />
      </SettingsSection>
      <SettingsSection id="list" title={t("settings.section.display")}>
        <AppSettingRows keys={["ui.hideTopLevelCategory"]} />
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
