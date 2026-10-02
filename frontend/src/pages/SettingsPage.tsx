import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Alert, Badge, Button, Input, Spinner, Stack, Switch, Tabs, Typography, useToast } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { useBackend } from "../bridge/backend-context";
import { useSuppressions, useWorkspace } from "../bridge/queries";
import { useAction } from "../features/games/use-action";
import { useNavigation } from "../shell/navigation";
import { DeploySettings } from "../features/deploy/DeploySettings";
import type { UIError } from "../bridge/errors";
import type { Setting } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { PageBody } from "./PageBody";

/**
 * Settings (ui/telas/settings-extensions.md, core/13) in the Vortex tab
 * order. F2 exposes the presentation settings (language and theme), F7 the
 * Mods tab of the active game (folders and deploy); the rest of the
 * catalog arrives in F12, and tabs appear only when they have content.
 */
const TABS: { id: string; label: MessageKey; keys: string[] }[] = [
  { id: "interface", label: "settings.tab.interface", keys: ["ui.language", "ui.desktopNotifications"] },
  { id: "theme", label: "settings.tab.theme", keys: ["theme.mode", "theme.id", "theme.density"] },
];

export function SettingsPage() {
  const { t } = useI18n();
  const { route } = useNavigation();
  const settings = useSettings();
  const workspace = useWorkspace();
  const active = workspace.status === "ready" ? (workspace.data.active?.id ?? "") : "";

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

  return (
    <PageBody>
      <Tabs.Root defaultValue={route.settingsTab === "mods" && active ? "mods" : "interface"}>
        <Tabs.List>
          {TABS.map((tab) => (
            <Tabs.Trigger key={tab.id} value={tab.id}>
              {t(tab.label)}
            </Tabs.Trigger>
          ))}
          {active ? <Tabs.Trigger value="mods">{t("settings.tab.mods")}</Tabs.Trigger> : null}
        </Tabs.List>
        {TABS.map((tab) => (
          <Tabs.Panel key={tab.id} value={tab.id} className="pt-4">
            <Stack gap="md" className="max-w-2xl">
              {tab.keys.map((key) => {
                const setting = settings.get(key);
                return setting ? <SettingRow key={key} setting={setting} /> : null;
              })}
              {tab.id === "interface" ? <SuppressedRow /> : null}
            </Stack>
          </Tabs.Panel>
        ))}
        {active ? (
          <Tabs.Panel value="mods" className="pt-4">
            <DeploySettings instance={active} />
          </Tabs.Panel>
        ) : null}
      </Tabs.Root>
    </PageBody>
  );
}

function optionLabel(i18n: ReturnType<typeof useI18n>, setting: Setting, option: string): string {
  const key = setting.key === "ui.language" ? `language.${option}` : `settings.${setting.key}.${option}`;
  return i18n.has(key) ? i18n.t(key) : option;
}

/** Settings › Interface "Redefinir notificações suprimidas" (core/10 §1.2, Vortex parity). */
function SuppressedRow() {
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
    <div className="rounded-xl border border-border bg-surface p-4">
      <Stack gap="sm">
        <Typography variant="label">{t("settings.suppressed.title")}</Typography>
        <Typography variant="body-sm" color="muted-fg">
          {tp("settings.suppressed.description", count)}
        </Typography>
        <div>
          <Button size="sm" variant="outline" disabled={count === 0} startIcon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void reset()}>
            {t("settings.suppressed.reset")}
          </Button>
        </div>
      </Stack>
    </div>
  );
}

function SettingRow({ setting }: { setting: Setting }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { set, reset } = useSettings();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UIError | null>(null);
  const label = `settings.${setting.key}.label`;
  const description = `settings.${setting.key}.description`;

  const apply = async (call: () => Promise<UIError | null>) => {
    setPending(true);
    setError(await call());
    setPending(false);
  };

  if (setting.type === "bool") {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <Stack gap="sm">
          <Switch
            checked={setting.value === "true"}
            disabled={pending}
            label={i18n.has(label) ? t(label) : setting.key}
            description={i18n.has(description) ? t(description) : undefined}
            onCheckedChange={(on) => void apply(() => set(setting.key, String(on)))}
          />
          {error ? <ErrorAlert title="settings.saveError" error={error} /> : null}
        </Stack>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <Stack gap="sm">
        <Input.Root
          name={setting.key}
          fullWidth
          disabled={pending}
          value={setting.value}
          onChange={(value: string) => void apply(() => set(setting.key, value))}
        >
          <div className="flex items-center justify-between gap-2">
            <Input.Label>{i18n.has(label) ? t(label) : setting.key}</Input.Label>
            <div className="flex items-center gap-2">
              {pending ? <Spinner size="sm" label={t("common.loading")} /> : null}
              {setting.isDefault ? (
                <Badge variant="muted">{t("settings.default")}</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  startIcon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
                  onClick={() => void apply(() => reset(setting.key))}
                >
                  {t("settings.reset")}
                </Button>
              )}
            </div>
          </div>
          <Input.Box>
            <Input.Select options={(setting.options ?? []).map((option) => ({ value: option, label: optionLabel(i18n, setting, option) }))} />
          </Input.Box>
          {i18n.has(description) ? <Input.HelperText>{t(description)}</Input.HelperText> : null}
        </Input.Root>
        {error ? <ErrorAlert title="settings.saveError" error={error} /> : null}
      </Stack>
    </div>
  );
}
