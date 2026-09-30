import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, EyeOff, Eye, FolderOpen, Gamepad2, LayoutGrid, List, Plus, Search, TriangleAlert, X } from "lucide-react";
import { Alert, Badge, Button, Checkbox, EmptyState, FeaturedIcon, Input, Menu, SegmentedControl, Spinner, Stack, Typography } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useGamesView } from "../bridge/queries";
import type { DiscoveredGame, GamesView, InstanceFolder, ManagedGame, SupportedGame } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { DiscoveredDetails, ManagedDetails, useStoreLabel } from "../features/games/GameDetails";
import { GameTile, type TileAction } from "../features/games/GameTile";
import { GenericGameDialog } from "../features/games/GenericGameDialog";
import { RelocateDialog, RenameDialog, UnmanageDialog } from "../features/games/InstanceDialogs";
import { ManageGameWizard, type WizardStart } from "../features/games/ManageGameWizard";
import { ScanFooter } from "../features/games/ScanFooter";
import { useAction } from "../features/games/use-action";
import { useI18n } from "../i18n/i18n";
import { useNavigation } from "../shell/navigation";
import { PageBody } from "./PageBody";

const LAYOUT_KEY = "mo.games.layout";
type Layout = "grid" | "list";

/** Grid/list is presentation state (docs-ia/03 rule 1): kept per viewer. */
function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/**
 * Games (ui/telas/games.md): managed, discovered and supported games with
 * search, grid/list, quick/full search and the assistant. Everything shown
 * comes from GamesView; nothing is managed without a click on Manage.
 */
export function GamesPage() {
  const { t } = useI18n();
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [showHidden, setShowHidden] = useState(false);
  const view = useGamesView(showHidden);
  const [search, setSearch] = useState("");
  const [wizard, setWizard] = useState<WizardStart | null>(null);
  const [genericOpen, setGenericOpen] = useState(false);
  const [renaming, setRenaming] = useState<ManagedGame | null>(null);
  const [relocating, setRelocating] = useState<ManagedGame | null>(null);
  const [unmanaging, setUnmanaging] = useState<ManagedGame | null>(null);

  const changeLayout = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Storage is optional.
    }
  };

  let body: ReactNode;
  switch (view.status) {
    case "loading":
      body = <Spinner label={t("common.loading")} />;
      break;
    case "unavailable":
      body = (
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      );
      break;
    case "error":
      body = <ErrorAlert title="games.loadError" error={view.error} onRetry={view.reload} />;
      break;
    case "ready":
      body = (
        <GamesBody
          data={view.data}
          layout={layout}
          search={search}
          onManage={setWizard}
          onGeneric={() => setGenericOpen(true)}
          onRename={setRenaming}
          onRelocate={setRelocating}
          onUnmanage={setUnmanaging}
        />
      );
  }

  return (
    <PageBody>
      <Stack gap="lg">
        <GamesToolbar
          layout={layout}
          onLayout={changeLayout}
          showHidden={showHidden}
          onShowHidden={setShowHidden}
          search={search}
          onSearch={setSearch}
          onGeneric={() => setGenericOpen(true)}
          hiddenCount={view.status === "ready" ? view.data.hiddenCount : 0}
        />
        {body}
        <ScanFooter />
      </Stack>
      <ManageGameWizard start={wizard} onClose={() => setWizard(null)} />
      <GenericGameDialog open={genericOpen} onOpenChange={setGenericOpen} onContinue={setWizard} />
      <RenameDialog game={renaming} onClose={() => setRenaming(null)} />
      <RelocateDialog game={relocating} onClose={() => setRelocating(null)} />
      <UnmanageDialog game={unmanaging} onClose={() => setUnmanaging(null)} />
    </PageBody>
  );
}

interface ToolbarProps {
  layout: Layout;
  onLayout: (l: Layout) => void;
  showHidden: boolean;
  onShowHidden: (v: boolean) => void;
  search: string;
  onSearch: (v: string) => void;
  onGeneric: () => void;
  hiddenCount: number;
}

function GamesToolbar({ layout, onLayout, showHidden, onShowHidden, search, onSearch, onGeneric }: ToolbarProps) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const [scanning, setScanning] = useState(false);

  const scan = async (mode: "quick" | "full") => {
    setScanning(true);
    await run(() => backend.scanGames(mode), { success: mode === "quick" ? "games.scan.quickDone" : undefined });
    setScanning(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Menu.Root>
        <Menu.Trigger>
          <Button variant="primary" loading={scanning} startIcon={<Search aria-hidden="true" className="h-4 w-4" />} endIcon={<ChevronDown aria-hidden="true" className="h-4 w-4" />}>
            {t("games.scan")}
          </Button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item onSelect={() => void scan("quick")}>{t("games.scan.quick")}</Menu.Item>
          <Menu.Item onSelect={() => void scan("full")}>{t("games.scan.full")}</Menu.Item>
        </Menu.Content>
      </Menu.Root>
      <Button variant="outline" startIcon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={onGeneric}>
        {t("games.addGeneric")}
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <Input.Root value={search} onChange={onSearch}>
          <Input.Box>
            <Input.Field type="search" aria-label={t("games.search")} placeholder={t("games.search")} />
          </Input.Box>
        </Input.Root>
        <Checkbox checked={showHidden} onCheckedChange={onShowHidden} label={t("games.showHidden")} />
        <SegmentedControl<Layout>
          aria-label={t("games.layout")}
          size="sm"
          value={layout}
          onChange={onLayout}
          options={[
            { value: "grid", label: <LayoutGrid aria-label={t("games.layout.grid")} className="h-4 w-4" /> },
            { value: "list", label: <List aria-label={t("games.layout.list")} className="h-4 w-4" /> },
          ]}
        />
      </div>
    </div>
  );
}

interface BodyProps {
  data: GamesView;
  layout: Layout;
  search: string;
  onManage: (start: WizardStart) => void;
  onGeneric: () => void;
  onRename: (g: ManagedGame) => void;
  onRelocate: (g: ManagedGame) => void;
  onUnmanage: (g: ManagedGame) => void;
}

function GamesBody({ data, layout, search, onManage, onGeneric, onRename, onRelocate, onUnmanage }: BodyProps) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  const needle = search.trim().toLowerCase();
  const matches = (...texts: string[]) => needle === "" || texts.some((x) => x.toLowerCase().includes(needle));

  const managed = useMemo(() => data.managed.filter((g) => matches(g.name, g.gameName)), [data.managed, needle]);
  const discovered = useMemo(() => data.discovered.filter((g) => matches(g.gameName)), [data.discovered, needle]);
  const supported = useMemo(() => data.supported.filter((g) => matches(g.gameName)), [data.supported, needle]);

  const nothingFound = data.scanned && data.managed.length === 0 && data.discovered.length === 0;

  return (
    <Stack gap="xl">
      {nothingFound ? (
        <EmptyState.Root className="rounded-xl border border-border bg-surface">
          <EmptyState.Icon>
            <FeaturedIcon icon={Gamepad2} color="neutral" />
          </EmptyState.Icon>
          <EmptyState.Title>{t("games.noneFoundTitle")}</EmptyState.Title>
          <EmptyState.Description>{t("games.noneFoundDescription")}</EmptyState.Description>
          <EmptyState.Actions>
            <Button variant="outline" onClick={onGeneric}>
              {t("games.addGeneric")}
            </Button>
          </EmptyState.Actions>
        </EmptyState.Root>
      ) : null}

      <Section title="games.section.managed" count={managed.length} layout={layout}>
        {managed.map((g) => (
          <ManagedTile
            key={g.id}
            game={g}
            layout={layout}
            onOpenWorkspace={async () => {
              if (!g.active) await run(() => backend.setActiveInstance(g.id));
              navigate({ view: "overview" });
            }}
            onActivate={() => void run(() => backend.setActiveInstance(g.id))}
            onAnother={() =>
              g.custom ? onGeneric() : onManage({ gameId: g.gameId, gameName: g.gameName })
            }
            onRename={() => onRename(g)}
            onRelocate={() => onRelocate(g)}
            onUnmanage={() => onUnmanage(g)}
          />
        ))}
      </Section>

      <Section title="games.section.discovered" count={discovered.length} layout={layout}>
        {discovered.map((g) => (
          <DiscoveredTile key={`${g.gameId}|${g.root}`} game={g} layout={layout} onManage={onManage} />
        ))}
      </Section>

      <Section title="games.section.supported" count={supported.length} layout={layout}>
        {supported.map((g) => (
          <SupportedTile key={g.gameId} game={g} layout={layout} onLocate={onManage} />
        ))}
      </Section>
    </Stack>
  );
}

function Section({ title, count, layout, children }: { title: Parameters<ReturnType<typeof useI18n>["t"]>[0]; count: number; layout: Layout; children: ReactNode }) {
  const { t } = useI18n();
  if (count === 0) return null;
  return (
    <Stack as="section" gap="sm" aria-label={t(title)}>
      <Typography variant="heading-6" color="fg">
        {t(title)} ({count})
      </Typography>
      <div className={layout === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4" : "flex flex-col gap-2"}>{children}</div>
    </Stack>
  );
}

function StatusBadges({ game }: { game: ManagedGame }) {
  const { t } = useI18n();
  return (
    <>
      {game.active ? <Badge variant="success">{t("games.status.active")}</Badge> : null}
      {game.foreign.length > 0 ? (
        <Badge variant="warning">
          <TriangleAlert aria-hidden="true" className="mr-1 inline h-3 w-3" />
          {t("games.status.foreign")}
        </Badge>
      ) : null}
      {game.rootMissing ? (
        <Badge variant="danger">
          <X aria-hidden="true" className="mr-1 inline h-3 w-3" />
          {t("games.status.rootMissing")}
        </Badge>
      ) : null}
      {game.unavailable ? <Badge variant="muted">{t("games.status.unavailable")}</Badge> : null}
      {game.hidden ? <Badge variant="muted">{t("games.status.hidden")}</Badge> : null}
    </>
  );
}

interface ManagedTileProps {
  game: ManagedGame;
  layout: Layout;
  onOpenWorkspace: () => void;
  onActivate: () => void;
  onAnother: () => void;
  onRename: () => void;
  onRelocate: () => void;
  onUnmanage: () => void;
}

function ManagedTile({ game, layout, onOpenWorkspace, onActivate, onAnother, onRename, onRelocate, onUnmanage }: ManagedTileProps) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const store = useStoreLabel();
  const open = (folder: InstanceFolder) => void run(() => backend.openInstanceFolder(game.id, folder));

  const menu: TileAction[] = [
    { id: "workspace", label: t("games.action.openWorkspace"), onSelect: onOpenWorkspace },
    { id: "open-game", label: t("games.action.openGameFolder"), icon: FolderOpen, onSelect: () => open("game") },
    { id: "open-staging", label: t("games.action.openStaging"), icon: FolderOpen, onSelect: () => open("staging") },
    { id: "open-archives", label: t("games.action.openArchives"), icon: FolderOpen, onSelect: () => open("archives") },
    { id: "relocate", label: t("games.action.relocate"), onSelect: onRelocate },
    { id: "rename", label: t("games.action.rename"), onSelect: onRename },
    { id: "another", label: t("games.action.another"), onSelect: onAnother },
    {
      id: "hide",
      label: game.hidden ? t("games.action.show") : t("games.action.hide"),
      icon: game.hidden ? Eye : EyeOff,
      onSelect: () => void run(() => backend.hideInstance(game.id, !game.hidden)),
    },
    { id: "unmanage", label: t("games.action.unmanage"), onSelect: onUnmanage },
  ];

  return (
    <GameTile
      layout={layout}
      title={game.name}
      subtitle={game.custom ? t("games.generic") : game.name === game.gameName ? undefined : game.gameName}
      meta={[store(game.store), game.version ?? ""].filter(Boolean)}
      badges={<StatusBadges game={game} />}
      primary={game.active ? { label: t("games.action.openWorkspace"), onClick: onOpenWorkspace, variant: "outline" } : { label: t("games.action.activate"), onClick: onActivate }}
      menu={menu}
      details={<ManagedDetails game={game} />}
      dimmed={game.hidden}
    />
  );
}

function DiscoveredTile({ game, layout, onManage }: { game: DiscoveredGame; layout: Layout; onManage: (s: WizardStart) => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  const store = useStoreLabel();
  return (
    <GameTile
      layout={layout}
      title={game.gameName}
      subtitle={game.root}
      meta={[store(game.store), game.version ?? ""].filter(Boolean)}
      badges={game.hidden ? <Badge variant="muted">{t("games.status.hidden")}</Badge> : null}
      primary={{
        label: t("games.action.manage"),
        onClick: () => onManage({ gameId: game.gameId, gameName: game.gameName, root: game.root, store: game.store, version: game.version }),
      }}
      menu={[
        {
          id: "hide",
          label: game.hidden ? t("games.action.show") : t("games.action.hide"),
          icon: game.hidden ? Eye : EyeOff,
          onSelect: () => void run(() => backend.hideGame(game.gameId, !game.hidden)),
        },
      ]}
      details={<DiscoveredDetails game={game} />}
      dimmed={game.hidden}
    />
  );
}

function SupportedTile({ game, layout, onLocate }: { game: SupportedGame; layout: Layout; onLocate: (s: WizardStart) => void }) {
  const { t } = useI18n();
  const backend = useBackend();
  const run = useAction();
  return (
    <GameTile
      layout={layout}
      title={game.gameName}
      subtitle={t("games.notFound")}
      meta={[]}
      badges={game.hidden ? <Badge variant="muted">{t("games.status.hidden")}</Badge> : null}
      primary={{ label: t("games.action.locate"), onClick: () => onLocate({ gameId: game.gameId, gameName: game.gameName }), variant: "outline" }}
      menu={[
        {
          id: "hide",
          label: game.hidden ? t("games.action.show") : t("games.action.hide"),
          icon: game.hidden ? Eye : EyeOff,
          onSelect: () => void run(() => backend.hideGame(game.gameId, !game.hidden)),
        },
      ]}
      dimmed={game.hidden}
    />
  );
}
