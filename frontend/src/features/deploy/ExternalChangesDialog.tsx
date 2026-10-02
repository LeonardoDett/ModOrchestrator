import { useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Alert, Badge, Button, Input, Modal, Stack, Table, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, type UIError } from "../../bridge/errors";
import { useModList } from "../../bridge/queries";
import type { DeployChange, ExternalAction, ExternalChangeKind, ExternalDecision, FileFacts } from "../../bridge/types";
import { useI18n, type MessageKey, type Translator } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { formatBytes, locationText } from "./deploy-labels";

/** Group order of DLG-15 (core/09 §4). */
const GROUPS: ExternalChangeKind[] = ["missing", "modified", "replaced", "unexpected", "permission", "load_order"];

type Choices = Record<string, ExternalAction | "">;

function keyOf(c: DeployChange) {
  return `${c.location.target}|${c.location.path.toLowerCase()}`;
}

function facts(i18n: Translator, f: FileFacts | undefined) {
  if (!f) return i18n.t("external.absent");
  return f.modTime ? `${formatBytes(f.size)} · ${i18n.formatDateTime(f.modTime)}` : formatBytes(f.size);
}

/** The actions every row of a group offers, in the order of the first row. */
function commonActions(rows: DeployChange[]): ExternalAction[] {
  if (rows.length === 0) return [];
  return rows[0]!.actions.filter((a) => rows.every((r) => r.actions.includes(a)));
}

export interface ExternalChangesDialogProps {
  instance: string;
  changes: DeployChange[];
  /** Totals before the backend truncated the lists. */
  changeCount: number;
  newFileCount: number;
  /**
   * "deploy": the decision of a deploy waiting at await_decision (Apply
   * continues it, Cancel stops it). "review": outside a deploy (Apply runs a
   * deploy that applies the decisions, D080).
   */
  mode: "deploy" | "review";
  busy?: boolean;
  error?: UIError | null;
  onApply: (decisions: ExternalDecision[]) => void;
  onCancel: () => void;
}

/**
 * DLG-15 Alterações externas (core/09 §6): rows grouped by kind, each with
 * the actions the backend offers and its suggestion pre-selected (nothing
 * for generated files), "apply to all" per group, and the destination of
 * captures. The UI only collects choices; the backend validates and acts.
 */
export function ExternalChangesDialog({ instance, changes, changeCount, newFileCount, mode, busy, error, onApply, onCancel }: ExternalChangesDialogProps) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const mods = useModList(instance);
  const [choices, setChoices] = useState<Choices>(() => Object.fromEntries(changes.map((c) => [keyOf(c), c.suggested ?? ""])));
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [name, setName] = useState(() => t("external.capture.defaultName", { date: i18n.formatDateTime(new Date().toISOString()) }));
  const [into, setInto] = useState("");

  const groups = useMemo(() => GROUPS.map((kind) => ({ kind, rows: changes.filter((c) => c.kind === kind) })).filter((g) => g.rows.length > 0), [changes]);
  const capturing = changes.some((c) => choices[keyOf(c)] === "capture");
  const undecided = changes.filter((c) => !choices[keyOf(c)]).length;
  const hidden = changeCount + newFileCount - changes.length;
  const installed = mods.status === "ready" ? mods.data.filter((m) => m.state === "installed") : [];
  const captureReady = !capturing || (target === "new" ? name.trim() !== "" : into !== "");

  const setGroup = (rows: DeployChange[], action: ExternalAction) => {
    const next = { ...choices };
    for (const r of rows) if (r.actions.includes(action)) next[keyOf(r)] = action;
    setChoices(next);
  };

  const apply = () => {
    const decisions: ExternalDecision[] = [];
    for (const c of changes) {
      const action = choices[keyOf(c)];
      if (!action) continue;
      const d: ExternalDecision = { location: c.location, action };
      if (action === "capture") {
        if (target === "existing") d.captureInto = into;
        else {
          d.captureName = name.trim();
          d.captureCategory = t("external.capture.category");
        }
      }
      decisions.push(d);
    }
    onApply(decisions);
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onCancel()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("external.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="min-h-0 overflow-auto">
          <Stack gap="lg">
            <Typography variant="body-sm" color="muted-fg">
              {t("external.help")}
            </Typography>
            {changes.length === 0 ? (
              <Alert.Root variant="success">
                <Alert.Description>{t("external.empty")}</Alert.Description>
              </Alert.Root>
            ) : null}
            {groups.map(({ kind, rows }) => {
              const common = commonActions(rows);
              const groupLabel = t(`external.group.${kind}` as MessageKey);
              return (
                <section key={kind} aria-label={groupLabel}>
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <Typography variant="heading-6">
                          {groupLabel} <span className="tabular-nums text-fg-muted">({rows.length})</span>
                        </Typography>
                        <Typography variant="caption" color="muted-fg">
                          {t(`external.groupHelp.${kind}` as MessageKey)}
                        </Typography>
                      </div>
                      {rows.length > 1 && common.length > 0 ? (
                        <Input.Root value="" onChange={(v: string) => v && setGroup(rows, v as ExternalAction)} disabled={busy}>
                          <Input.Box>
                            <Input.Select
                              aria-label={t("external.applyAllFor", { group: groupLabel })}
                              placeholder={t("external.applyAll")}
                              options={common.map((a) => ({ value: a, label: t(`external.action.${a}` as MessageKey) }))}
                            />
                          </Input.Box>
                        </Input.Root>
                      ) : null}
                    </div>
                    <div className="max-h-72 overflow-auto rounded-lg border border-border">
                      <Table.Root aria-label={groupLabel}>
                        <Table.Header>
                          <Table.Row>
                            <Table.Head>{t("external.col.path")}</Table.Head>
                            <Table.Head>{t("external.col.mod")}</Table.Head>
                            <Table.Head>{t("external.col.details")}</Table.Head>
                            <Table.Head>{t("external.col.action")}</Table.Head>
                            <Table.Head />
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {rows.map((c) => {
                            const k = keyOf(c);
                            const path = locationText(c.location);
                            return (
                              <Table.Row key={k}>
                                <Table.Cell className="font-mono text-xs break-all">{path}</Table.Cell>
                                <Table.Cell className="text-sm">
                                  {c.modName ?? (c.mod ? c.mod : <Badge variant="muted">{t("external.unmanaged")}</Badge>)}
                                </Table.Cell>
                                <Table.Cell className="text-xs tabular-nums text-fg-muted">
                                  {c.before ? `${facts(i18n, c.before)} → ` : null}
                                  {facts(i18n, c.after)}
                                </Table.Cell>
                                <Table.Cell className="min-w-48">
                                  <Input.Root value={choices[k] ?? ""} onChange={(v: string) => setChoices({ ...choices, [k]: v as ExternalAction })} disabled={busy}>
                                    <Input.Box>
                                      <Input.Select
                                        aria-label={t("external.actionFor", { path })}
                                        placeholder={c.suggested ? undefined : t("external.choose")}
                                        options={c.actions.map((a) => ({ value: a, label: t(`external.action.${a}` as MessageKey) }))}
                                      />
                                    </Input.Box>
                                  </Input.Root>
                                </Table.Cell>
                                <Table.Cell className="text-right">
                                  {c.kind === "unexpected" || c.kind === "permission" ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      aria-label={t("external.openFolderFor", { path })}
                                      title={t("external.openFolder")}
                                      onClick={() => void run(() => backend.openLocationFolder(instance, c.location), { quiet: true })}
                                    >
                                      <FolderOpen aria-hidden="true" className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                </Table.Cell>
                              </Table.Row>
                            );
                          })}
                        </Table.Body>
                      </Table.Root>
                    </div>
                  </Stack>
                </section>
              );
            })}
            {hidden > 0 ? (
              <Typography variant="caption" color="muted-fg">
                {tp("external.more", hidden)}
              </Typography>
            ) : null}
            {capturing ? (
              <section aria-label={t("external.capture.title")} className="rounded-lg border border-border bg-sunken p-3">
                <Stack gap="sm">
                  <Typography variant="heading-6">{t("external.capture.title")}</Typography>
                  <Typography variant="caption" color="muted-fg">
                    {t("external.capture.help")}
                  </Typography>
                  <div className="grid gap-3 sm:grid-cols-[minmax(10rem,auto)_1fr]">
                    <Input.Root value={target} onChange={(v: string) => setTarget(v as "new" | "existing")} disabled={busy}>
                      <Input.Label>{t("external.capture.destination")}</Input.Label>
                      <Input.Box>
                        <Input.Select
                          options={[
                            { value: "new", label: t("external.capture.new") },
                            { value: "existing", label: t("external.capture.existing") },
                          ]}
                        />
                      </Input.Box>
                    </Input.Root>
                    {target === "new" ? (
                      <Input.Root value={name} onChange={(v: string) => setName(v)} disabled={busy} fullWidth>
                        <Input.Label>{t("external.capture.name")}</Input.Label>
                        <Input.Box>
                          <Input.Field />
                        </Input.Box>
                      </Input.Root>
                    ) : (
                      <Input.Root value={into} onChange={(v: string) => setInto(v)} disabled={busy} fullWidth>
                        <Input.Label>{t("external.capture.mod")}</Input.Label>
                        <Input.Box>
                          <Input.Select placeholder={t("external.capture.chooseMod")} options={installed.map((m) => ({ value: m.id, label: m.name }))} />
                        </Input.Box>
                      </Input.Root>
                    )}
                  </div>
                </Stack>
              </section>
            ) : null}
            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          {undecided > 0 ? (
            <Typography variant="caption" color="muted-fg" className="mr-auto">
              {tp("external.undecided", undecided)}
            </Typography>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {t(mode === "deploy" ? "deploy.decision.cancel" : "common.close")}
          </Button>
          <Button disabled={busy || changes.length === 0 || !captureReady || (mode === "review" && undecided === changes.length)} onClick={apply}>
            {t("external.apply")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
