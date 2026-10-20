import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AppShell as Chrome, PRESETS, Sidebar, ThemeScope, Typography, useTheme, withSeed, type PresetId, type SidebarSection } from "dettmann-ui";
import { useAppInfo, useMenuBadges, useWorkspace } from "../bridge/queries";
import type { MenuBadge, WorkspaceItemId } from "../bridge/types";
import { useI18n } from "../i18n/i18n";
import { AboutDialog, ShortcutsDialog } from "./HelpDialogs";
import { CommandPalette } from "./CommandPalette";
import { APP_END, APP_START, GROUP_LABELS, MAIN_ID, VIEWS, isWorkspaceView, useNavigation, workspaceGroups, type Route } from "./navigation";
import { useGlobalShortcuts } from "./shortcuts";
import { TopBar, type ShellDialog } from "./TopBar";
import { OperationsDrawer } from "../features/operations/OperationsDrawer";
import { DeployCard } from "../features/deploy/DeployStatusButton";
import { DeployProvider, useDeploy } from "../features/deploy/DeployContext";
import { PlayButton } from "../features/launch/PlayButton";
import { useRefresh } from "../bridge/use-backend-query";
import { useBackend } from "../bridge/backend-context";
import { useAction } from "../features/games/use-action";

const SIDEBAR_KEY = "mo.sidebar.collapsed";

/** Screens whose title sits on their own header line, next to their numbers and actions (boards). */
const OWN_HEADER: ReadonlySet<string> = new Set(["mods", "conflicts", "plugins", "load_order", "overview", "instance_settings", "games", "dashboard", "profiles"]);



/** Sidebar collapse is presentation state (docs-ia/03 rule 1): kept per viewer. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(value));
  } catch {
    // Storage is optional.
  }
}

/** Shell of ui/00 §2 (D120): app level and game level. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DeployProvider>
      <Shell>{children}</Shell>
    </DeployProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t, tp } = useI18n();
  const { route, navigate } = useNavigation();
  const { refresh } = useRefresh();
  const info = useAppInfo();
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [dialog, setDialog] = useState<ShellDialog | null>(null);
  const theme = useTheme();

  const backend = useBackend();
  const run = useAction();
  const deploy = useDeploy();
  const offered = workspace.status === "ready" ? workspace.data : null;
  const active = offered?.active;
  const activeId = active?.id ?? "";
  const groups = workspaceGroups(offered?.groups, offered?.items);
  const level: "app" | "game" = activeId && isWorkspaceView(route.view) && groups.length > 0 ? "game" : "app";
  const badges = useMenuBadges(level === "game" ? activeId : "");
  const badgeOf = (id: WorkspaceItemId): MenuBadge | undefined => (badges.status === "ready" ? badges.data.find((b) => b.item === id) : undefined);

  // Navigation started from the keyboard (shortcut, palette) moves the focus
  // to the content, so the next Tab or screen reader read starts there.
  const navigateFromKeyboard = useCallback(
    (next: Route) => {
      navigate(next);
      requestAnimationFrame(() => document.getElementById(MAIN_ID)?.focus({ preventScroll: true }));
    },
    [navigate],
  );
  // Ctrl+I: the import of the Mods screen, for the active game (ui/02 F-02).
  const importFiles = useCallback(async () => {
    if (!activeId) return;
    const picked = await run(() => backend.pickImportFiles(activeId, t("mods.import.pickFiles")));
    if (picked.ok && picked.value.length > 0) navigate({ view: "mods" });
  }, [activeId, backend, navigate, run, t]);
  const enterGame = useCallback(
    async (id: string) => {
      if (id !== activeId) {
        const r = await run(() => backend.setActiveInstance(id));
        if (!r.ok) return;
      }
      navigate({ view: "overview" });
    },
    [activeId, backend, navigate, run],
  );
  useGlobalShortcuts({
    onCommandPalette: () => setDialog("palette"),
    onRefresh: refresh,
    onDeploy: () => void deploy.deploy(),
    onImport: activeId && offered?.items.includes("mods") ? () => void importFiles() : undefined,
    onWorkspace: (index) => {
      const view = groups.flatMap((g) => g.items)[index];
      if (view) navigateFromKeyboard({ view });
    },
  });

  const badgeLabel = (id: WorkspaceItemId, count: number) =>
    id === "conflicts" ? tp("nav.badge.conflicts", count) : id === "diagnostics" ? tp("nav.badge.diagnostics", count) : String(count);

  const gameSections: SidebarSection[] = groups.map((group) => {
    const heading = GROUP_LABELS[group.id];
    return {
      id: group.id,
      label: heading ? t(heading) : undefined,
      items: group.items.map((id) => {
        const badge = badgeOf(id);
        return {
          id,
          label: t(VIEWS[id].label),
          icon: VIEWS[id].icon,
          count: badge?.count,
          countLabel: badge ? badgeLabel(id, badge.count) : undefined,
          attention: badge?.attention,
          onClick: () => navigate({ view: id }),
        };
      }),
    };
  });

  const instances = offered?.instances ?? [];
  const appSections: SidebarSection[] = [
    { id: "app", items: APP_START.map((e) => ({ id: e.id, label: t(e.label), icon: e.icon, onClick: () => navigate({ view: e.id }) })) },
    ...(instances.length > 0
      ? [
          {
            id: "pinned",
            label: t("nav.pinned"),
            items: instances.map((inst) => ({ id: `game:${inst.id}`, label: inst.name, onClick: () => void enterGame(inst.id) })),
          },
        ]
      : []),
    { id: "end", placement: "end" as const, items: APP_END.map((e) => ({ id: e.id, label: t(e.label), icon: e.icon, onClick: () => navigate({ view: e.id }) })) },
  ];

  const customTitleBar = info.status === "ready" && info.data.customTitleBar;
  const dialogProps = (name: ShellDialog) => ({
    open: dialog === name,
    onOpenChange: (open: boolean) => setDialog(open ? name : null),
  });

  // The game's accent replaces the app's inside the game level (D122).
  const baseTheme = PRESETS[theme.theme.id as PresetId] ?? PRESETS.orchestrator;
  const gameTheme = useMemo(
    () => (level === "game" && active?.accent ? withSeed(baseTheme, active.accent, `game-${active.id}`) : undefined),
    [level, active?.accent, active?.id, baseTheme],
  );

  const sidebar = (
    <Sidebar.Root
      sections={level === "game" ? gameSections : appSections}
      currentId={route.view}
      collapsed={collapsed}
      heading={t("nav.menu")}
      onCollapsedChange={(next) => {
        setCollapsed(next);
        writeCollapsed(next);
      }}
      labels={{
        navigation: t("nav.navigation"),
        openSidebar: t("nav.openSidebar"),
        collapseSidebar: t("nav.collapseSidebar"),
        expandSidebar: t("nav.expandSidebar"),
      }}
      className="h-full"
      footer={
        level === "game"
          ? ({ collapsed: rail }) => (
              <>
                <DeployCard collapsed={rail} />
                <PlayButton layout={rail ? "icon" : "block"} />
              </>
            )
          : ({ collapsed: rail }) =>
              rail ? null : (
                <Typography variant="caption" color="muted-fg" className="block px-2 py-1 tabular-nums">
                  {info.status === "ready" ? `v${info.data.version}` : " "}
                </Typography>
              )
      }
    />
  );

  const shell = (
    <Chrome.Root
      layout="topbar"
      navbar={
        <TopBar
          level={level}
          onBackToLibrary={() => navigate({ view: "games" })}
          onOpenOperations={() => setOperationsOpen(true)}
          onOpenDialog={setDialog}
          onOpenLog={() => navigate({ view: "diagnostics", tab: "log" })}
          windowControls={customTitleBar}
        />
      }
      sidebar={sidebar}
    >
      {OWN_HEADER.has(route.view) ? (
        // Screens redone by their board draw their own header line and main (ResourcePage workspace).
        <div className="flex h-full min-h-0 flex-col">
          {children}
        </div>
      ) : (
        <main id={MAIN_ID} tabIndex={-1} className="flex min-h-full flex-col focus:outline-none">
          <div data-slot="page-title" className="px-4 pt-5 md:px-6">
            <h1 className="m-0 text-title font-semibold text-fg">{t(VIEWS[route.view].label)}</h1>
          </div>
          {children}
        </main>
      )}
    </Chrome.Root>
  );

  return (
    <>
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-modal rounded-control bg-raised px-3 py-2 text-sm text-fg focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:ring-2 focus:ring-focus"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById(MAIN_ID)?.focus();
        }}
      >
        {t("a11y.skipToContent")}
      </a>
      {gameTheme ? (
        <ThemeScope theme={gameTheme} className="h-screen">
          {shell}
        </ThemeScope>
      ) : (
        shell
      )}
      <OperationsDrawer open={operationsOpen} onOpenChange={setOperationsOpen} />
      <CommandPalette
        {...dialogProps("palette")}
        onNavigate={navigateFromKeyboard}
        workspaceItems={offered?.items}
        canDeploy={Boolean(activeId)}
        onDeploy={() => void deploy.deploy()}
        onImport={activeId && offered?.items.includes("mods") ? () => void importFiles() : undefined}
        onOpenOperations={() => setOperationsOpen(true)}
        onOpenDialog={setDialog}
      />
      <ShortcutsDialog {...dialogProps("shortcuts")} />
      <AboutDialog {...dialogProps("about")} />
    </>
  );
}
