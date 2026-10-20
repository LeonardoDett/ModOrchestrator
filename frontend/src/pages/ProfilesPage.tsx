import { useState } from "react";
import { CheckIcon, HistoryIcon, LayersIcon, MinusIcon, MoreHorizontalIcon, PlusIcon } from "dettmann-ui/icons";
import { Alert, Button, EmptyState, FeaturedIcon, Indicator, Menu, ResourcePage, StatTile, Table, Tag, useToast } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useProfiles, useSnapshots, useWorkspace } from "../bridge/queries";
import type { ProfileSummary } from "../bridge/types";
import { useDeploy } from "../features/deploy/DeployContext";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { CompareDialog, DeleteProfileDialog, EditProfileDialog, NewProfileDialog, TransferDialog } from "../features/profiles/ProfileDialogs";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { MAIN_ID } from "../shell/navigation";
import { BusyBand, LoadingState, WorkspaceGate } from "./PageBody";

/**
 * Profiles (board JogoPerfis, ui/telas/profiles.md): a card per profile
 * with its numbers, notes and whether the game folder has it; a band when
 * the active profile is not the deployed one; the restore points of the
 * selected profile.
 */
export function ProfilesPage() {
  return <WorkspaceGate>{(instance) => <ProfilesWorkspace instance={instance} />}</WorkspaceGate>;
}

function ProfilesWorkspace({ instance }: { instance: string }) {
  const i18n = useI18n();
  const { t, tp, formatDateTime, formatAgo, formatNumber } = i18n;
  const { addToast } = useToast();
  const backend = useBackend();
  const run = useAction();
  const deploy = useDeploy();
  const profiles = useProfiles(instance);
  const workspace = useWorkspace();
  // Plugins exist only where the game has them (the menu comes from the backend capabilities).
  const withPlugins = workspace.status === "ready" && workspace.data.items.includes("plugins");
  const list = profiles.status === "ready" ? profiles.data : [];
  const active = list.find((p) => p.active);
  const deployed = list.find((p) => p.deployed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = list.find((p) => p.id === selectedId) ?? active;
  const snapshots = useSnapshots(selected?.id ?? "");

  const [creating, setCreating] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<{ profile: ProfileSummary; field: "name" | "notes" } | null>(null);
  const [transfer, setTransfer] = useState<{ from: string; to: string } | null>(null);
  const [compare, setCompare] = useState<{ a: string; b: string } | null>(null);
  const [deleting, setDeleting] = useState<ProfileSummary | null>(null);

  const otherThan = (id: string) => list.find((p) => p.id !== id)?.id ?? "";
  const deleteBlock = (p: ProfileSummary): MessageKey | null => (p.active ? "profiles.delete.blockedActive" : list.length <= 1 ? "profiles.delete.blockedLast" : null);

  const restore = async (snapshot: string) => {
    if (!selected) return;
    const res = await run(() => backend.restoreSnapshot(selected.id, snapshot), { success: "profiles.snapshot.restored" });
    // Mods the snapshot knew but that were removed since are reported, not
    // silently dropped (core/07 §6).
    if (res.ok && res.value.ignored.length > 0) {
      addToast({
        title: tp("profiles.snapshot.ignored", res.value.ignored.length),
        description: res.value.ignored.map((m) => m.name).join(", "),
        variant: "warning",
      });
    }
  };

  const usage = (p: ProfileSummary) =>
    p.active
      ? p.lastActivatedAt
        ? t("profiles.card.inUse", { ago: formatAgo(p.lastActivatedAt) })
        : t("profiles.card.inUseNow")
      : p.lastActivatedAt
        ? t("profiles.card.used", { ago: formatAgo(p.lastActivatedAt) })
        : t("profiles.card.createdAgo", { ago: formatAgo(p.createdAt) });

  return (
    <ResourcePage
      id={MAIN_ID}
      tabIndex={-1}
      layout="workspace"
      className="focus:outline-none"
      title={t("nav.profiles")}
      meta={<Indicator variant="chip" icon={LayersIcon} value={formatNumber(list.length)} label={tp("profiles.countNoun", list.length)} />}
      primaryActions={
        <>
          <Button disabled={list.length < 2} onClick={() => setCompare({ a: active?.id ?? "", b: otherThan(active?.id ?? "") })}>
            {t("profiles.toolbar.compare")}
          </Button>
          <Button disabled={!selected} onClick={() => selected && void run(() => backend.createSnapshot(selected.id), { success: "profiles.snapshot.created" })}>
            {t("profiles.toolbar.snapshot")}
          </Button>
          <Button emphasis="high" startIcon={<PlusIcon size="sm" />} onClick={() => setCreating("")}>
            {t("profiles.toolbar.new")}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pb-6">
        <BusyBand />
        {profiles.status === "error" ? <ErrorAlert title="profiles.loadError" error={profiles.error} onRetry={profiles.reload} /> : null}
        {profiles.status === "loading" ? <LoadingState rows={2} /> : null}

        <div role="listbox" aria-label={t("profiles.listLabel")} className="grid shrink-0 grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
          {list.map((p) => {
            const blocked = deleteBlock(p);
            const on = selected?.id === p.id;
            return (
              <div
                key={p.id}
                role="option"
                aria-selected={on}
                aria-current={p.active ? "true" : undefined}
                tabIndex={0}
                onClick={() => setSelectedId(p.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setSelectedId(p.id);
                  }
                }}
                className={`focus-ring flex cursor-pointer flex-col overflow-hidden rounded-card border bg-surface motion-transition ${on ? "border-border-strong ring-1 ring-border-strong" : "border-border hover:border-border-strong"}`}
              >
                <div className="flex flex-col gap-3 px-4 pb-3.5 pt-4">
                  <div className="flex min-h-5.5 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-md font-semibold text-fg">{p.name}</span>
                    {p.active ? (
                      <Tag size="md" shape="pill" intent="brand">
                        {t("profiles.active")}
                      </Tag>
                    ) : null}
                    {p.deployed ? (
                      <Tag size="md" shape="pill" intent="success" outline={false} icon={CheckIcon}>
                        {t("profiles.deployed")}
                      </Tag>
                    ) : (
                      <Tag size="md" shape="pill" outline={false} icon={MinusIcon}>
                        {t("profiles.notDeployed")}
                      </Tag>
                    )}
                  </div>
                  <StatTile.Grid columns={withPlugins ? 2 : 1} className="gap-2">
                    <StatTile
                      layout="inline"
                      label={t("profiles.card.mods")}
                      value={
                        <>
                          {formatNumber(p.enabled)}
                          <span className="text-xs font-normal text-fg-muted"> {t("profiles.card.of", { total: formatNumber(p.mods) })}</span>
                        </>
                      }
                    />
                    {withPlugins ? <StatTile layout="inline" label={t("profiles.card.plugins")} value={formatNumber(p.plugins)} /> : null}
                  </StatTile.Grid>
                  <span className={`line-clamp-2 h-9.5 text-sm leading-snug ${p.notes ? "text-fg" : "text-fg-muted"}`}>{p.notes || t("profiles.card.noNotes")}</span>
                  <span className="text-xs text-fg-muted">{usage(p)}</span>
                </div>
                <div
                  data-layer="medium"
                  className="flex h-13 shrink-0 items-center gap-2 border-t border-border-subtle bg-structure pl-4 pr-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button disabled={p.active} onClick={() => void run(() => backend.activateProfile(p.id), { success: "profiles.activated" })}>
                    {p.active ? t("profiles.inUse") : t("profiles.action.activate")}
                  </Button>
                  <Button onClick={() => setCreating(p.id)}>{t("profiles.action.clone")}</Button>
                  <div className="flex-1" />
                  <Menu.Root placement="bottom-end">
                    <Menu.Trigger>
                      <Button size="icon" emphasis="low" aria-label={t("profiles.more", { name: p.name })}>
                        <MoreHorizontalIcon size="sm" />
                      </Button>
                    </Menu.Trigger>
                    <Menu.Content>
                      <Menu.Item onSelect={() => setEditing({ profile: p, field: "name" })}>{t("profiles.action.rename")}</Menu.Item>
                      <Menu.Item onSelect={() => setEditing({ profile: p, field: "notes" })}>{t("profiles.action.notes")}</Menu.Item>
                      <Menu.Item disabled={list.length < 2} onSelect={() => setTransfer({ from: p.id, to: otherThan(p.id) })}>
                        {t("profiles.action.transferTo")}
                      </Menu.Item>
                      <Menu.Item disabled={list.length < 2} onSelect={() => setCompare({ a: p.id, b: otherThan(p.id) })}>
                        {t("profiles.action.compareWith")}
                      </Menu.Item>
                      <Menu.Separator />
                      <Menu.Item disabled={blocked !== null} label={t("profiles.action.delete")} onSelect={() => setDeleting(p)}>
                        <span className="flex flex-col items-start">
                          <span className={blocked ? "" : "text-danger-text"}>{t("profiles.action.delete")}</span>
                          {blocked ? <span className="text-xs text-fg-muted">{t(blocked)}</span> : null}
                        </span>
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Root>
                </div>
              </div>
            );
          })}
        </div>

        {active && deployed && deployed.id !== active.id ? (
          <Alert.Root
            intent="info"
            className="shrink-0"
            action={
              <Button size="sm" onClick={() => void deploy.deploy()}>
                {t("profiles.deployNow")}
              </Button>
            }
          >
            <Alert.Description>{t("profiles.notDeployedBand", { active: active.name, deployed: deployed.name })}</Alert.Description>
          </Alert.Root>
        ) : null}

        {selected ? (
          <section aria-labelledby="profiles-snapshots" className="mt-1 flex flex-col gap-2.5">
            <div className="flex items-baseline gap-2.5">
              <h2 id="profiles-snapshots" className="text-md font-semibold text-fg">
                {t("profiles.snapshots.title", { name: selected.name })}
              </h2>
              <span className="text-xs text-fg-muted">{t("profiles.snapshots.help")}</span>
            </div>
            {snapshots.status === "ready" && snapshots.data.length === 0 ? (
              <EmptyState.Root className="rounded-card border border-border bg-surface">
                <EmptyState.Icon>
                  <FeaturedIcon icon={HistoryIcon} intent="neutral" />
                </EmptyState.Icon>
                <EmptyState.Title>{t("profiles.snapshots.emptyTitle")}</EmptyState.Title>
                <EmptyState.Description>{t("profiles.snapshots.emptyDescription")}</EmptyState.Description>
              </EmptyState.Root>
            ) : null}
            {snapshots.status === "error" ? <ErrorAlert title="profiles.loadError" error={snapshots.error} onRetry={snapshots.reload} /> : null}
            {snapshots.status === "ready" && snapshots.data.length > 0 ? (
              <Table.Root aria-label={t("profiles.snapshots.title", { name: selected.name })}>
                <Table.Header>
                  <Table.Row>
                    <Table.Head className="w-44">{t("profiles.snapshots.date")}</Table.Head>
                    <Table.Head>{t("profiles.snapshots.reason")}</Table.Head>
                    <Table.Head className="w-38">{t("profiles.snapshots.by")}</Table.Head>
                    <Table.Head className="w-28">
                      <span className="sr-only">{t("profiles.snapshots.actions")}</span>
                    </Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {snapshots.data.map((s) => (
                    <Table.Row key={s.id}>
                      <Table.Cell className="text-fg-muted">{formatDateTime(s.createdAt)}</Table.Cell>
                      <Table.Cell className="truncate">{t(`profiles.snapshot.reason.${s.reason}` as MessageKey)}</Table.Cell>
                      <Table.Cell className="text-fg-muted">{s.reason === "manual" ? t("profiles.snapshots.byYou") : t("profiles.snapshots.byAuto")}</Table.Cell>
                      <Table.Cell className="text-right">
                        <Button size="sm" onClick={() => void restore(s.id)}>
                          {t("profiles.snapshots.restore")}
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            ) : null}
          </section>
        ) : null}
      </div>

      <NewProfileDialog instance={instance} profiles={list} from={creating} onClose={() => setCreating(undefined)} />
      <EditProfileDialog profile={editing?.profile ?? null} field={editing?.field ?? "name"} onClose={() => setEditing(null)} />
      <TransferDialog profiles={list} initial={transfer} onClose={() => setTransfer(null)} />
      <CompareDialog
        profiles={list}
        initial={compare}
        onClose={() => setCompare(null)}
        onTransfer={(from, to) => {
          setCompare(null);
          setTransfer({ from, to });
        }}
      />
      <DeleteProfileDialog profile={deleting} onClose={() => setDeleting(null)} />
    </ResourcePage>
  );
}
