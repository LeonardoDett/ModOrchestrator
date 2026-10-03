import { useState, type ReactNode } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Alert, Badge, Button, Input, Spinner, Stack, Switch, Typography } from "dettmann-ui";
import { useSettings } from "../../app/settings-context";
import { useBackend } from "../../bridge/backend-context";
import type { UIError } from "../../bridge/errors";
import { useRestartState } from "../../bridge/queries";
import type { ManagedGame, Setting } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";

/**
 * Building blocks of Settings (ui/telas/settings-extensions.md): sections
 * with a title, and rows "label + short description + control" chosen by
 * the setting type (switch for bool, select for fixed options, numeric
 * stepper for limits). Values are applied on change, without a Save button;
 * the backend validates every value (core/13).
 */
export function SettingsSection({ id, title, description, children, actions }: { id: string; title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-labelledby={`settings-${id}`} className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <Typography id={`settings-${id}`} variant="heading-6" color="fg">
            {title}
          </Typography>
          {description ? (
            <Typography variant="body-sm" color="muted-fg">
              {description}
            </Typography>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

/** A row with a label, a description and any control on the right. */
export function SettingLine({ label, description, children, badge }: { label: string; description?: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-2">
          <Typography variant="body-sm" className="font-medium">
            {label}
          </Typography>
          {badge}
        </div>
        {description ? (
          <Typography variant="caption" color="muted-fg">
            {description}
          </Typography>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function settingLabel(i18n: ReturnType<typeof useI18n>, key: string): { label: string; description?: string } {
  const label = `settings.${key}.label`;
  const description = `settings.${key}.description`;
  return { label: i18n.has(label) ? i18n.t(label) : key, description: i18n.has(description) ? i18n.t(description) : undefined };
}

function optionLabel(i18n: ReturnType<typeof useI18n>, setting: Setting, option: string): string {
  const key = setting.key === "ui.language" ? `language.${option}` : `settings.${setting.key}.${option}`;
  return i18n.has(key) ? i18n.t(key) : option;
}

/**
 * One catalog setting with the control of its type. `save` and `reset`
 * persist in the backend and resolve with the error, if any.
 */
export function SettingRow({ setting, save, reset }: { setting: Setting; save: (value: string) => Promise<UIError | null>; reset: () => Promise<UIError | null> }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UIError | null>(null);
  const { label, description } = settingLabel(i18n, setting.key);

  const apply = async (call: () => Promise<UIError | null>) => {
    setPending(true);
    setError(await call());
    setPending(false);
  };

  let control: ReactNode;
  switch (setting.type) {
    case "bool":
      control = <Switch checked={setting.value === "true"} disabled={pending} aria-label={label} onCheckedChange={(on) => void apply(() => save(String(on)))} />;
      break;
    case "int":
      control = (
        <Input.Root name={setting.key} disabled={pending} value={setting.value} onChange={(v: string) => void apply(() => save(v))} className="w-40">
          <Input.Box>
            <Input.Number aria-label={label} min={setting.min} max={setting.max} decrementLabel={t("settings.decrease")} incrementLabel={t("settings.increase")} />
          </Input.Box>
        </Input.Root>
      );
      break;
    case "enum":
      control = (
        <Input.Root name={setting.key} disabled={pending} value={setting.value} onChange={(v: string) => void apply(() => save(v))} className="w-56">
          <Input.Box>
            <Input.Select aria-label={label} options={(setting.options ?? []).map((o) => ({ value: o, label: optionLabel(i18n, setting, o) }))} />
          </Input.Box>
        </Input.Root>
      );
      break;
    default:
      control = <span className="break-all font-mono text-xs text-fg">{setting.value}</span>;
  }

  return (
    <div>
      <SettingLine
        label={label}
        description={description}
        badge={
          <>
            {setting.restartRequired ? <Badge variant="muted">{t("settings.restartBadge")}</Badge> : null}
            {setting.advanced ? <Badge variant="outline">{t("settings.advancedBadge")}</Badge> : null}
          </>
        }
      >
        {pending ? <Spinner size="sm" label={t("common.loading")} /> : null}
        {setting.type !== "bool" && !setting.isDefault ? (
          <Button size="icon-sm" variant="ghost" aria-label={t("settings.reset")} title={t("settings.reset")} disabled={pending} onClick={() => void apply(reset)}>
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {control}
      </SettingLine>
      {error ? (
        <div className="px-4 pb-3">
          <ErrorAlert title="settings.saveError" error={error} />
        </div>
      ) : null}
    </div>
  );
}

/** App-scoped settings by key, in the order given; advanced ones only in advanced mode. */
export function AppSettingRows({ keys }: { keys: string[] }) {
  const settings = useSettings();
  const advanced = settings.get("ui.advancedMode")?.value === "true";
  return (
    <>
      {keys.map((key) => {
        const s = settings.get(key);
        if (!s || (s.advanced && !advanced)) return null;
        return <SettingRow key={key} setting={s} save={(v) => settings.set(key, v)} reset={() => settings.reset(key)} />;
      })}
    </>
  );
}

/** Instance-scoped settings of one game, by key, in the order given. */
export function InstanceSettingRows({ instance, settings, keys, onSaved }: { instance: string; settings: readonly Setting[]; keys: string[]; onSaved: () => void }) {
  const backend = useBackend();
  const run = useAction();
  const app = useSettings();
  const advanced = app.get("ui.advancedMode")?.value === "true";
  const call = async (fn: () => Promise<void>): Promise<UIError | null> => {
    const r = await run(fn, { quiet: true });
    onSaved();
    return r.ok ? null : r.error;
  };
  return (
    <>
      {keys.map((key) => {
        const s = settings.find((x) => x.key === key);
        if (!s || (s.advanced && !advanced)) return null;
        return (
          <SettingRow
            key={key}
            setting={s}
            save={(v) => call(() => backend.setInstanceSetting(instance, key, v))}
            reset={() => call(() => backend.setInstanceSetting(instance, key, s.default))}
          />
        );
      })}
    </>
  );
}

/**
 * Select of the managed game whose settings a tab shows ("A maioria das
 * opções aqui é configurada por jogo", Vortex parity).
 */
export function GameSettingsSelect({ games, value, onChange }: { games: readonly ManagedGame[]; value: string; onChange: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-structure px-4 py-3">
      <Input.Root name="settings-game" value={value} onChange={(v: string) => onChange(v)} className="w-72">
        <Input.Label>{t("settings.perGame.label")}</Input.Label>
        <Input.Box>
          <Input.Select options={games.map((g) => ({ value: g.id, label: g.name }))} />
        </Input.Box>
      </Input.Root>
      <Typography variant="body-sm" color="muted-fg" className="min-w-0 flex-1">
        {t("settings.perGame.hint")}
      </Typography>
    </div>
  );
}

/**
 * Persistent notice while a restart-required setting changed or a database
 * restore waits, with "Reiniciar agora" (core/13, core/14 §4).
 */
export function RestartBanner() {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const state = useRestartState();
  if (state.status !== "ready" || (state.data.settings.length === 0 && !state.data.restore)) return null;
  const names = state.data.settings.map((k) => settingLabel(i18n, k).label).join(", ");
  return (
    <Alert.Root variant="warning">
      <Alert.Title>{t("settings.restart.title")}</Alert.Title>
      <Alert.Description>
        <Stack gap="xs">
          {state.data.settings.length > 0 ? <span>{t("settings.restart.settings", { names })}</span> : null}
          {state.data.restore ? <span>{t("settings.restart.restore")}</span> : null}
          <div>
            <Button size="sm" startIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void run(() => backend.restartApp())}>
              {t("settings.restart.now")}
            </Button>
          </div>
        </Stack>
      </Alert.Description>
    </Alert.Root>
  );
}
