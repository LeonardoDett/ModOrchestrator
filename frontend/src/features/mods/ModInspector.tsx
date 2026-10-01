import { useEffect, useState } from "react";
import { FolderOpen, Package, RotateCcw, Trash2, X } from "lucide-react";
import { Alert, Button, Inline, Input, Inspector, Spinner, Stack, Tabs, Tag, Typography, TONES } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useCategories, useModDetails, useModFiles, useModHistory } from "../../bridge/queries";
import type { ModDetails, ModHistoryEntry } from "../../bridge/types";
import { useSettings } from "../../app/settings-context";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { categoryOptions, contentLabel, formatSize, installerLabel } from "./mod-labels";

interface ModInspectorProps {
  instance: string;
  id: string;
  onClose: () => void;
  onRemove: (ids: string[]) => void;
}

/** Inspector of one mod (ui/telas/mods.md §6): overview, files, installation, history. */
export function ModInspector({ instance, id, onClose, onRemove }: ModInspectorProps) {
  const { t } = useI18n();
  const details = useModDetails(id);
  const [tab, setTab] = useState("overview");
  const name = details.status === "ready" ? details.data.name : "";
  return (
    <Inspector
      sticky={false}
      aria-label={name || t("common.loading")}
      title={name || t("common.loading")}
      description={details.status === "ready" && details.data.variantLabel ? t("mods.variantOf", { name: details.data.variantOfName ?? "", label: details.data.variantLabel }) : undefined}
      className="flex w-[26rem] shrink-0 flex-col overflow-auto rounded-xl border"
      actions={
        <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={onClose}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      }
    >
      {details.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
      {details.status === "error" ? <ErrorAlert title="mods.loadError" error={details.error} onRetry={details.reload} /> : null}
      {details.status === "ready" ? (
        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List>
            <Tabs.Trigger value="overview">{t("mods.tab.overview")}</Tabs.Trigger>
            <Tabs.Trigger value="files">{t("mods.tab.files")}</Tabs.Trigger>
            <Tabs.Trigger value="installation">{t("mods.tab.installation")}</Tabs.Trigger>
            <Tabs.Trigger value="history">{t("mods.tab.history")}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="overview" className="pt-4">
            <Overview instance={instance} mod={details.data} onRemove={onRemove} />
          </Tabs.Panel>
          <Tabs.Panel value="files" className="pt-4">
            <Files id={id} />
          </Tabs.Panel>
          <Tabs.Panel value="installation" className="pt-4">
            <Installation instance={instance} mod={details.data} />
          </Tabs.Panel>
          <Tabs.Panel value="history" className="pt-4">
            <History id={id} />
          </Tabs.Panel>
        </Tabs.Root>
      ) : null}
    </Inspector>
  );
}

function Field({ label, children }: { label: MessageKey; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <dt className="text-fg-muted">{t(label)}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </>
  );
}

function Overview({ instance, mod, onRemove }: { instance: string; mod: ModDetails; onRemove: (ids: string[]) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { get } = useSettings();
  const advanced = get("ui.advancedMode")?.value === "true";
  const categories = useCategories(instance);
  const [form, setForm] = useState({ name: mod.name, version: mod.version, author: mod.author, notes: mod.notes, highlight: mod.highlight ?? "" });
  useEffect(() => {
    setForm({ name: mod.name, version: mod.version, author: mod.author, notes: mod.notes, highlight: mod.highlight ?? "" });
  }, [mod.id, mod.name, mod.version, mod.author, mod.notes, mod.highlight]);
  const dirty =
    form.name !== mod.name || form.version !== mod.version || form.author !== mod.author || form.notes !== mod.notes || form.highlight !== (mod.highlight ?? "");
  const busy = mod.state === "installing" || mod.queued;

  const save = () =>
    void run(
      () =>
        backend.setModAttributes(mod.id, {
          name: form.name,
          version: form.version,
          author: form.author,
          notes: form.notes,
          highlight: form.highlight,
          tags: mod.tags,
        }),
      { success: "mods.saved" },
    );

  const highlightOptions = [{ value: "", label: t("mods.highlight.none") }, ...TONES.map((tone) => ({ value: tone, label: t(`mods.highlight.${tone}`) }))];

  return (
    <Stack gap="md">
      <Inline gap="sm" className="flex-wrap">
        {mod.state === "installed" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => backend.setModsEnabled(instance, [mod.id], !mod.enabled))}>
            {mod.enabled ? t("mods.action.disable") : t("mods.action.enable")}
          </Button>
        ) : (
          <Button size="sm" disabled={busy || !mod.archive?.retained} startIcon={<Package aria-hidden="true" />} onClick={() => void run(() => backend.installMods(instance, [mod.id]))}>
            {t("mods.action.install")}
          </Button>
        )}
        {mod.state === "installed" ? (
          <Button size="sm" variant="outline" disabled={busy || !mod.archive?.retained} title={!mod.archive?.retained ? t("error.reinstall_archive_missing") : undefined} startIcon={<RotateCcw aria-hidden="true" />} onClick={() => void run(() => backend.reinstallMods(instance, [mod.id]))}>
            {t("mods.action.reinstall")}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={busy} startIcon={<FolderOpen aria-hidden="true" />} onClick={() => void run(() => backend.openModFolder(mod.id))}>
          {t("mods.action.openFolder")}
        </Button>
        <Button size="sm" variant="ghost" tone="danger" disabled={busy} startIcon={<Trash2 aria-hidden="true" />} onClick={() => onRemove([mod.id])}>
          {t("mods.action.remove")}
        </Button>
      </Inline>

      <Input.Root fullWidth value={form.name} onChange={(v: string) => setForm({ ...form, name: v })}>
        <Input.Label>{t("mods.field.name")}</Input.Label>
        <Input.Box>
          <Input.Field />
        </Input.Box>
      </Input.Root>
      <Inline gap="sm">
        <Input.Root fullWidth value={form.version} onChange={(v: string) => setForm({ ...form, version: v })}>
          <Input.Label>{t("mods.field.version")}</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
        <Input.Root fullWidth value={form.author} onChange={(v: string) => setForm({ ...form, author: v })}>
          <Input.Label>{t("mods.field.author")}</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      </Inline>
      <Input.Root fullWidth value={mod.category} onChange={(v: string) => void run(() => backend.setModsCategory(instance, [mod.id], v))}>
        <Input.Label>{t("mods.field.category")}</Input.Label>
        <Input.Select options={[{ value: "", label: t("mods.noCategory") }, ...(categories.status === "ready" ? categoryOptions(categories.data) : [])]} />
      </Input.Root>
      <Input.Root fullWidth value={form.highlight} onChange={(v: string) => setForm({ ...form, highlight: v })}>
        <Input.Label>{t("mods.field.highlight")}</Input.Label>
        <Input.Select options={highlightOptions} />
      </Input.Root>
      <Input.Root fullWidth value={form.notes} onChange={(v: string) => setForm({ ...form, notes: v })}>
        <Input.Label>{t("mods.field.notes")}</Input.Label>
        <Input.Textarea rows={4} />
      </Input.Root>
      <Inline gap="sm" className="justify-end">
        <Button size="sm" disabled={!dirty || busy} onClick={save}>
          {t("common.save")}
        </Button>
      </Inline>

      {advanced && mod.state === "installed" ? (
        <Input.Root fullWidth value={mod.type} onChange={(v: string) => v !== mod.type && void run(() => backend.setModType(mod.id, v), { success: "mods.typeChanged" })}>
          <Input.Label>{t("mods.field.type")}</Input.Label>
          <Input.Select options={mod.modTypes.map((mt) => ({ value: mt.id, label: `${mt.name} → ${mt.target}` }))} />
          <Input.HelperText>{t("mods.typeHelp")}</Input.HelperText>
        </Input.Root>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Field label="mods.field.status">{t(mod.state === "installed" ? (mod.enabled ? "mods.status.enabled" : "mods.status.disabled") : "mods.status.notInstalled")}</Field>
        {!advanced ? <Field label="mods.field.type">{mod.typeName || mod.type}</Field> : null}
        <Field label="mods.field.size">{formatSize(i18n.language, mod.size)}</Field>
        <Field label="mods.field.installedAt">{i18n.formatDateTime(mod.installedAt)}</Field>
        <Field label="mods.field.source">{mod.source || t("common.empty")}</Field>
        {mod.description ? <Field label="mods.field.description">{mod.description}</Field> : null}
        <Field label="mods.field.content">
          {mod.content.length ? (
            <span className="flex flex-wrap gap-1">
              {mod.content.map((c) => (
                <Tag key={c} size="sm">
                  {contentLabel(i18n, c)}
                </Tag>
              ))}
            </span>
          ) : (
            t("common.empty")
          )}
        </Field>
      </dl>
    </Stack>
  );
}

function Files({ id }: { id: string }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const [filter, setFilter] = useState("");
  const files = useModFiles(id, filter);
  return (
    <Stack gap="sm">
      <Input.Root fullWidth value={filter} onChange={setFilter}>
        <Input.Box>
          <Input.Field aria-label={t("mods.files.filter")} placeholder={t("mods.files.filter")} />
        </Input.Box>
      </Input.Root>
      {files.status === "ready" ? (
        <>
          <Typography variant="caption" color="muted-fg">
            {tp("mods.files.count", files.data.total)}
          </Typography>
          <ul className="max-h-[50vh] overflow-auto rounded-lg border border-border font-mono text-xs">
            {files.data.files.map((f) => (
              <li key={`${f.target}:${f.path}`} className="flex gap-2 border-b border-border-subtle px-2 py-1 last:border-b-0">
                <span className="text-fg-subtle">{f.target}</span>
                <span className="min-w-0 flex-1 break-all text-fg">{f.path}</span>
                <span className="shrink-0 text-fg-muted">{formatSize(i18n.language, f.size)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : files.status === "error" ? (
        <ErrorAlert title="mods.loadError" error={files.error} onRetry={files.reload} />
      ) : (
        <Spinner label={t("common.loading")} />
      )}
    </Stack>
  );
}

function Installation({ instance, mod }: { instance: string; mod: ModDetails }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  return (
    <Stack gap="md">
      {mod.archive ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Field label="mods.archive.name">{mod.archive.name}</Field>
          <Field label="mods.archive.size">{formatSize(i18n.language, mod.archive.size)}</Field>
          <Field label="mods.archive.retained">{t(mod.archive.retained ? "common.yes" : "common.no")}</Field>
          <Field label="mods.archive.hash">
            <span className="font-mono text-xs">{mod.archive.hash.slice(0, 16)}…</span>
          </Field>
        </dl>
      ) : null}
      {mod.archive && !mod.archive.retained ? (
        <Alert.Root variant="info">
          <Alert.Description>{t("mods.archive.notRetained")}</Alert.Description>
        </Alert.Root>
      ) : null}
      {mod.installation ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Field label="mods.installation.installer">{installerLabel(i18n, mod.installation.installer)}</Field>
          <Field label="mods.installation.root">
            {mod.installation.options.root === undefined ? t("common.empty") : mod.installation.options.root || t("mods.installation.archiveRoot")}
          </Field>
          <Field label="mods.installation.files">{mod.installation.files}</Field>
          <Field label="mods.installation.date">{i18n.formatDateTime(mod.installation.createdAt)}</Field>
        </dl>
      ) : (
        <Typography variant="body-sm" color="muted-fg">
          {t("mods.installation.none")}
        </Typography>
      )}
      {mod.archive?.retained ? (
        <Inline gap="sm">
          <Button size="sm" variant="outline" startIcon={<FolderOpen aria-hidden="true" />} onClick={() => void run(() => backend.openModArchive(mod.id))}>
            {t("mods.action.openArchive")}
          </Button>
          {mod.state === "installed" ? (
            <Button size="sm" variant="outline" disabled={mod.queued} onClick={() => void run(() => backend.reinstallMods(instance, [mod.id]))}>
              {t("mods.action.reinstall")}
            </Button>
          ) : null}
        </Inline>
      ) : null}
    </Stack>
  );
}

/** Event types are stable codes; the catalog phrases them with their params. */
function historyText(i18n: ReturnType<typeof useI18n>, e: ModHistoryEntry): string {
  const key = `mods.history.${e.type}`;
  return i18n.has(key) ? i18n.t(key, e.params) : e.type;
}

function History({ id }: { id: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const history = useModHistory(id);
  if (history.status === "error") return <ErrorAlert title="mods.loadError" error={history.error} onRetry={history.reload} />;
  if (history.status !== "ready") return <Spinner label={t("common.loading")} />;
  if (history.data.length === 0) return <Typography variant="body-sm" color="muted-fg">{t("mods.history.empty")}</Typography>;
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {history.data.map((e) => (
        <li key={e.id} className="flex flex-col">
          <span className="text-fg">{historyText(i18n, e)}</span>
          <time className="text-xs text-fg-muted" dateTime={e.occurredAt}>
            {i18n.formatDateTime(e.occurredAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
