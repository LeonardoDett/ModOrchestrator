import { useMemo, useState } from "react";
import { CheckIcon, FileIcon, FolderOpenIcon, MinusIcon, PlusIcon, SearchIcon, XIcon } from "dettmann-ui/icons";
import { Alert, Button, ConfirmDialog, Input, Loader, Modal, SegmentedControl, Tag, useToast } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useGamesCatalog, useGamesView } from "../../bridge/queries";
import type { FolderRecognition, GameSupport } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { useStoreLabel } from "./GameDetails";
import { gameInitials } from "./GameSwitcher";
import type { WizardStart } from "./ManageGameWizard";
import { useAction } from "./use-action";

type LevelFilter = "all" | "full" | "declared" | "custom";

/** Support level as the list shows it: a game the user described is "custom" whatever the registry says. */
function levelOf(g: GameSupport): "full" | "declared" | "custom" {
  if (g.custom) return "custom";
  return g.support === "full" ? "full" : "declared";
}

/**
 * The catalog of the list: a game the user described (D117, in GameEntries)
 * is marked custom; the registry's own template for custom games is left
 * out, since "Criar jogo personalizado" is how one is made.
 */
function catalogRows(support: readonly GameSupport[], userIds: ReadonlySet<string>): GameSupport[] {
  return support.filter((g) => userIds.has(g.gameId) || !g.custom).map((g) => ({ ...g, custom: userIds.has(g.gameId) }));
}

const LEVEL_INTENT = { full: "success", declared: "info", custom: undefined } as const;

/** Features worth naming in a row, in this order. */
const SUMMARY_FEATURES = ["plugins", "load_order", "save_games"];

interface AddGameDialogProps {
  open: boolean;
  onClose: () => void;
  /** Gerenciar: the assistant for the chosen game. */
  onManage: (start: WizardStart) => void;
  /** Criar jogo personalizado (DLG-02). */
  onCreate: () => void;
}

/**
 * Adicionar jogo (board JogosSuportados, R5b and R5c): the games the app
 * serves and the ones the user created, with their support level, stores
 * and features; the chosen one on the right with Gerenciar. A custom game
 * can be exported to a file, imported from one, or deleted when no instance
 * uses it. The data come from GamesSupport and GameEntries.
 */
export function AddGameDialog({ open, onClose, onManage, onCreate }: AddGameDialogProps) {
  if (!open) return null;
  return (
    <Modal.Root open onOpenChange={(o) => !o && onClose()}>
      <Modal.Content size="custom" className="flex h-[min(48.75rem,95vh)] w-full max-w-[min(67.5rem,96vw)] flex-col" aria-describedby="add-game-help">
        <Body onClose={onClose} onManage={onManage} onCreate={onCreate} />
      </Modal.Content>
    </Modal.Root>
  );
}

function Body({ onClose, onManage, onCreate }: Omit<AddGameDialogProps, "open">) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { addToast } = useToast();
  const store = useStoreLabel();
  const catalog = useGamesCatalog();
  const view = useGamesView(true);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [chosen, setChosen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GameSupport | null>(null);
  // R5d: a folder chosen by hand and the games it holds.
  const [folder, setFolder] = useState<{ root: string; found: FolderRecognition[] } | null>(null);
  const pointFolder = async () => {
    const picked = await run(() => backend.pickFolder(t("addGame.pickFolder")), { quiet: true });
    if (!picked.ok || !picked.value) return;
    const root = picked.value;
    const found = await run(() => backend.recognizeGameFolder(root), { quiet: true });
    if (found.ok) setFolder({ root, found: found.value });
  };

  const managedBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of view.status === "ready" ? view.data.managed : []) m.set(g.gameId, (m.get(g.gameId) ?? 0) + 1);
    return m;
  }, [view]);
  const detected = useMemo(() => new Set((view.status === "ready" ? view.data.discovered : []).map((d) => d.gameId)), [view]);

  const all = useMemo(
    () => (catalog.status === "ready" ? catalogRows(catalog.data.support, new Set(catalog.data.entries.map((e) => e.gameId))) : []),
    [catalog],
  );
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((g) => (level === "all" || levelOf(g) === level) && (!q || g.gameName.toLowerCase().includes(q)))
    .sort((a, b) => a.gameName.localeCompare(b.gameName));
  const selected = rows.find((g) => g.gameId === chosen) ?? rows[0] ?? null;
  const featureName = (id: string) => (i18n.has(`capability.${id}`) ? t(`capability.${id}` as MessageKey) : id);

  const instancesText = (g: GameSupport) => {
    const n = managedBy.get(g.gameId) ?? 0;
    if (n > 0) return tp("addGame.instances", n);
    if (detected.has(g.gameId)) return t("addGame.detected");
    return g.custom ? t("addGame.noInstance") : "";
  };
  const meta = (g: GameSupport) => {
    const offered = g.features.filter((f) => f.status === "available" && SUMMARY_FEATURES.includes(f.id)).map((f) => featureName(f.id).toLowerCase());
    const head = g.custom ? t("addGame.createdByYou") : g.stores.map(store).filter(Boolean).join(", ");
    return [head, offered.length > 0 ? offered.join(", ") : t("addGame.folderMods")].filter(Boolean).join(" · ");
  };

  const exportEntry = (g: GameSupport) =>
    void run(() => backend.saveGameEntryFile(g.gameId, t("addGame.export"), `${g.gameName}.json`)).then((r) => {
      if (r.ok && r.value) addToast({ title: t("addGame.exported"), variant: "success", duration: 3000 });
    });
  const importEntry = () =>
    void run(() => backend.openGameEntryFile(t("addGame.import"))).then((r) => {
      if (r.ok && r.value) {
        setChosen(r.value);
        catalog.reload();
      }
    });

  return (
    <>
      <Modal.Header>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Modal.Title>{t("library.add")}</Modal.Title>
          <span id="add-game-help" className="text-xs text-fg-muted">
            {t("addGame.help")}
          </span>
        </div>
        <Button size="icon" emphasis="low" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
          <XIcon size="sm" />
        </Button>
      </Modal.Header>
      <Modal.Body padding="none" className="grid grid-cols-[minmax(0,1fr)_26.25rem]">
        <div className="flex min-h-0 min-w-0 flex-col border-r border-border">
          <div className="flex flex-col gap-3 pb-3 pl-6 pr-5 pt-4">
          {folder ? <FolderBanner folder={folder} onOther={() => void pointFolder()} onManage={onManage} onCreate={onCreate} /> : null}
          <div className="flex items-center gap-2.5">
            <Input.Root fullWidth value={query} onChange={setQuery}>
              <Input.Box>
                <SearchIcon size="sm" className="text-fg-muted" />
                <Input.Field aria-label={t("addGame.search")} placeholder={t("addGame.search")} />
              </Input.Box>
            </Input.Root>
            <SegmentedControl<LevelFilter>
              size="sm"
              aria-label={t("addGame.level")}
              value={level}
              onChange={setLevel}
              options={(["all", "full", "declared", "custom"] as const).map((v) => ({ value: v, label: t(`addGame.level.${v}` as MessageKey) }))}
            />
            {folder ? null : (
              <Button startIcon={<FolderOpenIcon size="sm" />} className="shrink-0 whitespace-nowrap" onClick={() => void pointFolder()}>
                {t("addGame.pointFolder")}
              </Button>
            )}
          </div>
          </div>
          {catalog.status === "loading" ? <Loader label={t("common.loading")} /> : null}
          {catalog.status === "error" ? (
            <div className="px-6">
              <ErrorAlert title="games.loadError" error={catalog.error} onRetry={catalog.reload} />
            </div>
          ) : null}
          <div role="listbox" aria-label={t("addGame.list")} className="min-h-0 flex-1 overflow-auto border-t border-border">
            {rows.map((g) => {
              const on = selected?.gameId === g.gameId;
              const lv = levelOf(g);
              const intent = LEVEL_INTENT[lv];
              return (
                <div
                  key={g.gameId}
                  role="option"
                  aria-selected={on}
                  tabIndex={0}
                  onClick={() => setChosen(g.gameId)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setChosen(g.gameId)}
                  className={`focus-ring-inset relative grid h-15 cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3.5 border-b border-border-subtle pl-6 pr-5 motion-transition ${on ? "bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand-fill" : "hover:bg-state-hover"}`}
                >
                  <span className="flex size-9 items-center justify-center rounded-control border border-border bg-sunken text-[0.6875rem] font-bold text-fg-muted">{gameInitials(g.gameName)}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-fg">{g.gameName}</span>
                    <span className="truncate text-xs text-fg-muted">{meta(g)}</span>
                  </span>
                  <span className="text-xs text-fg-muted">{instancesText(g)}</span>
                  <Tag size="sm" outline={false} className="w-30 justify-center" {...(intent ? { intent } : { color: "violet" as const })}>
                    {t(`addGame.level.${lv}` as MessageKey)}
                  </Tag>
                </div>
              );
            })}
          </div>
          <div data-layer="medium" className="flex h-14 shrink-0 items-center gap-2 border-t border-border bg-structure pl-6 pr-5">
            <span className="flex-1 text-xs text-fg-muted">{t("addGame.notFound")}</span>
            <Button size="sm" startIcon={<FileIcon size="sm" />} onClick={importEntry}>
              {t("addGame.import")}
            </Button>
            <Button size="sm" startIcon={<PlusIcon size="sm" />} onClick={onCreate}>
              {t("addGame.create")}
            </Button>
          </div>
        </div>
        <aside aria-label={t("addGame.details")} className="flex min-h-0 min-w-0 flex-col overflow-auto bg-sunken">
          {selected ? (
            <Details
              game={selected}
              instances={managedBy.get(selected.gameId) ?? 0}
              featureName={featureName}
              onManage={() => onManage({ gameId: selected.gameId, gameName: selected.gameName })}
              onExport={() => exportEntry(selected)}
              onDelete={() => setDeleting(selected)}
            />
          ) : null}
        </aside>
      </Modal.Body>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        type="danger"
        title={t("addGame.deleteTitle", { name: deleting?.gameName ?? "" })}
        description={t("addGame.deleteDescription")}
        confirmLabel={t("addGame.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          const g = deleting;
          setDeleting(null);
          if (g) void run(() => backend.deleteGameEntry(g.gameId)).then(() => catalog.reload());
        }}
      />
    </>
  );
}

function Details({
  game,
  instances,
  featureName,
  onManage,
  onExport,
  onDelete,
}: {
  game: GameSupport;
  instances: number;
  featureName: (id: string) => string;
  onManage: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t, tp } = useI18n();
  const store = useStoreLabel();
  const lv = levelOf(game);
  const intent = LEVEL_INTENT[lv];
  const features = game.features.filter((f) => f.status === "available" || f.class === "optional");
  const note = (f: GameSupport["features"][number]) => {
    if (f.status !== "available") return t("instanceSettings.state.notApplicable");
    if (f.class !== "optional") return t("instanceSettings.menu.always");
    return t(f.default ? "addGame.optionalOn" : "addGame.optionalOff");
  };
  return (
    <div className="flex min-h-full flex-col gap-4.5 p-5">
      <div className="flex items-center gap-3.5">
        <span className="flex size-13 shrink-0 items-center justify-center rounded-card border border-border bg-surface text-sm font-bold text-fg-muted">{gameInitials(game.gameName)}</span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate text-[1.0625rem] font-semibold text-fg">{game.gameName}</span>
          <Tag size="sm" outline={false} className="self-start" {...(intent ? { intent } : { color: "violet" as const })}>
            {t(`addGame.level.${lv}` as MessageKey)}
          </Tag>
        </div>
      </div>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[0.8125rem]">
        <dt className="text-fg-muted">{t("addGame.stores")}</dt>
        <dd className="text-fg">{game.stores.length > 0 ? game.stores.map(store).join(", ") : t("addGame.noStores")}</dd>
        <dt className="text-fg-muted">{t("addGame.support")}</dt>
        <dd className="text-fg">{game.custom ? t("addGame.createdByYou") : t("instanceSettings.support.adapter", { adapter: game.adapter })}</dd>
        <dt className="text-fg-muted">{t("addGame.instancesLabel")}</dt>
        <dd className="text-fg">{instances > 0 ? tp("addGame.instances", instances) : t("addGame.noInstanceNow")}</dd>
      </dl>
      <section className="flex flex-col gap-2">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">{t("addGame.features")}</h3>
        {features.map((f) => {
          const on = f.status === "available" && (f.class !== "optional" || f.default);
          return (
            <div key={f.id} className={`flex items-center gap-2.5 text-[0.8125rem] ${on ? "text-fg" : "text-fg-muted"}`}>
              <span data-intent={on ? "success" : undefined} className={on ? "text-intent-text" : "text-fg-subtle"}>
                {on ? <CheckIcon size="sm" /> : <MinusIcon size="sm" />}
              </span>
              <span className="flex-1">{featureName(f.id)}</span>
              <span className="text-xs text-fg-muted">{note(f)}</span>
            </div>
          );
        })}
      </section>
      {game.custom ? <p className="rounded-control border border-border-subtle px-3 py-2.5 text-xs leading-normal text-fg-muted">{t("addGame.customNote")}</p> : null}
      <div className="mt-auto flex gap-2">
        {game.custom ? (
          <>
            <Button onClick={onExport}>{t("addGame.exportShort")}</Button>
            <Button emphasis="low" intent="danger" disabled={instances > 0} title={instances > 0 ? t("addGame.deleteInUse") : undefined} onClick={onDelete}>
              {t("addGame.delete")}
            </Button>
          </>
        ) : null}
        <span className="flex-1" />
        <Button emphasis="high" onClick={onManage}>
          {t("games.action.manage")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The folder chosen by hand (board JogosSuportados, R5d): the game it
 * holds with the marker that proves it, "Outra pasta" and "Gerenciar"; a
 * folder with no known game offers "Criar jogo personalizado".
 */
function FolderBanner({
  folder,
  onOther,
  onManage,
  onCreate,
}: {
  folder: { root: string; found: FolderRecognition[] };
  onOther: () => void;
  onManage: (start: WizardStart) => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const g = folder.found[0];
  if (!g) {
    return (
      <Alert.Root
        intent="warning"
        action={
          <span className="flex gap-2">
            <Button size="sm" onClick={onOther}>
              {t("addGame.otherFolder")}
            </Button>
            <Button size="sm" emphasis="high" onClick={onCreate}>
              {t("addGame.create")}
            </Button>
          </span>
        }
      >
        <Alert.Title>{t("addGame.notRecognized")}</Alert.Title>
        <Alert.Description>
          <span className="font-mono text-xs">{folder.root}</span>
        </Alert.Description>
      </Alert.Root>
    );
  }
  return (
    <Alert.Root
      intent="success"
      action={
        <span className="flex gap-2">
          <Button size="sm" onClick={onOther}>
            {t("addGame.otherFolder")}
          </Button>
          <Button size="sm" emphasis="high" onClick={() => onManage({ gameId: g.gameId, gameName: g.gameName, root: folder.root, store: "manual", version: g.version })}>
            {t("games.action.manage")}
          </Button>
        </span>
      }
    >
      <Alert.Title>{t("addGame.recognized", { name: g.gameName })}</Alert.Title>
      <Alert.Description>
        <span className="font-mono text-xs">{t("addGame.recognizedBy", { root: folder.root, marker: g.marker })}</span>
      </Alert.Description>
    </Alert.Root>
  );
}
