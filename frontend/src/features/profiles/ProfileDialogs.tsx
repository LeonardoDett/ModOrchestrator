import { useEffect, useState } from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { Alert, Button, Checkbox, DiffViewer, Input, Modal, Spinner, Stack, Typography, type DiffLine } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import type { ProfileComparison, ProfileSummary } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";

function DialogError({ error }: { error: UIError | null }) {
  const i18n = useI18n();
  if (!error) return null;
  return (
    <Alert.Root variant="danger">
      <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
    </Alert.Root>
  );
}

/**
 * DLG-19: new profile or clone (core/07 §2–3). "Empty" starts with every
 * mod disabled and the active profile's order; "copy of" clones a profile.
 */
export function NewProfileDialog({
  instance,
  profiles,
  from,
  onClose,
}: {
  instance: string;
  profiles: ProfileSummary[];
  /** Pre-selected source ("" = empty); undefined keeps the dialog closed. */
  from: string | undefined;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName("");
    setError(null);
    setSource(from ?? "");
  }, [from]);
  if (from === undefined) return null;
  const cloning = source !== "";

  const submit = async () => {
    setBusy(true);
    const res = await run(() => backend.createProfile(instance, name, source), { quiet: true, success: "profiles.created" });
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(cloning ? "profiles.clone.title" : "profiles.new.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Input.Root fullWidth value={name} onChange={setName}>
              <Input.Label>{t("profiles.field.name")}</Input.Label>
              <Input.Box>
                <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim() && void submit()} />
              </Input.Box>
            </Input.Root>
            <Input.Root fullWidth value={source} onChange={setSource}>
              <Input.Label>{t("profiles.field.startFrom")}</Input.Label>
              <Input.Select
                options={[
                  { value: "", label: t("profiles.startFrom.empty") },
                  ...profiles.map((p) => ({ value: p.id, label: t("profiles.startFrom.copy", { name: p.name }) })),
                ]}
              />
            </Input.Root>
            <Typography variant="body-sm" color="muted-fg">
              {t(cloning ? "profiles.clone.help" : "profiles.new.help")}
            </Typography>
            <DialogError error={error} />
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !name.trim()} loading={busy} onClick={() => void submit()}>
            {t(cloning ? "profiles.action.clone" : "profiles.action.create")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** Rename or edit notes of a profile. */
export function EditProfileDialog({
  profile,
  field,
  onClose,
}: {
  profile: ProfileSummary | null;
  field: "name" | "notes";
  onClose: () => void;
}) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [value, setValue] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  useEffect(() => {
    setValue(profile ? (field === "name" ? profile.name : profile.notes) : "");
    setError(null);
  }, [profile, field]);
  if (!profile) return null;

  const submit = async () => {
    const res = await run(
      () => (field === "name" ? backend.renameProfile(profile.id, value) : backend.setProfileNotes(profile.id, value)),
      { quiet: true },
    );
    if (res.ok) onClose();
    else setError(res.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(field === "name" ? "profiles.rename.title" : "profiles.notes.title", { name: profile.name })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Input.Root fullWidth value={value} onChange={setValue}>
              <Input.Label>{t(field === "name" ? "profiles.field.name" : "profiles.field.notes")}</Input.Label>
              {field === "name" ? (
                <Input.Box>
                  <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && void submit()} />
                </Input.Box>
              ) : (
                <Input.Textarea autoFocus rows={5} />
              )}
            </Input.Root>
            <DialogError error={error} />
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()}>{t("common.save")}</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * DLG-20: transfer the selection between profiles (Vortex TransferDialog):
 * source, destination, what to transfer and a preview of the differences.
 * The destination gets a restore point first (core/07 §2).
 */
export function TransferDialog({
  profiles,
  initial,
  onClose,
}: {
  profiles: ProfileSummary[];
  initial: { from: string; to: string } | null;
  onClose: () => void;
}) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [order, setOrder] = useState(false);
  const [diff, setDiff] = useState<ProfileComparison | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setFrom(initial?.from ?? "");
    setTo(initial?.to ?? "");
    setOrder(false);
    setError(null);
  }, [initial]);
  useEffect(() => {
    setDiff(null);
    if (!initial || !from || !to || from === to) return;
    backend.compareProfiles(from, to).then(setDiff, (e: unknown) => setError(toUIError(e)));
  }, [backend, initial, from, to]);
  if (!initial) return null;

  const submit = async () => {
    setBusy(true);
    const res = await run(() => backend.transferSelection(from, to, { order, plugins: false }), { quiet: true, success: "profiles.transferred" });
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error);
  };
  const options = profiles.map((p) => ({ value: p.id, label: p.name }));

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("profiles.transfer.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <div className="grid grid-cols-2 gap-3">
              <Input.Root fullWidth value={from} onChange={setFrom}>
                <Input.Label>{t("profiles.transfer.from")}</Input.Label>
                <Input.Select options={options} />
              </Input.Root>
              <Input.Root fullWidth value={to} onChange={setTo}>
                <Input.Label>{t("profiles.transfer.to")}</Input.Label>
                <Input.Select options={options} />
              </Input.Root>
            </div>
            <Stack gap="xs">
              <Checkbox checked disabled label={t("profiles.transfer.enabledMods")} />
              <Checkbox checked={order} onCheckedChange={setOrder} label={t("profiles.transfer.order")} />
            </Stack>
            {from && to && from === to ? (
              <Alert.Root variant="warning">
                <Alert.Description>{t("profiles.transfer.same")}</Alert.Description>
              </Alert.Root>
            ) : diff ? (
              <Typography variant="body-sm" color="fg">
                {tp("profiles.transfer.willEnable", diff.onlyA.length)} · {tp("profiles.transfer.willDisable", diff.onlyB.length)}
                {order ? ` · ${tp("profiles.transfer.willMove", diff.priorityChanged.length)}` : ""}
              </Typography>
            ) : from && to ? (
              <Spinner label={t("common.loading")} />
            ) : null}
            <Typography variant="body-sm" color="muted-fg">
              {t("profiles.transfer.snapshotNote")}
            </Typography>
            <DialogError error={error} />
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !from || !to || from === to} loading={busy} startIcon={<ArrowRightLeft aria-hidden="true" />} onClick={() => void submit()}>
            {t("profiles.action.transfer")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * DLG-21: compare two profiles (core/07 §5) as a diff: mods only in one
 * side, mods at different priorities; plugin groups appear when there is
 * plugin state to compare (F11). "Transfer to…" opens DLG-20.
 */
export function CompareDialog({
  profiles,
  initial,
  onTransfer,
  onClose,
}: {
  profiles: ProfileSummary[];
  initial: { a: string; b: string } | null;
  onTransfer: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const backend = useBackend();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [diff, setDiff] = useState<ProfileComparison | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  useEffect(() => {
    setA(initial?.a ?? "");
    setB(initial?.b ?? "");
  }, [initial]);
  useEffect(() => {
    setDiff(null);
    setError(null);
    if (!initial || !a || !b || a === b) return;
    backend.compareProfiles(a, b).then(setDiff, (e: unknown) => setError(toUIError(e)));
  }, [backend, initial, a, b]);
  if (!initial) return null;

  const options = profiles.map((p) => ({ value: p.id, label: p.name }));
  const modLines: DiffLine[] = diff
    ? [
        ...diff.onlyA.map((m) => ({ id: `a-${m.id}`, kind: "removed" as const, left: { text: m.name } })),
        ...diff.onlyB.map((m) => ({ id: `b-${m.id}`, kind: "added" as const, right: { text: m.name } })),
        ...diff.priorityChanged.map((m) => ({
          id: `p-${m.id}`,
          kind: "changed" as const,
          left: { lineNumber: m.a, text: m.name },
          right: { lineNumber: m.b, text: m.name },
        })),
      ]
    : [];
  const pluginLines: DiffLine[] = diff
    ? [
        ...diff.pluginsOnlyA.map((p) => ({ id: `pa-${p}`, kind: "removed" as const, left: { text: p } })),
        ...diff.pluginsOnlyB.map((p) => ({ id: `pb-${p}`, kind: "added" as const, right: { text: p } })),
      ]
    : [];
  const loadOrderLines: DiffLine[] = diff
    ? diff.loadOrderChanged.map((p) => ({ id: `lo-${p.plugin}`, kind: "changed" as const, left: { lineNumber: p.a, text: p.plugin }, right: { lineNumber: p.b, text: p.plugin } }))
    : [];
  const titles = { leftTitle: diff?.a.name ?? "", rightTitle: diff?.b.name ?? "", empty: t("profiles.compare.noDifferences") };

  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("profiles.compare.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <div className="grid grid-cols-2 gap-3">
              <Input.Root fullWidth value={a} onChange={setA}>
                <Input.Label>{t("profiles.compare.a")}</Input.Label>
                <Input.Select options={options} />
              </Input.Root>
              <Input.Root fullWidth value={b} onChange={setB}>
                <Input.Label>{t("profiles.compare.b")}</Input.Label>
                <Input.Select options={options} />
              </Input.Root>
            </div>
            <DialogError error={error} />
            {a && b && a !== b && !diff && !error ? <Spinner label={t("common.loading")} /> : null}
            {diff ? (
              <>
                <section aria-label={t("profiles.compare.mods")} className="flex flex-col gap-2">
                  <Typography variant="heading-6" color="fg">
                    {t("profiles.compare.mods")}
                  </Typography>
                  <DiffViewer className="max-h-80 overflow-auto" lines={modLines} {...titles} />
                </section>
                {pluginLines.length > 0 ? (
                  <section aria-label={t("profiles.compare.plugins")} className="flex flex-col gap-2">
                    <Typography variant="heading-6" color="fg">
                      {t("profiles.compare.plugins")}
                    </Typography>
                    <DiffViewer className="max-h-60 overflow-auto" lines={pluginLines} {...titles} />
                  </section>
                ) : null}
                {loadOrderLines.length > 0 ? (
                  <section aria-label={t("profiles.compare.loadOrder")} className="flex flex-col gap-2">
                    <Typography variant="heading-6" color="fg">
                      {t("profiles.compare.loadOrder")}
                    </Typography>
                    <DiffViewer className="max-h-60 overflow-auto" lines={loadOrderLines} {...titles} />
                  </section>
                ) : null}
              </>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button disabled={!diff} startIcon={<ArrowRightLeft aria-hidden="true" />} onClick={() => onTransfer(a, b)}>
            {t("profiles.compare.transfer", { name: diff?.b.name ?? "" })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** DLG-22: destructive confirmation; the restore points go with the profile. */
export function DeleteProfileDialog({ profile, onClose }: { profile: ProfileSummary | null; onClose: () => void }) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(null), [profile]);
  if (!profile) return null;
  const submit = async () => {
    setBusy(true);
    const res = await run(() => backend.deleteProfile(profile.id), { quiet: true, success: "profiles.deleted" });
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error);
  };
  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="sm" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("profiles.delete.title", { name: profile.name })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm" color="fg">
              {t("profiles.delete.description")}
            </Typography>
            {profile.snapshots > 0 ? (
              <Alert.Root variant="warning">
                <Alert.Description>{tp("profiles.delete.snapshots", profile.snapshots)}</Alert.Description>
              </Alert.Root>
            ) : null}
            <DialogError error={error} />
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button tone="danger" disabled={busy} loading={busy} startIcon={<Trash2 aria-hidden="true" />} onClick={() => void submit()}>
            {t("profiles.action.delete")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
