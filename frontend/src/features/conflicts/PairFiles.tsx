import { useEffect, useMemo, useState } from "react";
import { Equal, RotateCcw } from "lucide-react";
import { Button, Indicator, Input, Tree, Typography, type TreeNode } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import type { ConflictFile, FileLocation } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { formatSize } from "../mods/mod-labels";
import { locationKey, locationText, modLabel, useConflictText } from "./conflict-labels";

/** A folder or a disputed file of the tree. */
type Node = TreeNode<ConflictFile | null>;

/**
 * Builds the folder tree of disputed files: one root per target, folders by
 * path segment; leaf ids are location keys. Presentation of backend data.
 */
export function buildFileTree(files: readonly ConflictFile[]): Node[] {
  const roots: Node[] = [];
  const folders = new Map<string, Node & { children: Node[] }>();
  const folder = (id: string, label: string, parent: Node[] | undefined) => {
    let f = folders.get(id);
    if (!f) {
      f = { id, label, children: [], data: null };
      folders.set(id, f);
      (parent ?? roots).push(f);
    }
    return f;
  };
  for (const file of files) {
    const segments = file.location.path.split("/");
    const ids = folderIds(file.location);
    let parent = folder(ids[0]!, file.location.target, undefined);
    for (let i = 0; i < segments.length - 1; i++) parent = folder(ids[i + 1]!, segments[i]!, parent.children);
    parent.children.push({ id: locationKey(file.location), label: segments.at(-1)!, data: file });
  }
  return roots;
}

/** Ids of the target and folders above a location, outermost first. */
function folderIds(l: FileLocation): string[] {
  const segments = l.path.split("/");
  return [`\u0000${l.target}`, ...segments.slice(0, -1).map((_, i) => `\u0000${l.target}:${segments.slice(0, i + 1).join("/").toLowerCase()}`)];
}

interface PairFilesProps {
  instance: string;
  files: readonly ConflictFile[];
  /** Location to select first (DLG-09 opened for one file). */
  focus?: FileLocation | null;
}

/**
 * Disputed files of a pair (L5): one winner select per file listing the
 * providers in priority order, the reason of each winner, batch choice over
 * checked files or folders, "Voltar ao padrão" and the comparison of the
 * providers (size and hash). Choosing only calls the backend.
 */
export function PairFiles({ instance, files, focus }: PairFilesProps) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const text = useConflictText();
  const backend = useBackend();
  const run = useAction();
  const nodes = useMemo(() => buildFileTree(files), [files]);
  const byKey = useMemo(() => new Map(files.map((f) => [locationKey(f.location), f])), [files]);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(focus ? locationKey(focus) : null);
  const [batchWinner, setBatchWinner] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Folders open by default when the list is short, and around the focus.
  useEffect(() => {
    const open = new Set<string>(focus ? folderIds(focus) : []);
    const walk = (list: readonly Node[]) => {
      for (const n of list) {
        if (!n.children) continue;
        if (files.length <= 200) open.add(n.id);
        walk(n.children);
      }
    };
    walk(nodes);
    setExpanded(open);
  }, [nodes, files.length, focus]);
  useEffect(() => setChecked(new Set([...checked].filter((k) => byKey.has(k)))), [byKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = [...checked].flatMap((k) => byKey.get(k) ?? []);
  // A batch winner must provide every checked file and be enabled.
  const common = chosen.length
    ? chosen[0]!.providers.filter((p) => p.enabled && chosen.every((f) => f.providers.some((q) => q.id === p.id)))
    : [];
  const locs = (list: readonly ConflictFile[]) => list.map((f) => f.location);
  const choose = (winner: string, list: readonly ConflictFile[]) => run(() => backend.setFileOverrides(instance, winner, locs(list)));
  const reset = (list: readonly ConflictFile[]) => run(() => backend.clearFileOverrides(instance, locs(list)));
  const current = selected ? byKey.get(selected) : undefined;

  const renderEnd = (node: Node) => {
    const file = node.data;
    if (!file) return <span className="text-xs text-fg-muted">{tp("conflicts.files", countLeaves(node))}</span>;
    const redundant = file.resolution === "redundant";
    return (
      <>
        {redundant ? <Indicator icon={Equal} tone="subtle" label={t("conflicts.resolution.redundant")} /> : null}
        <span className={`w-28 truncate text-xs ${redundant ? "text-fg-subtle" : "text-fg-muted"}`}>{text.resolution(file.resolution)}</span>
        <Input.Root value={file.winner} onChange={(v: string) => v !== file.winner && void choose(v, [file])}>
          <Input.Select
            aria-label={t("conflicts.winnerOf", { path: locationText(file.location) })}
            options={[...file.providers].reverse().map((p) => ({ value: p.id, label: modLabel(t, p), disabled: !p.enabled }))}
          />
        </Input.Root>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("conflicts.resetOne", { path: locationText(file.location) })}
          title={t("conflicts.reset")}
          disabled={!file.override}
          onClick={() => void reset([file])}
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
        </Button>
      </>
    );
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div role="toolbar" aria-label={t("conflicts.batch.label")} className="flex flex-wrap items-center gap-2">
        <Typography variant="caption" color="muted-fg">
          {checked.size > 0 ? tp("conflicts.batch.selected", checked.size) : t("conflicts.batch.hint")}
        </Typography>
        {checked.size > 0 ? (
          <>
            <Input.Root value={batchWinner} onChange={setBatchWinner}>
              <Input.Select
                aria-label={t("conflicts.batch.winner")}
                placeholder={t("conflicts.batch.winner")}
                options={[...common].reverse().map((p) => ({ value: p.id, label: modLabel(t, p) }))}
              />
            </Input.Root>
            <Button
              size="sm"
              disabled={!common.some((p) => p.id === batchWinner)}
              onClick={async () => {
                const res = await choose(batchWinner, chosen);
                if (res.ok) setChecked(new Set());
              }}
            >
              {t("conflicts.batch.apply")}
            </Button>
            <Button size="sm" variant="outline" disabled={!chosen.some((f) => f.override)} onClick={() => void reset(chosen.filter((f) => f.override))}>
              {t("conflicts.reset")}
            </Button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <Tree
          aria-label={t("conflicts.filesLabel")}
          nodes={nodes}
          expanded={expanded}
          onExpandedChange={setExpanded}
          selectedId={selected ?? undefined}
          onSelect={(n) => n.data && setSelected(n.id)}
          checkedIds={checked}
          onCheckedIdsChange={setChecked}
          renderEnd={renderEnd}
          labels={{ expand: t("common.expand"), collapse: t("common.collapse"), check: (n) => t("conflicts.check", { name: String(n.label) }) }}
        />
      </div>
      {current ? <Compare file={current} language={i18n.language} /> : null}
    </div>
  );
}

function countLeaves(node: Node): number {
  return node.children ? node.children.reduce((n, c) => n + countLeaves(c), 0) : 1;
}

/** "Comparar": size and hash of each provider (ui/telas/conflicts.md §4). */
function Compare({ file, language }: { file: ConflictFile; language: string }) {
  const { t } = useI18n();
  const hashes = file.providers.map((p) => p.hash ?? "");
  const verdict = file.resolution === "redundant"
    ? "conflicts.compare.identical"
    : hashes.every(Boolean) || new Set(file.providers.map((p) => p.size)).size > 1
      ? "conflicts.compare.different"
      : "conflicts.compare.unknown";
  return (
    <section aria-label={t("conflicts.compare.title", { path: locationText(file.location) })} className="rounded-lg border border-border bg-structure p-3 text-sm">
      <Typography variant="body-sm" color="fg" className="mb-2 font-medium">
        {t("conflicts.compare.title", { path: locationText(file.location) })} · {t(verdict)}
      </Typography>
      <table className="w-full text-xs">
        <tbody>
          {[...file.providers].reverse().map((p) => (
            <tr key={p.id} className={p.id === file.winner ? "font-medium text-fg" : "text-fg-muted"}>
              <td className="py-0.5 pr-3">{modLabel(t, p)}</td>
              <td className="py-0.5 pr-3 text-right tabular-nums">{formatSize(language, p.size)}</td>
              <td className="py-0.5 font-mono">{p.hash ? `${p.hash.slice(0, 12)}…` : t("common.empty")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
