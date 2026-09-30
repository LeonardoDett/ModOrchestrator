import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Alert, Badge, Button, Input, Spinner, Stack, Tabs } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import type { UIError } from "../bridge/errors";
import type { Setting } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { PageBody } from "./PageBody";

/**
 * Settings (ui/telas/settings-extensions.md, core/13) in the Vortex tab
 * order. F2 exposes the presentation settings (language and theme); the
 * rest of the catalog arrives in F12 with the features it controls, and
 * tabs appear only when they have content.
 */
const TABS: { id: string; label: MessageKey; keys: string[] }[] = [
  { id: "interface", label: "settings.tab.interface", keys: ["ui.language"] },
  { id: "theme", label: "settings.tab.theme", keys: ["theme.mode", "theme.id", "theme.density"] },
];

export function SettingsPage() {
  const { t } = useI18n();
  const settings = useSettings();

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
      <Tabs.Root defaultValue="interface">
        <Tabs.List>
          {TABS.map((tab) => (
            <Tabs.Trigger key={tab.id} value={tab.id}>
              {t(tab.label)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TABS.map((tab) => (
          <Tabs.Panel key={tab.id} value={tab.id} className="pt-4">
            <Stack gap="md" className="max-w-2xl">
              {tab.keys.map((key) => {
                const setting = settings.get(key);
                return setting ? <SettingRow key={key} setting={setting} /> : null;
              })}
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </PageBody>
  );
}

function optionLabel(i18n: ReturnType<typeof useI18n>, setting: Setting, option: string): string {
  const key = setting.key === "ui.language" ? `language.${option}` : `settings.${setting.key}.${option}`;
  return i18n.has(key) ? i18n.t(key) : option;
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
