import { useState } from "react";
import { CheckIcon, FolderOpenIcon, LockIcon, MinusIcon, ScanSearchIcon, TriangleAlertIcon } from "dettmann-ui/icons";
import { Button, Switch, Tabs, Tag, useToast } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useInstanceDetails, useInstanceFeatures } from "../bridge/queries";
import type { InstanceFeature, InstanceFolder, ManagedGame } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useStoreLabel } from "../features/games/GameDetails";
import { gameInitials } from "../features/games/GameSwitcher";
import { RelocateDialog, RenameDialog } from "../features/games/InstanceDialogs";
import { useAction } from "../features/games/use-action";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID, VIEWS, isWorkspaceView, useNavigation, type WorkspaceViewId } from "../shell/navigation";
import { LoadingState, WorkspaceGate } from "./PageBody";

type SettingsTab = "general" | "features" | "folders" | "deploy";

/** Screens every game has, whatever its features. */
const ALWAYS: readonly WorkspaceViewId[] = ["mods", "conflicts", "profiles"];

/**
 * Ajustes da instância (D127, board JogoAjustesRecursos): tabs Geral,
 * Recursos, Pastas and Implantação. Recursos lists the optional features
 * with a switch (and why one is blocked), the base ones that are always on,
 * and how the game menu looks; everything comes from InstanceFeatures, so a
 * `generic` game shows only what it offers.
 */
export function InstanceSettingsPage() {
  return <WorkspaceGate>{(instance) => <InstanceSettings instance={instance} />}</WorkspaceGate>;
}

function InstanceSettings({ instance }: { instance: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>("features");
  const details = useInstanceDetails(instance);
  const game = details.status === "ready" ? details.data : null;
  return (
    <main id={MAIN_ID} tabIndex={-1} className="flex min-h-0 flex-1 flex-col px-7 focus:outline-none">
      <div className="flex shrink-0 flex-col gap-3.5 border-b border-border pt-5.5">
        <h1 className="text-2xl font-semibold text-fg">{t("nav.instanceSettings")}</h1>
        <Tabs.Root size="sm" value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
          <Tabs.List aria-label={t("instanceSettings.sections")}>
            <Tabs.Trigger value="general">{t("instanceSettings.tab.general")}</Tabs.Trigger>
            <Tabs.Trigger value="features">{t("instanceSettings.tab.features")}</Tabs.Trigger>
            <Tabs.Trigger value="folders">{t("instanceSettings.tab.folders")}</Tabs.Trigger>
            <Tabs.Trigger value="deploy">{t("instanceSettings.tab.deploy")}</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>
      {details.status === "loading" ? <LoadingState /> : null}
      {details.status === "error" ? (
        <div className="py-5">
          <ErrorAlert title="games.loadError" error={details.error} onRetry={details.reload} />
        </div>
      ) : null}
      {game && tab === "features" ? <Features game={game} /> : null}
      {game && tab === "general" ? <General game={game} /> : null}
      {game && tab === "folders" ? <Folders game={game} /> : null}
      {game && tab === "deploy" ? <Deployment game={game} /> : null}
    </main>
  );
}

/** "Recursos" (board JogoAjustesRecursos). */
function Features({ game }: { game: ManagedGame }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const store = useStoreLabel();
  const { navigate } = useNavigation();
  const features = useInstanceFeatures(game.id);
  if (features.status === "error") return <ErrorAlert title="games.loadError" error={features.error} onRetry={features.reload} />;
  if (features.status !== "ready") return <LoadingState />;
  const list = features.data;
  // The backend sends the features in the order of the board and names the
  // screen each one brings to the game menu (D132).
  const optional = list.filter((f) => f.class === "optional");
  const base = list.filter((f) => f.class !== "optional" && f.status === "available");
  const name = (id: string) => (i18n.has(`capability.${id}`) ? t(`capability.${id}` as MessageKey) : id);
  const set = (f: InstanceFeature, on: boolean) => void run(() => backend.setInstanceFeature(game.id, f.id, on));
  const byId = new Map(list.map((f) => [f.id, f]));
  const blocked = optional.filter((f) => f.status === "available" && f.enabled && !f.effective && f.blockedBy.length > 0);

  const state = (f: InstanceFeature): { key: MessageKey; intent?: "success" | "warning"; icon?: typeof CheckIcon } => {
    if (f.status !== "available") return { key: "instanceSettings.state.notApplicable" };
    if (f.effective) return { key: "instanceSettings.state.on", intent: "success", icon: CheckIcon };
    if (f.enabled && f.blockedBy.length > 0) return { key: "instanceSettings.state.blocked", intent: "warning", icon: TriangleAlertIcon };
    return { key: "instanceSettings.state.off" };
  };

  const menu: { id: string; label: string; on: boolean; note: MessageKey }[] = [
    ...ALWAYS.map((v) => ({ id: v, label: t(`nav.${v}` as MessageKey), on: true, note: "instanceSettings.menu.always" as MessageKey })),
    ...list.flatMap((f) => {
      if (f.status !== "available" || !f.screen || !isWorkspaceView(f.screen)) return [];
      return [{ id: f.id, label: t(VIEWS[f.screen].label), on: f.effective, note: state(f).key }];
    }),
  ];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-6 overflow-auto py-5">
      <div className="flex min-w-0 flex-col gap-4.5">
        <section className="flex items-center gap-3.5 rounded-card border border-border bg-surface px-4 py-3.5">
          <span data-intent="brand" className="flex size-10 shrink-0 items-center justify-center rounded-control border border-intent-border bg-intent-subtle text-xs font-bold text-intent-text">
            {gameInitials(game.gameName || game.name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.75">
            <span className="flex items-center gap-2">
              <span className="truncate text-[0.9375rem] font-semibold text-fg">{game.custom ? game.name : game.gameName}</span>
              <Tag size="sm" outline={false} intent={game.custom ? "neutral" : "success"} {...(game.custom ? {} : { icon: CheckIcon })}>
                {t(game.custom ? "instanceSettings.support.custom" : "instanceSettings.support.builtIn")}
              </Tag>
            </span>
            <span className="truncate text-xs text-fg-muted">{[store(game.store), t("instanceSettings.support.adapter", { adapter: game.adapter })].filter(Boolean).join(" · ")}</span>
          </div>
          <Button size="inline" emphasis="low" intent="brand" onClick={() => navigate({ view: "games" })}>
            {t("instanceSettings.support.seeSupported")}
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-fg">{t("instanceSettings.optional")}</h2>
            <span className="text-xs text-fg-muted">{t("instanceSettings.optionalHelp")}</span>
          </div>
          <ul className="overflow-hidden rounded-card border border-border bg-surface">
            {optional.map((f) => {
              const s = state(f);
              let detail = t(`instanceSettings.detail.${f.id}` as MessageKey);
              if (!i18n.has(`instanceSettings.detail.${f.id}`)) detail = "";
              if (f.requires.length > 0) detail = `${detail} ${t("instanceSettings.dependsOn", { features: f.requires.map(name).join(", ") })}`.trim();
              return (
                <li key={f.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto_2.25rem] items-center gap-3.5 border-b border-border-subtle px-4 py-3 last:border-b-0">
                  <span className="flex size-8 items-center justify-center rounded-control border border-border-subtle bg-sunken text-fg-muted">
                    <FeatureGlyph on={f.effective} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-fg">{name(f.id)}</span>
                    {detail ? <span className="truncate text-xs text-fg-muted">{detail}</span> : null}
                  </span>
                  <Tag size="sm" outline={false} {...(s.intent ? { intent: s.intent } : {})} {...(s.icon ? { icon: s.icon } : {})}>
                    {t(s.key)}
                  </Tag>
                  {f.status === "available" ? (
                    <Switch
                      size="sm"
                      checked={f.enabled}
                      aria-label={t(f.enabled ? "instanceSettings.turnOff" : "instanceSettings.turnOn", { name: name(f.id) })}
                      onCheckedChange={(on) => set(f, on)}
                    />
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {base.length > 0 ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-fg">{t("instanceSettings.base")}</h2>
              <span className="text-xs text-fg-muted">{t("instanceSettings.baseHelp")}</span>
            </div>
            <ul className="grid grid-cols-4 gap-2.5">
              {base.map((f) => (
                <li key={f.id} className="flex items-center gap-2.5 rounded-control border border-border-subtle bg-surface px-3 py-2.5 text-[0.8125rem] text-fg">
                  <span className="text-fg-muted">
                    <LockIcon size="sm" />
                  </span>
                  <span className="truncate">{name(f.id)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside aria-label={t("instanceSettings.menuTitle")} className="flex min-w-0 flex-col gap-3.5">
        <div className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">{t("instanceSettings.menuTitle")}</h3>
          {menu.map((m) => (
            <div key={m.id} className={`flex items-center gap-2.5 text-[0.8125rem] ${m.on ? "text-fg" : "text-fg-muted"}`}>
              <span data-intent={m.on ? "success" : undefined} className={m.on ? "text-intent-text" : "text-fg-subtle"}>
                {m.on ? <CheckIcon size="sm" /> : <MinusIcon size="sm" />}
              </span>
              <span className="flex-1">{m.label}</span>
              <span className="text-xs text-fg-muted">{t(m.note)}</span>
            </div>
          ))}
        </div>
        {blocked.map((f) => {
          const missing = f.blockedBy.map((id) => byId.get(id)).filter((x): x is InstanceFeature => Boolean(x));
          return (
            <div key={f.id} data-intent="warning" className="flex items-start gap-2.5 rounded-card border border-intent-border bg-intent-subtle px-4 py-3.5">
              <span className="mt-0.5 text-intent-text">
                <TriangleAlertIcon size="sm" />
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-[0.8125rem] leading-normal text-fg">{t("instanceSettings.blockedText", { name: name(f.id), needs: f.blockedBy.map(name).join(", ") })}</p>
                {missing.map((m) =>
                  m.status === "available" ? (
                    <Button key={m.id} size="sm" emphasis="high" intent="warning" className="self-start" onClick={() => set(m, true)}>
                      {t("instanceSettings.turnOnShort", { name: name(m.id) })}
                    </Button>
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}

function FeatureGlyph({ on }: { on: boolean }) {
  return on ? <CheckIcon size="sm" /> : <MinusIcon size="sm" />;
}

/** A label and a value in a settings list. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[12rem_minmax(0,1fr)] items-center gap-4 border-b border-border-subtle px-4 py-3 text-[0.8125rem] last:border-b-0">
      <span className="text-fg-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-fg">{children}</span>
    </div>
  );
}

/** "Geral": the name of the instance, the game, store and version. */
function General({ game }: { game: ManagedGame }) {
  const { t } = useI18n();
  const store = useStoreLabel();
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="flex max-w-3xl flex-col gap-4 py-5">
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <Row label={t("instanceSettings.field.name")}>
          <span className="flex-1 truncate">{game.name}</span>
          <Button size="sm" onClick={() => setRenaming(true)}>
            {t("games.action.rename")}
          </Button>
        </Row>
        <Row label={t("instanceSettings.field.game")}>{game.custom ? t("games.generic") : game.gameName}</Row>
        <Row label={t("instanceSettings.field.store")}>{store(game.store) || t("common.empty")}</Row>
        <Row label={t("instanceSettings.field.version")}>{game.version || t("common.empty")}</Row>
      </div>
      <RenameDialog game={renaming ? game : null} onClose={() => setRenaming(false)} />
    </div>
  );
}

/** "Pastas": the folders of the instance, each with "Abrir"; "Alterar localização…" moves them. */
function Folders({ game }: { game: ManagedGame }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [relocating, setRelocating] = useState(false);
  const rows: { folder: InstanceFolder; label: MessageKey; path: string }[] = [
    { folder: "game", label: "instanceSettings.field.root", path: game.root },
    { folder: "staging", label: "instanceSettings.field.staging", path: game.staging },
    { folder: "archives", label: "instanceSettings.field.archives", path: game.archiveStore },
    { folder: "backups", label: "instanceSettings.field.backups", path: game.backupStore },
  ];
  return (
    <div className="flex max-w-4xl flex-col gap-4 py-5">
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {rows.map((r) => (
          <Row key={r.folder} label={t(r.label)}>
            <span className="flex-1 truncate font-mono text-xs" title={r.path}>
              {r.path}
            </span>
            <Button size="sm" startIcon={<FolderOpenIcon size="sm" />} onClick={() => void run(() => backend.openInstanceFolder(game.id, r.folder))}>
              {t("instanceSettings.open")}
            </Button>
          </Row>
        ))}
      </div>
      <Button className="self-start" onClick={() => setRelocating(true)}>
        {t("games.action.relocate")}
      </Button>
      <RelocateDialog game={relocating ? game : null} onClose={() => setRelocating(false)} />
    </div>
  );
}

/** "Implantação": how mods reach the game folder, and "Verificar implantação". */
function Deployment({ game }: { game: ManagedGame }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const verify = async () => {
    const r = await run(() => backend.verifyDeployment(game.id));
    if (r.ok) {
      const n = r.value.changeCount + r.value.newFileCount;
      addToast({ title: n === 0 ? t("settings.workarounds.verifyClean") : tp("settings.workarounds.verifyFound", n), variant: n === 0 ? "success" : "warning", duration: 4000 });
    }
  };
  const method = i18n.has(`deploy.method.${game.method}`) ? t(`deploy.method.${game.method}` as MessageKey) : game.method;
  return (
    <div className="flex max-w-3xl flex-col gap-4 py-5">
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <Row label={t("instanceSettings.field.method")}>{method}</Row>
        <Row label={t("instanceSettings.field.targets")}>{game.targets.map((tg) => tg.id).join(", ")}</Row>
      </div>
      <Button className="self-start" startIcon={<ScanSearchIcon size="sm" />} onClick={() => void verify()}>
        {t("deploy.action.verify")}
      </Button>
    </div>
  );
}
