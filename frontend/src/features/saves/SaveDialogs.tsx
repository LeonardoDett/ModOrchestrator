import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Radio, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import type { SaveTransfer, SavesView } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { saveKindText } from "./save-labels";

/**
 * Copiar ou mover saves (board JogoSavesTransferir, D142): to another
 * profile, its own folder or the shared one. Nothing is replaced: the
 * backend says which names change, and the dialog shows it before.
 */
export function SaveTransferDialog({ instance, view, names, onClose }: { instance: string; view: SavesView; names: string[] | null; onClose: () => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const targets = view.profiles.filter((p) => !p.active && (p.local || view.local));
  const [to, setTo] = useState("");
  const [move, setMove] = useState(false);
  const [plan, setPlan] = useState<SaveTransfer | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  const key = names?.join("\n") ?? "";
  useEffect(() => {
    setTo(targets[0]?.profile ?? "");
    setMove(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    setPlan(null);
    if (!names || !to) return;
    let live = true;
    backend.previewSaveTransfer(instance, names, to).then(
      (p) => live && setPlan(p),
      (e: unknown) => live && setError(toUIError(e)),
    );
    return () => {
      live = false;
    };
  }, [backend, instance, key, to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!names) return null;

  const saves = view.saves.filter((s) => names.includes(s.name));
  const characters = [...new Set(saves.filter((s) => s.readable).map((s) => s.character))];
  const listed = i18n.language
    ? new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(saves.map((s) => (s.readable ? saveKindText(i18n, s) : s.name)))
    : "";
  const subtitle = characters.length === 1 ? t("saves.transfer.subtitleOne", { saves: listed, character: characters[0]! }) : listed;
  const target = view.profiles.find((p) => p.profile === to);
  const renamed = plan ? Object.entries(plan.renamed) : [];

  const submit = async () => {
    setBusy(true);
    const res = await run(() => backend.transferSaves(instance, names, to, move), {
      quiet: true,
      success: move ? "saves.moved" : "saves.copied",
    });
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="custom" className="w-135" aria-describedby={undefined}>
        <Modal.Header layout="stacked">
          <Modal.Title>{tp("saves.transfer.title", names.length)}</Modal.Title>
          <Typography variant="body-sm" color="muted-fg">
            {subtitle}
          </Typography>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="lg">
            {targets.length === 0 ? (
              <Alert.Root intent="info">
                <Alert.Description>{t("saves.transfer.noTarget")}</Alert.Description>
              </Alert.Root>
            ) : (
              <Stack gap="xs">
                <Input.Root fullWidth value={to} onChange={setTo}>
                  <Input.Label>{t("saves.transfer.to")}</Input.Label>
                  <Input.Select
                    options={targets.map((p) => ({ value: p.profile, label: p.name, description: t(p.local ? "saves.transfer.ownFolder" : "saves.transfer.sharedFolder") }))}
                  />
                </Input.Root>
                <Typography variant="body-sm" color="muted-fg">
                  {t("saves.transfer.sharedHelp")}
                </Typography>
              </Stack>
            )}
            <Radio.Group name="save-transfer" aria-label={t("saves.transfer.how")} value={move ? "move" : "copy"} onValueChange={(v: string) => setMove(v === "move")}>
              <Radio.Item variant="card" value="copy" label={t("saves.transfer.copy")}>
                <Typography variant="body-sm" color="muted-fg">
                  {t("saves.transfer.copyHelp", { profile: view.profileName })}
                </Typography>
              </Radio.Item>
              <Radio.Item variant="card" value="move" label={t("saves.transfer.move")}>
                <Typography variant="body-sm" color="muted-fg">
                  {t("saves.transfer.moveHelp", { profile: view.profileName })}
                </Typography>
              </Radio.Item>
            </Radio.Group>
            {target ? (
              <Alert.Root intent="info">
                <Alert.Description>
                  {renamed.length > 0
                    ? t("saves.transfer.renamed", { profile: target.name, from: renamed[0]![0], to: renamed[0]![1] }) + (renamed.length > 1 ? " " + tp("saves.transfer.renamedMore", renamed.length - 1) : "")
                    : t("saves.transfer.noReplace")}{" "}
                  {t("saves.transfer.companions")}
                </Alert.Description>
              </Alert.Root>
            ) : null}
            {error ? (
              <Alert.Root intent="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button emphasis="high" disabled={busy || !to} loading={busy} onClick={() => void submit()}>
            {tp(move ? "saves.transfer.submitMove" : "saves.transfer.submitCopy", names.length)}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
