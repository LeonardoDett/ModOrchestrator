import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, Checkbox, Input, Modal, Spinner, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import { useCategories } from "../../bridge/queries";
import type { Category, RemovalPreview } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { categoryOptions } from "./mod-labels";

/** DLG-07: remove mods, optionally with their archives (core/02 §7). */
export function RemoveModsDialog({ instance, ids, onClose }: { instance: string; ids: string[] | null; onClose: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [preview, setPreview] = useState<RemovalPreview | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [withArchives, setWithArchives] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPreview(null);
    setError(null);
    setWithArchives(false);
    if (!ids) return;
    backend.previewModRemoval(instance, ids).then(setPreview, (e: unknown) => setError(toUIError(e)));
  }, [backend, instance, ids]);
  if (!ids) return null;

  const remove = async () => {
    setBusy(true);
    const result = await run(() => backend.removeMods(instance, ids, withArchives), { quiet: true, success: "mods.removed" });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{tp("mods.remove.title", ids.length)}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            {preview ? (
              <>
                <ul className="max-h-40 list-disc overflow-auto pl-5 text-sm text-fg">
                  {preview.mods.map((m) => (
                    <li key={m.id}>{m.version ? `${m.name} (${m.version})` : m.name}</li>
                  ))}
                </ul>
                <Checkbox checked={withArchives} onCheckedChange={setWithArchives} label={t("mods.remove.withArchives")} />
                {withArchives && preview.sharedArchives.length > 0 ? (
                  <Alert.Root variant="info">
                    <Alert.Description>{t("mods.remove.sharedArchives", { names: preview.sharedArchives.join(", ") })}</Alert.Description>
                  </Alert.Root>
                ) : null}
                {preview.orphanRules > 0 ? (
                  <Alert.Root variant="warning">
                    <Alert.Description>{tp("mods.remove.orphanRules", preview.orphanRules)}</Alert.Description>
                  </Alert.Root>
                ) : null}
              </>
            ) : error ? null : (
              <Spinner label={t("common.loading")} />
            )}
            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button tone="danger" disabled={busy || !preview} loading={busy} startIcon={<Trash2 aria-hidden="true" />} onClick={() => void remove()}>
            {t("mods.action.remove")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** DLG-13: the category tree of the instance (create, rename, move, delete). */
export function CategoriesDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const categories = useCategories(instance);
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  if (!open) return null;
  const list = categories.status === "ready" ? categories.data : [];
  const options = categoryOptions(list);

  const save = async () => {
    if (!editing) return;
    const result = await run(() => backend.saveCategory(instance, editing), { quiet: true });
    if (result.ok) {
      setEditing(null);
      setError(null);
    } else setError(result.error);
  };

  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("mods.categories.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            {categories.status === "error" ? <ErrorAlert title="mods.loadError" error={categories.error} onRetry={categories.reload} /> : null}
            <ul className="max-h-[40vh] overflow-auto rounded-lg border border-border text-sm">
              {options.map((o) => {
                const c = list.find((x) => x.id === o.value)!;
                return (
                  <li key={o.value} className="flex items-center gap-2 border-b border-border-subtle px-3 py-1.5 last:border-b-0">
                    <span className="min-w-0 flex-1 truncate text-fg">{o.label}</span>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...c })}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      tone="danger"
                      aria-label={t("mods.categories.delete", { name: c.name })}
                      onClick={() => void run(() => backend.deleteCategory(instance, c.id))}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
              {options.length === 0 ? <li className="px-3 py-2 text-fg-muted">{t("mods.categories.empty")}</li> : null}
            </ul>
            {editing ? (
              <Stack gap="sm" className="rounded-lg border border-border p-3">
                <Input.Root fullWidth value={editing.name} onChange={(v: string) => setEditing({ ...editing, name: v })} error={error ? errorMessage(i18n, error) : false}>
                  <Input.Label>{t("mods.categories.name")}</Input.Label>
                  <Input.Box>
                    <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && void save()} />
                  </Input.Box>
                  <Input.Error />
                </Input.Root>
                <Input.Root fullWidth value={editing.parent ?? ""} onChange={(v: string) => setEditing({ ...editing, parent: v })}>
                  <Input.Label>{t("mods.categories.parent")}</Input.Label>
                  <Input.Select options={[{ value: "", label: t("mods.categories.topLevel") }, ...options.filter((o) => o.value !== editing.id)]} />
                </Input.Root>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" disabled={!editing.name.trim()} onClick={() => void save()}>
                    {t("common.save")}
                  </Button>
                </div>
              </Stack>
            ) : (
              <div>
                <Button size="sm" variant="outline" startIcon={<Plus aria-hidden="true" />} onClick={() => setEditing({ id: "", name: "", parent: "", order: 0 })}>
                  {t("mods.categories.add")}
                </Button>
              </div>
            )}
            <Typography variant="caption" color="muted-fg">
              {t("mods.categories.help")}
            </Typography>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
