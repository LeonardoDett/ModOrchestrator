import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Alert, Button, Input, Modal, Radio, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import type { ManagedGame } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "./use-action";

interface DialogProps {
  game: ManagedGame | null;
  onClose: () => void;
}

/** DLG-28: rename an instance (names are unique per game). */
export function RenameDialog({ game, onClose }: DialogProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [name, setName] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(game?.name ?? "");
    setError(null);
  }, [game]);
  if (!game) return null;

  const submit = async () => {
    setBusy(true);
    const result = await run(() => backend.renameInstance(game.id, name), { quiet: true, success: "games.renamed" });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("rename.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Input.Root fullWidth value={name} onChange={setName} error={error ? errorMessage(i18n, error) : false}>
              <Input.Label>{t("rename.name")}</Input.Label>
              <Input.Box>
                <Input.Field autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim() && void submit()} />
              </Input.Box>
              <Input.Error />
            </Input.Root>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !name.trim() || name.trim() === game.name} loading={busy} onClick={() => void submit()}>
            {t("rename.submit")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** DLG-29: change the game folder of an instance; the backend revalidates it. */
export function RelocateDialog({ game, onClose }: DialogProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [root, setRoot] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRoot(game?.root ?? "");
    setError(null);
  }, [game]);
  if (!game) return null;

  const submit = async () => {
    setBusy(true);
    const result = await run(() => backend.updateInstanceLocation(game.id, root), { quiet: true, success: "relocate.done" });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()} closeOnBackdropClick={false}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("relocate.title", { name: game.name })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm" color="muted-fg">
              {t("relocate.intro")}
            </Typography>
            {game.deployed ? (
              <Alert.Root variant="warning">
                <Alert.Description>{t("relocate.deployed")}</Alert.Description>
              </Alert.Root>
            ) : null}
            <Input.Root fullWidth value={root} onChange={setRoot}>
              <Input.Label>{t("wizard.installation.folder")}</Input.Label>
              <Input.Box>
                <Input.Field autoFocus />
              </Input.Box>
            </Input.Root>
            <div>
              <Button
                size="sm"
                variant="outline"
                startIcon={<FolderOpen aria-hidden="true" className="h-4 w-4" />}
                onClick={async () => {
                  try {
                    const path = await backend.pickFolder(t("wizard.pickFolder"));
                    if (path) setRoot(path);
                  } catch (raw) {
                    setError(toUIError(raw));
                  }
                }}
              >
                {t("wizard.browse")}
              </Button>
            </div>
            {error ? <ErrorAlert title="relocate.error" error={error} /> : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !root.trim() || root.trim() === game.root} loading={busy} onClick={() => void submit()}>
            {t("relocate.submit")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * DLG-03: stop managing. Destructive confirmation: keeping staging and
 * archives is the default; deleting them needs the instance name typed. A
 * deployed instance cannot be dropped yet (purge arrives with F7) and the
 * backend says so.
 */
export function UnmanageDialog({ game, onClose }: DialogProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDeleteFiles(false);
    setConfirm("");
    setError(null);
  }, [game]);
  if (!game) return null;

  const submit = async () => {
    setBusy(true);
    const result = await run(() => backend.unmanageGame(game.id, { deleteFiles, confirmName: confirm }), { quiet: true, success: "unmanage.done" });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()} closeOnBackdropClick={false}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("unmanage.title", { name: game.name })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            <Typography variant="body-sm" color="muted-fg">
              {t("unmanage.intro")}
            </Typography>
            {game.deployed ? (
              <Alert.Root variant="warning">
                <Alert.Description>{t("unmanage.deployed")}</Alert.Description>
              </Alert.Root>
            ) : null}
            <Stack gap="sm">
              <Typography variant="heading-6" color="fg">
                {t("unmanage.files")}
              </Typography>
              <Radio.Group name="unmanage-files" value={deleteFiles ? "delete" : "keep"} onValueChange={(v: string) => setDeleteFiles(v === "delete")}>
                <Radio.Item value="keep" label={t("unmanage.keep")}>
                  <span className="block text-xs text-fg-muted">{t("unmanage.keepHelp")}</span>
                </Radio.Item>
                <Radio.Item value="delete" label={t("unmanage.delete")}>
                  <span className="block text-xs text-fg-muted">{t("unmanage.deleteHelp")}</span>
                </Radio.Item>
              </Radio.Group>
            </Stack>
            {deleteFiles ? (
              <Input.Root fullWidth value={confirm} onChange={setConfirm}>
                <Input.Label>{t("unmanage.confirm", { name: game.name })}</Input.Label>
                <Input.Box>
                  <Input.Field autoComplete="off" />
                </Input.Box>
              </Input.Root>
            ) : null}
            {error ? <ErrorAlert title="unmanage.error" error={error} /> : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={busy || game.deployed || (deleteFiles && confirm.trim() !== game.name.trim())}
            onClick={() => void submit()}
          >
            {t("unmanage.submit")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
