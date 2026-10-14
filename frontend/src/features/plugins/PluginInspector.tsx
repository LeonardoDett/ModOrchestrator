import { useState } from "react";
import { CheckIcon, LockIcon, LockOpenIcon, TrashIcon, XIcon } from "dettmann-ui/icons";
import { Alert, Button, Input, Loader, TagAdd } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { usePluginDetails, usePluginRules } from "../../bridge/queries";
import type { PluginDetails, PluginMaster } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { actionLabel, diagnosticTitle } from "../diagnostics/diagnostic-labels";
import { useDiagnosticAction } from "../diagnostics/use-diagnostic-action";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { originLabel } from "./plugin-labels";

interface PluginPanelProps {
  instance: string;
  name: string;
  onClose: () => void;
}

/** Small uppercase title of a block (boards). */
function BlockTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">{children}</h3>;
}

/**
 * Panel of a plugin (board JogoPlugins): name and origin, the problem,
 * masters with their state and the action that fixes them, the rules it
 * loads after, dependents and position, "Travar posição" and "Ver na
 * ordem". Everything shown is read from the backend; actions are commands
 * that the backend validates.
 */
export function PluginPanel({ instance, name, onClose }: PluginPanelProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const details = usePluginDetails(instance, name);
  const p = details.status === "ready" ? details.data : null;
  let sub = "";
  if (p) {
    const from = p.modName ? t("plugins.panel.from", { mod: p.modName }) : originLabel(i18n, p.origin);
    sub = p.index ? `${from} · ${t("plugins.panel.index", { index: p.index })}` : `${from} · ${t("plugins.inactive")}`;
  }
  return (
    <aside aria-label={t("plugins.panel.label")} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div data-layer="medium" className="flex shrink-0 flex-col gap-1 border-b border-border bg-structure px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="break-all text-[0.9375rem] font-semibold text-fg">{name}</h2>
          <Button size="icon-sm" emphasis="low" aria-label={t("plugins.panel.close")} title={t("plugins.panel.close")} onClick={onClose}>
            <XIcon size="sm" />
          </Button>
        </div>
        {sub ? <span className="text-xs text-fg-muted">{sub}</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {details.status === "loading" ? <Loader label={t("common.loading")} /> : null}
        {details.status === "error" ? (
          <div className="p-4">
            <ErrorAlert title="plugins.loadError" error={details.error} onRetry={details.reload} />
          </div>
        ) : null}
        {p ? <Body instance={instance} p={p} /> : null}
      </div>
    </aside>
  );
}

function Body({ instance, p }: { instance: string; p: PluginDetails }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const act = useDiagnosticAction();
  const { navigate } = useNavigation();
  const rules = usePluginRules(instance);
  const [adding, setAdding] = useState(false);
  const [after, setAfter] = useState("");
  const others = rules.status === "ready" ? rules.data.plugins.filter((n) => n.toLowerCase() !== p.name.toLowerCase()) : [];

  const masterState = (m: PluginMaster) => {
    if (!m.present) return { key: "plugins.master.missing" as const, ok: false };
    if (!m.active) return { key: "plugins.master.inactive" as const, ok: false };
    if (!m.before) return { key: "plugins.master.after" as const, ok: false };
    return { key: "plugins.master.active" as const, ok: true };
  };

  let adder: React.ReactNode;
  if (adding) {
    adder = (
      <div className="flex items-center gap-2">
        <Input.Root value={after} onChange={setAfter} className="min-w-0 flex-1">
          <Input.Select aria-label={t("plugins.rule.after")} placeholder={t("plugins.rule.after")} options={others.map((n) => ({ value: n, label: n }))} />
        </Input.Root>
        <Button
          size="sm"
          disabled={!after}
          onClick={() =>
            void run(() => backend.createPluginRule(instance, p.name, after)).then((r) => {
              if (r.ok) {
                setAfter("");
                setAdding(false);
              }
            })
          }
        >
          {t("plugins.rule.add")}
        </Button>
      </div>
    );
  } else {
    adder = (
      <TagAdd size="md" className="self-start rounded-control" onClick={() => setAdding(true)}>
        + {t("plugins.rule.add")}
      </TagAdd>
    );
  }

  let position = t("plugins.panel.free");
  if (p.implicit) position = t("plugins.implicitFixed");
  else if (p.locked) position = t("plugins.panel.locked");

  return (
    <div className="flex flex-col gap-4 px-4 py-3.5 text-[0.8125rem]">
      {p.diagnostics.map((d) => (
        <Alert.Root
          key={d.key}
          intent="danger"
          action={
            d.actions.length > 0 ? (
              <span className="flex flex-col gap-1">
                {d.actions.map((a, i) => (
                  <Button key={`${a.id}:${i}`} size="sm" onClick={() => void act(d, i)}>
                    {actionLabel(i18n, a)}
                  </Button>
                ))}
              </span>
            ) : undefined
          }
        >
          <Alert.Description>{diagnosticTitle(i18n, d)}</Alert.Description>
        </Alert.Root>
      ))}
      {p.headerError ? <p className="text-fg-muted">{t("plugins.inspector.headerError")}</p> : null}

      <section className="flex flex-col gap-2">
        <BlockTitle>{t("plugins.inspector.masters")}</BlockTitle>
        {p.mastersList.length === 0 ? <p className="text-fg-muted">{t("plugins.inspector.noMasters")}</p> : null}
        {p.mastersList.map((m) => {
          const s = masterState(m);
          let fix: React.ReactNode = null;
          if (m.present && !m.active) {
            fix = (
              <Button size="sm" onClick={() => void run(() => backend.setPluginsEnabled(instance, [m.name], true))}>
                {t("plugins.action.activate")}
              </Button>
            );
          } else if (!m.present && m.disabled && m.mod) {
            fix = (
              <Button size="sm" onClick={() => void run(() => backend.setModsEnabled(instance, [m.mod], true))}>
                {t("plugins.action.enableMod", { mod: m.modName })}
              </Button>
            );
          }
          return (
            <div key={m.name} className="flex items-center gap-2">
              <span data-intent={s.ok ? "success" : "danger"} className="text-intent-text">
                {s.ok ? <CheckIcon size="sm" /> : <XIcon size="sm" />}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={m.name}>
                {m.name}
              </span>
              <span data-intent={s.ok ? "success" : "danger"} className="text-xs text-intent-text">
                {t(s.key)}
              </span>
              {fix}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <BlockTitle>{t("plugins.inspector.rules")}</BlockTitle>
        {p.ruleList.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{r.after}</span>
            <span className="text-xs text-fg-muted">{t(r.orphan ? "plugins.rule.orphan" : r.source === "user" ? "plugins.panel.ruleYours" : "plugins.panel.ruleProvider")}</span>
            {r.source === "user" ? (
              <Button size="icon-sm" emphasis="low" aria-label={t("plugins.rule.remove")} title={t("plugins.rule.remove")} onClick={() => void run(() => backend.removePluginRule(instance, r.id))}>
                <TrashIcon size="sm" />
              </Button>
            ) : null}
          </div>
        ))}
        {adder}
      </section>

      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <dt className="text-fg-muted">{t("plugins.inspector.dependents")}</dt>
        <dd className="text-fg">{p.dependents.length === 0 ? t("plugins.panel.noDependents") : tp("plugins.panel.dependents", p.dependents.length, { names: p.dependents.join(", ") })}</dd>
        <dt className="text-fg-muted">{t("plugins.inspector.lock")}</dt>
        <dd className="text-fg">{position}</dd>
      </dl>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={p.implicit}
          startIcon={p.locked ? <LockOpenIcon size="sm" /> : <LockIcon size="sm" />}
          onClick={() => void run(() => backend.setIndexLock(instance, [p.name], !p.locked))}
        >
          {t(p.locked ? "plugins.action.unlock" : "plugins.action.lock")}
        </Button>
        <Button size="sm" onClick={() => navigate({ view: "load_order", plugin: p.name })}>
          {t("plugins.panel.seeInOrder")}
        </Button>
      </div>
    </div>
  );
}
