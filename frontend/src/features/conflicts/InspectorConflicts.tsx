import { useState } from "react";
import { ArrowDown, ArrowUp, Equal, EyeOff } from "lucide-react";
import { Button, Indicator, Input, Spinner, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useModConflictFiles, useModConflicts } from "../../bridge/queries";
import type { ConflictFileState, ConflictOpponent, FileLocation } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useAction } from "../games/use-action";
import { formatSize } from "../mods/mod-labels";
import { modLabel, useConflictText } from "./conflict-labels";

/** Inspector › Conflitos (ui/telas/mods.md §6): Vence / Perde / Redundante by opponent. */
export function InspectorConflicts({ instance, mod, onEdit }: { instance: string; mod: string; onEdit: () => void }) {
  const { t, tp } = useI18n();
  const text = useConflictText();
  const data = useModConflicts(instance, mod);
  if (data.status === "error") return <ErrorAlert title="conflicts.loadError" error={data.error} onRetry={data.reload} />;
  if (data.status !== "ready") return <Spinner label={t("common.loading")} />;
  const { opponents, indicator } = data.data;
  if (opponents.length === 0) {
    return (
      <Typography variant="body-sm" color="muted-fg">
        {t("conflicts.inspector.none")}
      </Typography>
    );
  }
  const groups: { key: MessageKey; list: ConflictOpponent[]; count: (o: ConflictOpponent) => number }[] = [
    { key: "conflicts.inspector.wins", list: opponents.filter((o) => o.wins > 0), count: (o) => o.wins },
    { key: "conflicts.inspector.loses", list: opponents.filter((o) => o.loses > 0), count: (o) => o.loses },
    { key: "conflicts.inspector.redundant", list: opponents.filter((o) => o.redundant > 0), count: (o) => o.redundant },
  ];
  return (
    <Stack gap="md">
      <div className="flex items-center justify-between gap-2">
        <Typography variant="body-sm" color="fg">
          {t(`conflicts.indicator.${indicator}` as MessageKey)}
        </Typography>
        <Button size="sm" variant="outline" onClick={onEdit}>
          {t("mods.action.editConflicts")}
        </Button>
      </div>
      {groups.map((g) =>
        g.list.length > 0 ? (
          <section key={g.key} aria-label={t(g.key)}>
            <Typography variant="caption" color="muted-fg" className="mb-1 block uppercase">
              {t(g.key)}
            </Typography>
            <ul className="flex flex-col gap-1 text-sm">
              {g.list.map((o) => (
                <li key={o.opponent.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-fg">{modLabel(t, o.opponent)}</span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    {tp("conflicts.files", g.count(o))} · {text.decision(o.decision)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </Stack>
  );
}

const STATE_ICON = { wins: ArrowUp, loses: ArrowDown, redundant: Equal, hidden: EyeOff } as const;

/**
 * Inspector › Arquivos: the footprint with a mark per file (vence / perde
 * para X / redundante / ocultado) and "Escolher vencedor…", "Ocultar
 * arquivo" / "Mostrar".
 */
export function InspectorFiles({
  instance,
  mod,
  onChooseWinner,
}: {
  instance: string;
  mod: string;
  onChooseWinner: (pair: { a: string; b: string; focus: FileLocation }) => void;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [filter, setFilter] = useState("");
  const files = useModConflictFiles(instance, mod, filter);
  const mark = (state: ConflictFileState, winner?: string) =>
    state === "loses" ? t("conflicts.fileState.losesTo", { name: winner ?? "" }) : t(`conflicts.fileState.${state}` as MessageKey);
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
          <ul className="max-h-[50vh] overflow-auto rounded-lg border border-border text-xs">
            {files.data.files.map((f) => {
              const rival = f.winner?.id ?? f.opponents[0]?.id;
              return (
                <li key={`${f.location.target}:${f.location.path}`} className="flex flex-col gap-1 border-b border-border-subtle px-2 py-1.5 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-fg-subtle">{f.location.target}</span>
                    <span className={`min-w-0 flex-1 break-all font-mono ${f.state === "hidden" || f.state === "redundant" ? "text-fg-subtle" : "text-fg"}`}>{f.location.path}</span>
                    <span className="shrink-0 text-fg-muted">{formatSize(i18n.language, f.size)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {f.state !== "none" ? (
                      <Indicator
                        icon={STATE_ICON[f.state]}
                        tone={f.state === "loses" ? "warning" : "subtle"}
                        label={mark(f.state, f.winner?.name)}
                      />
                    ) : null}
                    {f.state !== "none" ? <span className="text-fg-muted">{mark(f.state, f.winner?.name)}</span> : null}
                    {f.overridden ? <span className="text-fg-muted">· {t("conflicts.resolution.override")}</span> : null}
                    <span className="ml-auto flex gap-1">
                      {rival && f.state !== "hidden" ? (
                        <Button size="sm" variant="ghost" onClick={() => onChooseWinner({ a: mod, b: rival, focus: f.location })}>
                          {t("conflicts.chooseWinner")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void run(() => backend.setFileExclusions(instance, mod, [f.location], f.state !== "hidden"))}
                      >
                        {t(f.state === "hidden" ? "conflicts.showFile" : "conflicts.hideFile")}
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
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
