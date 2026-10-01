import { useState } from "react";
import { CheckCircle2, Copy, GitCompare, History, MoreHorizontal, Plus, RotateCcw, UserRound } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, FeaturedIcon, Menu, Spinner, Stack, Table, Toolbar, Typography, useToast } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useProfiles, useSnapshots, useWorkspace } from "../bridge/queries";
import type { ProfileSummary } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useAction } from "../features/games/use-action";
import { CompareDialog, DeleteProfileDialog, EditProfileDialog, NewProfileDialog, TransferDialog } from "../features/profiles/ProfileDialogs";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { PageBody } from "./PageBody";

/**
 * Profiles (ui/telas/profiles.md): cards per profile, comparison, transfer
 * and restore points. Deploy status of each card and per-profile features
 * (local saves/settings) arrive with F7 and V1.x (anti-pattern 18).
 */
export function ProfilesPage() {
  const { t } = useI18n();
  const ws = useWorkspace();
  if (ws.status === "loading") return <PageBody><Spinner label={t("common.loading")} /></PageBody>;
  if (ws.status === "unavailable") {
    return (
      <PageBody>
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      </PageBody>
    );
  }
  if (ws.status === "error") return <PageBody><ErrorAlert title="games.loadError" error={ws.error} onRetry={ws.reload} /></PageBody>;
  if (!ws.data.active) return null; // Routes sends the user back to Games
  return <ProfilesWorkspace key={ws.data.active.id} instance={ws.data.active.id} />;
}

function ProfilesWorkspace({ instance }: { instance: string }) {
  const { t, tp, formatDateTime } = useI18n();
  const { addToast } = useToast();
  const backend = useBackend();
  const run = useAction();
  const profiles = useProfiles(instance);
  const list = profiles.status === "ready" ? profiles.data : [];
  const active = list.find((p) => p.active);
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

  return (
    <PageBody>
      <Stack gap="lg">
        <Toolbar
          start={
            <>
              <Button startIcon={<Plus aria-hidden="true" />} onClick={() => setCreating("")}>
                {t("profiles.toolbar.new")}
              </Button>
              <Button
                variant="outline"
                startIcon={<GitCompare aria-hidden="true" />}
                disabled={list.length < 2}
                onClick={() => setCompare({ a: active?.id ?? "", b: otherThan(active?.id ?? "") })}
              >
                {t("profiles.toolbar.compare")}
              </Button>
              <Button
                variant="outline"
                startIcon={<History aria-hidden="true" />}
                disabled={!selected}
                onClick={() => selected && void run(() => backend.createSnapshot(selected.id), { success: "profiles.snapshot.created" })}
              >
                {t("profiles.toolbar.snapshot")}
              </Button>
            </>
          }
        />

        {profiles.status === "error" ? <ErrorAlert title="profiles.loadError" error={profiles.error} onRetry={profiles.reload} /> : null}
        {profiles.status === "loading" ? <Spinner label={t("common.loading")} /> : null}

        <div role="list" aria-label={t("profiles.listLabel")} className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
          {list.map((p) => {
            const blocked = deleteBlock(p);
            return (
              <Card.Root
                key={p.id}
                role="listitem"
                variant="interactive"
                selected={selected?.id === p.id}
                aria-current={p.active ? "true" : undefined}
                tabIndex={0}
                onClick={() => setSelectedId(p.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setSelectedId(p.id);
                  }
                }}
              >
                <Card.Header>
                  <div className="flex items-center gap-2">
                    {p.active ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-text" /> : <UserRound aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />}
                    <Card.Title className="min-w-0 flex-1 truncate">{p.name}</Card.Title>
                    {p.active ? <Badge tone="primary">{t("profiles.active")}</Badge> : null}
                  </div>
                </Card.Header>
                <Card.Body>
                  <Stack gap="xs">
                    <Typography variant="body-sm" color="fg">
                      {t("profiles.card.enabled", { enabled: p.enabled, total: p.mods })}
                    </Typography>
                    <Typography variant="body-sm" color="muted-fg">
                      {p.lastActivatedAt ? t("profiles.card.lastActive", { date: formatDateTime(p.lastActivatedAt) }) : t("profiles.card.created", { date: formatDateTime(p.createdAt) })}
                    </Typography>
                    {p.notes ? (
                      <Typography variant="body-sm" color="muted-fg" className="line-clamp-2">
                        {p.notes}
                      </Typography>
                    ) : null}
                  </Stack>
                </Card.Body>
                <Card.Footer className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" disabled={p.active} onClick={() => void run(() => backend.activateProfile(p.id), { success: "profiles.activated" })}>
                    {t("profiles.action.activate")}
                  </Button>
                  <Button size="sm" variant="outline" startIcon={<Copy aria-hidden="true" />} onClick={() => setCreating(p.id)}>
                    {t("profiles.action.clone")}
                  </Button>
                  <div className="flex-1" />
                  <Menu.Root placement="bottom-end">
                    <Menu.Trigger>
                      <Button size="icon-sm" variant="ghost" aria-label={t("profiles.more", { name: p.name })}>
                        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
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
                      <Menu.Item disabled={blocked !== null} label={t("profiles.action.delete")} onSelect={() => setDeleting(p)}>
                        <span className="flex flex-col items-start">
                          <span className={blocked ? "" : "text-danger-text"}>{t("profiles.action.delete")}</span>
                          {blocked ? <span className="text-xs text-fg-muted">{t(blocked)}</span> : null}
                        </span>
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Root>
                </Card.Footer>
              </Card.Root>
            );
          })}
        </div>

        {selected ? (
          <section aria-labelledby="profiles-snapshots" className="flex flex-col gap-3">
            <Typography id="profiles-snapshots" variant="heading-6" color="fg">
              {t("profiles.snapshots.title", { name: selected.name })}
            </Typography>
            {snapshots.status === "ready" && snapshots.data.length === 0 ? (
              <EmptyState.Root className="rounded-xl border border-border bg-surface">
                <EmptyState.Icon>
                  <FeaturedIcon icon={History} color="neutral" />
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
                    <Table.Head>{t("profiles.snapshots.date")}</Table.Head>
                    <Table.Head>{t("profiles.snapshots.reason")}</Table.Head>
                    <Table.Head>{t("profiles.snapshots.mods")}</Table.Head>
                    <Table.Head>
                      <span className="sr-only">{t("profiles.snapshots.actions")}</span>
                    </Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {snapshots.data.map((s) => (
                    <Table.Row key={s.id}>
                      <Table.Cell>{formatDateTime(s.createdAt)}</Table.Cell>
                      <Table.Cell>{t(`profiles.snapshot.reason.${s.reason}` as MessageKey)}</Table.Cell>
                      <Table.Cell>{tp("profiles.snapshots.enabled", s.enabled)}</Table.Cell>
                      <Table.Cell className="text-right">
                        <Button size="sm" variant="outline" startIcon={<RotateCcw aria-hidden="true" />} onClick={() => void restore(s.id)}>
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
      </Stack>

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
    </PageBody>
  );
}
