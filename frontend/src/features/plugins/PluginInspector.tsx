import { useState } from "react";
import { Lock, LockOpen, Package, Plus, Trash2, X } from "lucide-react";
import { Button, Inline, Input, Inspector, Spinner, Stack, Tag, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { usePluginDetails, usePluginRules } from "../../bridge/queries";
import type { PluginDetails } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { diagnosticTitle, actionLabel } from "../diagnostics/diagnostic-labels";
import { useDiagnosticAction } from "../diagnostics/use-diagnostic-action";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { FlagTags, originLabel } from "./plugin-labels";

interface PluginInspectorProps {
  instance: string;
  name: string;
  onClose: () => void;
}

/**
 * Inspector of a plugin (ui/telas/plugins.md §4): header, masters with
 * their state and actions, dependents, rules, group, position and
 * problems. Everything shown is read from the backend; actions are
 * commands that the backend validates.
 */
export function PluginInspector({ instance, name, onClose }: PluginInspectorProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const details = usePluginDetails(instance, name);
  return (
    <Inspector
      sticky={false}
      aria-label={name}
      title={name}
      description={details.status === "ready" && details.data ? originLabel(i18n, details.data.origin) : undefined}
      className="flex w-[24rem] shrink-0 flex-col overflow-auto rounded-xl border"
      actions={
        <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={onClose}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      }
    >
      {details.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
      {details.status === "error" ? <ErrorAlert title="plugins.loadError" error={details.error} onRetry={details.reload} /> : null}
      {details.status === "ready" && details.data ? <Body instance={instance} p={details.data} /> : null}
    </Inspector>
  );
}

function Section({ title, children }: { title: MessageKey; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-2">
      <Typography variant="heading-6" color="fg">
        {t(title)}
      </Typography>
      {children}
    </section>
  );
}

function Body({ instance, p }: { instance: string; p: PluginDetails }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const act = useDiagnosticAction();
  const { navigate } = useNavigation();
  const rules = usePluginRules(instance);
  const [after, setAfter] = useState("");
  const groups = rules.status === "ready" ? rules.data.groups : [];
  const others = rules.status === "ready" ? rules.data.plugins.filter((n) => n.toLowerCase() !== p.name.toLowerCase()) : [];

  return (
    <Stack gap="lg">
      {p.diagnostics.length > 0 ? (
        <Section title="plugins.inspector.problems">
          <ul className="flex flex-col gap-2">
            {p.diagnostics.map((d) => (
              <li key={d.key} className="rounded-lg border border-border bg-surface p-2 text-sm">
                <span className="text-fg">{diagnosticTitle(i18n, d)}</span>
                <Inline gap="xs" className="mt-1 flex-wrap">
                  {d.actions.map((a, i) => (
                    <Button key={`${a.id}:${i}`} size="sm" variant="outline" onClick={() => void act(d, i)}>
                      {actionLabel(i18n, a)}
                    </Button>
                  ))}
                </Inline>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-fg-muted">{t("plugins.column.flags")}</dt>
        <dd className="min-w-0">
          <FlagTags row={p} i18n={i18n} />
        </dd>
        <dt className="text-fg-muted">{t("plugins.inspector.position")}</dt>
        <dd className="text-fg">
          {p.position}
          {p.index ? ` · ${p.index}` : ` · ${t("plugins.inactive")}`}
        </dd>
        {p.author ? (
          <>
            <dt className="text-fg-muted">{t("plugins.column.author")}</dt>
            <dd className="text-fg">{p.author}</dd>
          </>
        ) : null}
        {p.version ? (
          <>
            <dt className="text-fg-muted">{t("plugins.column.version")}</dt>
            <dd className="text-fg">{p.version}</dd>
          </>
        ) : null}
        <dt className="text-fg-muted">{t("plugins.inspector.file")}</dt>
        <dd className="break-all font-mono text-xs text-fg">{p.path}</dd>
        {p.modName ? (
          <>
            <dt className="text-fg-muted">{t("plugins.column.mod")}</dt>
            <dd>
              <Button size="sm" variant="ghost" startIcon={<Package aria-hidden="true" />} onClick={() => navigate({ view: "mods", focusMod: p.mod })}>
                {p.modName}
              </Button>
            </dd>
          </>
        ) : null}
      </dl>
      {p.description ? (
        <Typography variant="body-sm" color="muted-fg" className="whitespace-pre-wrap">
          {p.description}
        </Typography>
      ) : null}
      {p.headerError ? (
        <Typography variant="body-sm" color="muted-fg">
          {t("plugins.inspector.headerError")}
        </Typography>
      ) : null}

      <Section title="plugins.inspector.masters">
        {p.mastersList.length === 0 ? (
          <Typography variant="body-sm" color="muted-fg">
            {t("plugins.inspector.noMasters")}
          </Typography>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {p.mastersList.map((m) => (
              <li key={m.name} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-fg">{m.name}</span>
                <Tag size="sm">{t(m.present ? (m.active ? "plugins.master.active" : "plugins.master.inactive") : "plugins.master.missing")}</Tag>
                {m.present && !m.before ? <Tag size="sm">{t("plugins.master.after")}</Tag> : null}
                {m.present && !m.active ? (
                  <Button size="sm" variant="outline" onClick={() => void run(() => backend.setPluginsEnabled(instance, [m.name], true))}>
                    {t("plugins.action.activate")}
                  </Button>
                ) : null}
                {!m.present && m.disabled && m.mod ? (
                  <Button size="sm" variant="outline" onClick={() => void run(() => backend.setModsEnabled(instance, [m.mod], true))}>
                    {t("plugins.action.enableMod", { mod: m.modName })}
                  </Button>
                ) : null}
                {m.mod ? (
                  <Button size="sm" variant="ghost" onClick={() => navigate({ view: "mods", focusMod: m.mod })}>
                    {t("plugins.action.showMod")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="plugins.inspector.dependents">
        {p.dependents.length === 0 ? (
          <Typography variant="body-sm" color="muted-fg">
            {t("plugins.inspector.noDependents")}
          </Typography>
        ) : (
          <Inline gap="xs" className="flex-wrap">
            {p.dependents.map((d) => (
              <Tag key={d} size="sm">
                {d}
              </Tag>
            ))}
          </Inline>
        )}
      </Section>

      <Section title="plugins.inspector.rules">
        <ul className="flex flex-col gap-1">
          {p.ruleList.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm text-fg">
              <span className="min-w-0 flex-1 truncate">{t("plugins.rule.sentence", { plugin: r.plugin, after: r.after })}</span>
              {r.orphan ? <Tag size="sm">{t("plugins.rule.orphan")}</Tag> : null}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("plugins.rule.remove")}
                disabled={r.source !== "user"}
                onClick={() => void run(() => backend.removePluginRule(instance, r.id))}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Inline gap="xs" className="items-end">
          <Input.Root value={after} onChange={setAfter} className="min-w-0 flex-1">
            <Input.Select
              aria-label={t("plugins.rule.after")}
              placeholder={t("plugins.rule.after")}
              options={others.map((n) => ({ value: n, label: n }))}
            />
          </Input.Root>
          <Button
            size="sm"
            variant="outline"
            startIcon={<Plus aria-hidden="true" />}
            disabled={!after}
            onClick={() =>
              void run(() => backend.createPluginRule(instance, p.name, after)).then((r) => {
                if (r.ok) setAfter("");
              })
            }
          >
            {t("plugins.rule.add")}
          </Button>
        </Inline>
      </Section>

      <Section title="plugins.column.group">
        <Input.Root disabled={p.implicit} value={p.group} onChange={(g: string) => g !== p.group && void run(() => backend.setPluginGroup(instance, [p.name], g))}>
          <Input.Select aria-label={t("plugins.column.group")} options={groups.map((g) => ({ value: g.name, label: g.default ? t("plugins.group.default") : g.name }))} />
        </Input.Root>
      </Section>

      <Section title="plugins.inspector.lock">
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={p.implicit}
            startIcon={p.locked ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
            onClick={() => void run(() => backend.setIndexLock(instance, [p.name], !p.locked))}
          >
            {t(p.implicit ? "plugins.implicitFixed" : p.locked ? "plugins.action.unlock" : "plugins.action.lock")}
          </Button>
        </div>
      </Section>
    </Stack>
  );
}
