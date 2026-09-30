import { Button, Kbd, Modal, Stack, Typography } from "dettmann-ui";
import { useAppInfo } from "../bridge/queries";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { SHORTCUTS } from "./shortcuts";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: DialogProps) {
  const { t } = useI18n();
  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("shortcuts.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.description} className="contents">
                <dt>
                  <Kbd>{shortcut.keys}</Kbd>
                </dt>
                <dd className="text-fg">{t(shortcut.description)}</dd>
              </div>
            ))}
          </dl>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

export function AboutDialog({ open, onOpenChange }: DialogProps) {
  const { t } = useI18n();
  const info = useAppInfo();
  const rows: [MessageKey, string][] =
    info.status === "ready"
      ? [
          ["about.version", info.data.version],
          ["about.dataDir", info.data.dataDir],
          ["about.logsDir", info.data.logsDir],
          ["about.schema", String(info.data.schemaVersion)],
        ]
      : [];
  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("about.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {rows.length > 0 ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-fg-muted">{t(label)}</dt>
                  <dd className="break-all font-mono text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Stack gap="sm">
              <Typography variant="body-sm" color="muted-fg">
                {t("app.offlineHint")}
              </Typography>
            </Stack>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
