import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { Alert, Badge, Button, Input, Modal, Spinner, Stack, Table, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { toUIError, type UIError } from "../../bridge/errors";
import { useConflictPairDetail, useModConflicts, useRuleCycle } from "../../bridge/queries";
import type { ConflictOpponent, FileLocation, PairChoice, PairDecision, RulePreview } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { DialogError, RuleMoves } from "../mods/OrderDialogs";
import { modLabel, useConflictText } from "./conflict-labels";
import { PairFiles } from "./PairFiles";

/**
 * Saves pair decisions as order rules (D004: only by explicit choice).
 * The backend previews first: a cycle refuses, moves are shown for
 * confirmation (core/05 §4), no move applies right away.
 */
export function usePairDecisions(instance: string) {
  const backend = useBackend();
  const run = useAction();
  const [pending, setPending] = useState<{ decisions: PairDecision[]; preview: RulePreview; done?: () => void } | null>(null);
  const [error, setError] = useState<UIError | null>(null);
  const apply = useCallback(
    async (decisions: PairDecision[], done?: () => void) => {
      const res = await run(() => backend.decidePairs(instance, decisions), { success: "conflicts.decided" });
      if (res.ok) {
        setPending(null);
        done?.();
      }
      return res.ok;
    },
    [run, backend, instance],
  );
  const decide = useCallback(
    async (decisions: PairDecision[], done?: () => void) => {
      setError(null);
      try {
        const preview = await backend.previewPairDecisions(instance, decisions);
        if (preview.cycle.length > 0 || preview.profiles.length > 0) setPending({ decisions, preview, done });
        else await apply(decisions, done);
      } catch (e) {
        setError(toUIError(e));
        setPending({ decisions, preview: { cycle: [], profiles: [] }, done });
      }
    },
    [backend, instance, apply],
  );
  const dialog = pending ? (
    <DecisionPreviewDialog
      preview={pending.preview}
      error={error}
      onCancel={() => setPending(null)}
      onConfirm={() => void apply(pending.decisions, pending.done)}
    />
  ) : null;
  return { decide, dialog };
}

function DecisionPreviewDialog({ preview, error, onCancel, onConfirm }: { preview: RulePreview; error: UIError | null; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  const cycle = preview.cycle.map((m) => m.name).join(" → ");
  return (
    <Modal.Root open onOpenChange={(o) => !o && onCancel()}>
      <Modal.Content size="md" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t(cycle ? "mods.rules.cycleTitle" : "conflicts.preview.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="sm">
            {cycle ? (
              <Alert.Root variant="danger">
                <Alert.Description>{t("mods.rules.cycle", { cycle })}</Alert.Description>
              </Alert.Root>
            ) : (
              <>
                <Typography variant="body-sm" color="fg">
                  {t("conflicts.preview.description")}
                </Typography>
                <RuleMoves preview={preview} />
              </>
            )}
            <DialogError error={error} />
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onCancel}>
            {t(cycle ? "common.close" : "common.cancel")}
          </Button>
          {!cycle && !error ? <Button onClick={onConfirm}>{t("conflicts.preview.confirm")}</Button> : null}
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** What decides an opponent today, in words (never "porque sim"). */
function useOpponentReason() {
  const { t } = useI18n();
  const text = useConflictText();
  return (o: ConflictOpponent, self: string) => {
    if (o.decision === "redundant") return text.decision("redundant");
    const who = o.wins > o.loses ? self : o.opponent.name;
    return t("conflicts.editor.today", { name: who, reason: text.decision(o.decision) });
  };
}

function currentChoice(o: ConflictOpponent, mod: string): PairChoice {
  if (!o.rule || o.rule.disabled) return "order";
  return o.rule.winner === mod ? "wins" : "loses";
}

/**
 * DLG-08 Editor de conflitos do mod: per opponent, who wins today and why,
 * and the choice "Este vence" / "O outro vence" / "Pela ordem (sem regra)".
 * Saving creates/removes order rules and reviews the pairs.
 */
export function ConflictEditorDialog({
  instance,
  mod,
  onClose,
  onFiles,
}: {
  instance: string;
  mod: string | null;
  onClose: () => void;
  onFiles: (a: string, b: string) => void;
}) {
  if (!mod) return null;
  return <ConflictEditor instance={instance} mod={mod} onClose={onClose} onFiles={onFiles} />;
}

function ConflictEditor({ instance, mod, onClose, onFiles }: { instance: string; mod: string; onClose: () => void; onFiles: (a: string, b: string) => void }) {
  const { t, tp } = useI18n();
  const conflicts = useModConflicts(instance, mod);
  const reason = useOpponentReason();
  const { decide, dialog } = usePairDecisions(instance);
  const [choices, setChoices] = useState<Record<string, PairChoice>>({});
  const data = conflicts.status === "ready" ? conflicts.data : null;
  useEffect(() => {
    if (data) setChoices(Object.fromEntries(data.opponents.map((o) => [o.opponent.id, currentChoice(o, mod)])));
  }, [data, mod]);
  const changed = data ? data.opponents.filter((o) => choices[o.opponent.id] && choices[o.opponent.id] !== currentChoice(o, mod)) : [];
  const save = () =>
    void decide(
      changed.map((o) => ({ mod, opponent: o.opponent.id, choice: choices[o.opponent.id]! })),
      onClose,
    );

  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("conflicts.editor.title", { name: data?.mod.name ?? "" })}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="min-h-0 overflow-auto">
          {conflicts.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
          {conflicts.status === "error" ? <ErrorAlert title="conflicts.loadError" error={conflicts.error} onRetry={conflicts.reload} /> : null}
          {data && data.opponents.length === 0 ? (
            <Typography variant="body-sm" color="muted-fg">
              {t("conflicts.editor.none")}
            </Typography>
          ) : null}
          {data && data.opponents.length > 0 ? (
            <Table.Root aria-label={t("conflicts.editor.title", { name: data.mod.name })}>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("conflicts.editor.opponent")}</Table.Head>
                  <Table.Head>{t("conflicts.editor.files")}</Table.Head>
                  <Table.Head>{t("conflicts.editor.todayHead")}</Table.Head>
                  <Table.Head>{t("conflicts.editor.choice")}</Table.Head>
                  <Table.Head />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.opponents.map((o) => (
                  <Table.Row key={o.opponent.id}>
                    <Table.Cell className="text-fg">
                      <span className="flex flex-wrap items-center gap-2">
                        {modLabel(t, o.opponent)}
                        {o.needsReview ? <Badge tone="info">{t("conflicts.unreviewed")}</Badge> : null}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {tp("conflicts.files", o.files)}
                      <span className="block text-xs text-fg-muted">{t("conflicts.editor.split", { wins: o.wins, loses: o.loses })}</span>
                    </Table.Cell>
                    <Table.Cell className="text-sm text-fg-muted">{reason(o, data.mod.name)}</Table.Cell>
                    <Table.Cell>
                      <Input.Root value={choices[o.opponent.id] ?? "order"} onChange={(v: string) => setChoices({ ...choices, [o.opponent.id]: v as PairChoice })}>
                        <Input.Select
                          aria-label={t("conflicts.editor.choiceFor", { name: o.opponent.name })}
                          options={(["wins", "loses", "order"] as const).map((c) => ({ value: c, label: t(`conflicts.choice.${c}` as MessageKey, { name: data.mod.name, other: o.opponent.name }) }))}
                        />
                      </Input.Root>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => onFiles(mod, o.opponent.id)}>
                        {t("conflicts.editor.filesLink")}
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={changed.length === 0} onClick={save}>
            {t("common.save")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
      {dialog}
    </Modal.Root>
  );
}

/** DLG-09 Escolher vencedor de arquivos, for one pair (optionally one file). */
export function FileWinnersDialog({
  instance,
  pair,
  onClose,
}: {
  instance: string;
  pair: { a: string; b: string; focus?: FileLocation } | null;
  onClose: () => void;
}) {
  if (!pair) return null;
  return <FileWinners instance={instance} a={pair.a} b={pair.b} focus={pair.focus ?? null} onClose={onClose} />;
}

function FileWinners({ instance, a, b, focus, onClose }: { instance: string; a: string; b: string; focus: FileLocation | null; onClose: () => void }) {
  const { t } = useI18n();
  const detail = useConflictPairDetail(instance, a, b, false);
  const pair = detail.status === "ready" ? detail.data.pair : null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="wide" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{pair ? t("conflicts.files.title", { a: pair.a.name, b: pair.b.name }) : t("common.loading")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="flex min-h-0 flex-1 flex-col">
          {detail.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
          {detail.status === "error" ? <ErrorAlert title="conflicts.loadError" error={detail.error} onRetry={detail.reload} /> : null}
          {detail.status === "ready" ? (
            detail.data.files.length === 0 ? (
              <Typography variant="body-sm" color="muted-fg">
                {t("conflicts.files.none")}
              </Typography>
            ) : (
              <PairFiles instance={instance} files={detail.data.files} focus={focus} />
            )
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * DLG-12 Resolver ciclo: the rules of the cycle (only possible from
 * metadata, D028) with "Desativar" on each. The graph view is V1.x.
 */
export function CycleDialog({ instance, open, onClose }: { instance: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const cycle = useRuleCycle(instance);
  if (!open) return null;
  const data = cycle.status === "ready" ? cycle.data : null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("conflicts.cycle.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {cycle.status === "loading" ? <Spinner label={t("common.loading")} /> : null}
          {cycle.status === "error" ? <ErrorAlert title="conflicts.loadError" error={cycle.error} onRetry={cycle.reload} /> : null}
          {cycle.status === "ready" && !data ? (
            <Typography variant="body-sm" color="muted-fg">
              {t("conflicts.cycle.none")}
            </Typography>
          ) : null}
          {data ? (
            <Stack gap="sm">
              <Typography variant="body-sm" color="fg">
                {t("conflicts.cycle.description", { cycle: [...data.mods, data.mods[0]!].map((m) => m.name).join(" → ") })}
              </Typography>
              <Table.Root aria-label={t("conflicts.cycle.title")}>
                <Table.Body>
                  {data.rules.map((r) => (
                    <Table.Row key={r.id}>
                      <Table.Cell className="text-fg">{t("mods.rule.wins", { a: r.winner.name, b: r.loser.name })}</Table.Cell>
                      <Table.Cell>{t(`mods.rule.source.${r.source}` as MessageKey)}</Table.Cell>
                      <Table.Cell className="text-right">
                        <Button size="sm" variant="outline" startIcon={<Ban aria-hidden="true" />} onClick={() => void run(() => backend.setRuleDisabled(instance, r.id, true))}>
                          {t("mods.rules.disable")}
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Stack>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
