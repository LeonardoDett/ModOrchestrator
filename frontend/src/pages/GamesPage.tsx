import { useMemo, useState, type ReactNode } from "react";
import { CheckIcon, CircleAlertIcon, EyeIcon, EyeOffIcon, FolderOpenIcon, MoreHorizontalIcon, PlusIcon, UploadIcon } from "dettmann-ui/icons";
import { Alert, Button, Icon, Menu, SegmentedControl, type IconComponent } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useGamesView, useLibraryGames } from "../bridge/queries";
import type { DiscoveredGame, InstanceFolder, LibraryGame, ManagedGame } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { AddGameDialog } from "../features/games/AddGameDialog";
import { GameAccent } from "../features/games/GameAccent";
import { useStoreLabel } from "../features/games/GameDetails";
import { gameInitials } from "../features/games/GameSwitcher";
import { GenericGameDialog } from "../features/games/GenericGameDialog";
import { RelocateDialog, RenameDialog, UnmanageDialog } from "../features/games/InstanceDialogs";
import { ManageGameWizard, type WizardStart } from "../features/games/ManageGameWizard";
import { ScanFooter } from "../features/games/ScanFooter";
import { useAction } from "../features/games/use-action";
import { PlayButton } from "../features/launch/PlayButton";
import { useI18n } from "../i18n/i18n";
import { MAIN_ID, useNavigation } from "../shell/navigation";
import { LoadingState } from "./PageBody";

type LibraryFilter = "all" | "problems" | "hidden";

/** Problems of a game that the Library shows: visible diagnostics, a missing folder, another manager. */
function problemCount(g: LibraryGame): number {
  const p = g.problems;
  const n = p ? p.blocking + p.errors + p.warnings : 0;
  return n + (g.instance.rootMissing ? 1 : 0) + (g.instance.foreign.length > 0 ? 1 : 0);
}

/**
 * Library (ui/telas/games.md, board Biblioteca): the managed games with
 * their figures (B14), the most recent one as "Continuar de onde parou",
 * and the games found on this PC that are not managed yet. "Adicionar
 * jogo" opens the list of games the app serves (board JogosSuportados).
 * Nothing is managed without a click on Gerenciar.
 */
export function GamesPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const view = useGamesView(filter === "hidden");
  const library = useLibraryGames();
  const [wizard, setWizard] = useState<WizardStart | null>(null);
  const [adding, setAdding] = useState(false);
  const [genericOpen, setGenericOpen] = useState(false);
  const [renaming, setRenaming] = useState<ManagedGame | null>(null);
  const [relocating, setRelocating] = useState<ManagedGame | null>(null);
  const [unmanaging, setUnmanaging] = useState<ManagedGame | null>(null);

  let body: ReactNode = null;
  if (view.status === "loading" || library.status === "loading") body = <LoadingState rows={3} />;
  else if (view.status === "unavailable") {
    body = (
      <Alert.Root intent="info">
        <Alert.Description>{t("app.offlineHint")}</Alert.Description>
      </Alert.Root>
    );
  } else if (view.status === "error") body = <ErrorAlert title="games.loadError" error={view.error} onRetry={view.reload} />;
  else if (library.status === "error") body = <ErrorAlert title="games.loadError" error={library.error} onRetry={library.reload} />;
  else if (view.status === "ready" && library.status === "ready") {
    body = (
      <LibraryBody
        games={library.data}
        managed={view.data.managed}
        discovered={view.data.discovered}
        filter={filter}
        onManage={setWizard}
        onGeneric={() => setGenericOpen(true)}
        onRename={setRenaming}
        onRelocate={setRelocating}
        onUnmanage={setUnmanaging}
      />
    );
  }

  return (
    <main id={MAIN_ID} tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-9 py-7 focus:outline-none">
      <LibraryHeader
        managed={view.status === "ready" ? view.data.managed.length : 0}
        discovered={view.status === "ready" ? view.data.discovered.length : 0}
        filter={filter}
        onFilter={setFilter}
        onAdd={() => setAdding(true)}
      />
      {body}
      <ScanFooter />
      <AddGameDialog
        open={adding}
        onClose={() => setAdding(false)}
        onManage={(start) => {
          setAdding(false);
          setWizard(start);
        }}
        onCreate={() => {
          setAdding(false);
          setGenericOpen(true);
        }}
      />
      <ManageGameWizard start={wizard} onClose={() => setWizard(null)} />
      <GenericGameDialog open={genericOpen} onOpenChange={setGenericOpen} onContinue={setWizard} />
      <RenameDialog game={renaming} onClose={() => setRenaming(null)} />
      <RelocateDialog game={relocating} onClose={() => setRelocating(null)} />
      <UnmanageDialog game={unmanaging} onClose={() => setUnmanaging(null)} />
    </main>
  );
}

function LibraryHeader({ managed, discovered, filter, onFilter, onAdd }: { managed: number; discovered: number; filter: LibraryFilter; onFilter: (f: LibraryFilter) => void; onAdd: () => void }) {
  const { t, tp } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [scanning, setScanning] = useState(false);
  const scan = async () => {
    setScanning(true);
    await run(() => backend.scanGames("quick"), { success: "games.scan.quickDone" });
    setScanning(false);
  };
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold text-fg">{t("nav.games")}</h1>
        <span className="text-sm text-fg-muted">{[tp("library.managed", managed), tp("library.discovered", discovered)].join(" · ")}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <SegmentedControl<LibraryFilter>
          size="sm"
          aria-label={t("library.filter")}
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: t("library.filter.all") },
            { value: "problems", label: t("library.filter.problems") },
            { value: "hidden", label: t("library.filter.hidden") },
          ]}
        />
        <Button loading={scanning} onClick={() => void scan()}>
          {t("library.scan")}
        </Button>
        <Button emphasis="high" startIcon={<PlusIcon size="sm" />} onClick={onAdd}>
          {t("library.add")}
        </Button>
      </div>
    </div>
  );
}

interface BodyProps {
  games: readonly LibraryGame[];
  managed: readonly ManagedGame[];
  discovered: readonly DiscoveredGame[];
  filter: LibraryFilter;
  onManage: (start: WizardStart) => void;
  onGeneric: () => void;
  onRename: (g: ManagedGame) => void;
  onRelocate: (g: ManagedGame) => void;
  onUnmanage: (g: ManagedGame) => void;
}

function LibraryBody({ games, managed, discovered, filter, onManage, onGeneric, onRename, onRelocate, onUnmanage }: BodyProps) {
  const { t } = useI18n();
  // GamesView decides what is hidden; the Library figures follow it.
  const shown = useMemo(() => {
    const ids = new Set(managed.map((m) => m.id));
    return games.filter((g) => {
      if (!ids.has(g.instance.id)) return false;
      if (filter === "problems") return problemCount(g) > 0;
      if (filter === "hidden") return g.instance.hidden;
      return true;
    });
  }, [games, managed, filter]);
  const hero = filter === "all" ? shown.find((g) => g.lastUsed) : undefined;

  return (
    <>
      {hero ? <ContinueCard game={hero} /> : null}
      {shown.length > 0 ? (
        <section aria-label={t("library.managedLabel")} className="grid grid-cols-4 gap-4">
          {shown.map((g) => (
            <GameCard
              key={g.instance.id}
              game={g}
              onAnother={() => (g.instance.custom ? onGeneric() : onManage({ gameId: g.instance.gameId, gameName: g.instance.gameName }))}
              onRename={() => onRename(g.instance)}
              onRelocate={() => onRelocate(g.instance)}
              onUnmanage={() => onUnmanage(g.instance)}
            />
          ))}
        </section>
      ) : (
        <p className="text-sm text-fg-muted">{t(filter === "all" ? "library.empty" : "library.emptyFilter")}</p>
      )}
      {filter === "all" && discovered.length > 0 ? <Detected games={discovered} onManage={onManage} /> : null}
    </>
  );
}

/** Enters a game: makes it the active one, then opens its Overview. */
function useEnter() {
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  return async (g: ManagedGame) => {
    if (!g.active) {
      const r = await run(() => backend.setActiveInstance(g.id));
      if (!r.ok) return;
    }
    navigate({ view: "overview" });
  };
}

/** One small figure of the "Continuar" card. */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-control border border-border-subtle bg-sunken px-3 py-2.5">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

function StateValue({ icon, intent, text }: { icon: IconComponent; intent: "success" | "info" | "warning" | "danger" | "neutral"; text: string }) {
  return (
    <span data-intent={intent === "neutral" ? undefined : intent} className={`flex h-6.5 items-center gap-1.5 text-[0.9375rem] font-semibold ${intent === "neutral" ? "text-fg" : "text-intent-text"}`}>
      <Icon icon={icon} size="sm" />
      {text}
    </span>
  );
}

/** "Continuar de onde parou" (board Biblioteca): the most recently used game. */
function ContinueCard({ game }: { game: LibraryGame }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const store = useStoreLabel();
  const enter = useEnter();
  const g = game.instance;
  const line = [store(g.store), g.version ? t("overview.version", { version: g.version }) : "", game.status ? t("library.profile", { name: game.status.activeProfile.name }) : "", game.lastUsed ? t("library.used", { when: i18n.formatAgo(game.lastUsed) }) : ""]
    .filter(Boolean)
    .join(" · ");
  const p = game.problems;
  let problems = <StateValue icon={CheckIcon} intent="success" text={t("library.noProblems")} />;
  if (p && p.blocking + p.errors > 0) problems = <StateValue icon={CircleAlertIcon} intent="danger" text={tp("library.errors", p.blocking + p.errors)} />;
  else if (p && p.warnings > 0) problems = <StateValue icon={CircleAlertIcon} intent="warning" text={tp("library.warnings", p.warnings)} />;
  return (
    <GameAccent id={g.id} accent={g.accent} className="shrink-0">
      <section aria-label={t("library.continue")} className="flex items-stretch overflow-hidden rounded-card border border-border bg-surface">
        <span data-intent="brand" className="flex w-75 shrink-0 items-end border-r border-intent-border bg-intent-subtle p-5">
          <span className="text-[4rem] font-bold leading-none tracking-[-0.04em] text-intent-text">{gameInitials(g.gameName || g.name)}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{t("library.continue")}</span>
              <h2 className="truncate text-[1.375rem] font-semibold text-fg">{g.name}</h2>
              <span className="truncate text-[0.8125rem] text-fg-muted">{line}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => void enter(g)}>{t("library.enter")}</Button>
              {g.active ? <PlayButton /> : null}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Figure label={t("library.modsActive")}>
              <span className="text-lg font-semibold text-fg">
                {game.mods ? i18n.formatNumber(game.mods.enabled) : t("common.empty")}{" "}
                {game.mods ? <span className="text-[0.8125rem] font-normal text-fg-muted">{t("library.of", { total: i18n.formatNumber(game.mods.total) })}</span> : null}
              </span>
            </Figure>
            <Figure label={t("library.deploy")}>
              <DeployValue game={game} />
            </Figure>
            <Figure label={t("library.conflictsToReview")}>
              <span className="text-lg font-semibold text-fg">{game.conflicts ? i18n.formatNumber(game.conflicts.unreviewed) : t("common.empty")}</span>
            </Figure>
            <Figure label={t("library.problems")}>{problems}</Figure>
          </div>
        </div>
      </section>
    </GameAccent>
  );
}

function DeployValue({ game }: { game: LibraryGame }) {
  const { t } = useI18n();
  const kind = game.status?.kind;
  if (kind === "in_sync") return <StateValue icon={CheckIcon} intent="success" text={t("library.deployInSync")} />;
  if (kind === "pending" || kind === "never_deployed") return <StateValue icon={UploadIcon} intent="info" text={t("library.deployPending")} />;
  if (kind === "failed" || kind === "blocked") return <StateValue icon={CircleAlertIcon} intent="danger" text={t("library.deployProblem")} />;
  return <span className="text-lg font-semibold text-fg-muted">{t("common.empty")}</span>;
}

/** The pill on the band of a card: problems first, then a pending deploy, else ready. */
function CardStatus({ game }: { game: LibraryGame }) {
  const { t, tp } = useI18n();
  const n = problemCount(game);
  let intent: "danger" | "info" | "success" = "success";
  let icon: IconComponent = CheckIcon;
  let text = t("library.ready");
  if (n > 0) {
    intent = "danger";
    icon = CircleAlertIcon;
    text = tp("library.problemCount", n);
  } else if (game.status?.kind === "pending" || game.status?.kind === "never_deployed") {
    intent = "info";
    icon = UploadIcon;
    text = t("library.toDeploy");
  }
  return (
    <span data-intent={intent} className="flex items-center gap-1.25 rounded-pill bg-sunken px-2.25 py-0.75 text-xs font-semibold text-intent-text">
      <Icon icon={icon} size="xs" />
      {text}
    </span>
  );
}

interface CardProps {
  game: LibraryGame;
  onAnother: () => void;
  onRename: () => void;
  onRelocate: () => void;
  onUnmanage: () => void;
}

/** One managed game (board Biblioteca): accent band with the monogram and status, name, store, mods, Entrar and more. */
function GameCard({ game, onAnother, onRename, onRelocate, onUnmanage }: CardProps) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const store = useStoreLabel();
  const enter = useEnter();
  const g = game.instance;
  const open = (folder: InstanceFolder) => void run(() => backend.openInstanceFolder(g.id, folder));
  return (
    <GameAccent id={g.id} accent={g.accent}>
      <article aria-label={g.name} className={`flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface ${g.hidden ? "opacity-70" : ""}`}>
        <div data-intent="brand" className="flex h-26 items-end justify-between border-b border-intent-border bg-intent-subtle px-3.5 py-3">
          <span className="text-[2.5rem] font-bold leading-none tracking-[-0.04em] text-intent-text">{gameInitials(g.gameName || g.name)}</span>
          <CardStatus game={game} />
        </div>
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[0.9375rem] font-semibold text-fg">{g.name}</span>
            <span className="truncate text-xs text-fg-muted">{[g.custom ? t("games.generic") : "", store(g.store), g.version ?? ""].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.8125rem] text-fg-muted">{game.mods ? tp("library.modsCount", game.mods.enabled) : ""}</span>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" onClick={() => void enter(g)}>
                {t("library.enter")}
              </Button>
              <Menu.Root placement="bottom-end">
                <Menu.Trigger>
                  <Button size="icon-sm" emphasis="low" aria-label={t("games.moreActions", { name: g.name })} title={t("games.moreActions", { name: g.name })}>
                    <MoreHorizontalIcon size="sm" />
                  </Button>
                </Menu.Trigger>
                <Menu.Content>
                  <Menu.Item onSelect={() => open("game")}>
                    <FolderOpenIcon size="sm" />
                    {t("games.action.openGameFolder")}
                  </Menu.Item>
                  <Menu.Item onSelect={() => open("staging")}>
                    <FolderOpenIcon size="sm" />
                    {t("games.action.openStaging")}
                  </Menu.Item>
                  <Menu.Item onSelect={() => open("archives")}>
                    <FolderOpenIcon size="sm" />
                    {t("games.action.openArchives")}
                  </Menu.Item>
                  <Menu.Item onSelect={onRelocate}>{t("games.action.relocate")}</Menu.Item>
                  <Menu.Item onSelect={onRename}>{t("games.action.rename")}</Menu.Item>
                  <Menu.Item onSelect={onAnother}>{t("games.action.another")}</Menu.Item>
                  <Menu.Item onSelect={() => void run(() => backend.hideInstance(g.id, !g.hidden))}>
                    {g.hidden ? <EyeIcon size="sm" /> : <EyeOffIcon size="sm" />}
                    {t(g.hidden ? "games.action.show" : "games.action.hide")}
                  </Menu.Item>
                  <Menu.Item onSelect={onUnmanage}>{t("games.action.unmanage")}</Menu.Item>
                </Menu.Content>
              </Menu.Root>
            </div>
          </div>
        </div>
      </article>
    </GameAccent>
  );
}

/** "Detectados neste PC, ainda não gerenciados": dashed rows with Gerenciar. */
function Detected({ games, onManage }: { games: readonly DiscoveredGame[]; onManage: (s: WizardStart) => void }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("library.detected")} className="flex flex-col gap-2.5">
      <h2 className="text-[0.8125rem] font-semibold text-fg-muted">{t("library.detected")}</h2>
      <div className="grid grid-cols-2 gap-3">
        {games.map((g) => (
          <div key={`${g.gameId}|${g.root}`} className="flex items-center gap-3 rounded-control border border-dashed border-border-strong px-3.5 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-sunken text-xs font-bold text-fg-muted">{gameInitials(g.gameName)}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-sm font-medium text-fg">{g.gameName}</span>
              <span className="truncate text-xs text-fg-muted" title={g.root}>
                {g.root}
              </span>
            </div>
            <Button size="sm" onClick={() => onManage({ gameId: g.gameId, gameName: g.gameName, root: g.root, store: g.store, version: g.version })}>
              {t("games.action.manage")}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

