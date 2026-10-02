import { useState, type ReactNode } from "react";
import { Badge, Sidebar, Typography, type SidebarSection } from "dettmann-ui";
import { useAppInfo, useProblems, useWorkspace } from "../bridge/queries";
import { useI18n } from "../i18n/i18n";
import { AboutDialog, ShortcutsDialog } from "./HelpDialogs";
import { CommandPalette } from "./CommandPalette";
import { VIEWS, buildSections, useNavigation } from "./navigation";
import { useGlobalShortcuts } from "./shortcuts";
import { TitleBar } from "./TitleBar";
import { TopBar, type ShellDialog } from "./TopBar";
import { OperationsDrawer } from "../features/operations/OperationsDrawer";
import { DeployProvider, useDeploy } from "../features/deploy/DeployContext";
import { useRefresh } from "../bridge/use-backend-query";

const SIDEBAR_KEY = "mo.sidebar.collapsed";

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

/** Shell of ui/00 §2: title bar, sectioned sidebar, top bar, content. */
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

  const deploy = useDeploy();
  useGlobalShortcuts({ onCommandPalette: () => setDialog("palette"), onRefresh: refresh, onDeploy: () => void deploy.deploy() });

  const offered = workspace.status === "ready" ? workspace.data : null;
  // Diagnostics badge: blocking + errors of the active game (ui/00 §2.2).
  const problems = useProblems(offered?.active?.id ?? "");
  const errorCount = problems.status === "ready" && problems.data ? problems.data.counts.blocking + problems.data.counts.errors : 0;
  const sections: SidebarSection[] = buildSections(offered?.items).map((section) => ({
    id: section.id,
    label: section.id === "workspace" ? offered?.active?.name : undefined,
    placement: section.placement,
    items: section.items.map((entry) => ({
      id: entry.id,
      label: t(entry.label),
      icon: entry.icon,
      badge:
        entry.id === "diagnostics" && errorCount > 0 ? (
          <Badge tone="danger" size="sm" aria-label={tp("topbar.problemsCount", errorCount)}>
            {errorCount}
          </Badge>
        ) : undefined,
      onClick: () => navigate({ view: entry.id }),
    })),
  }));

  const customTitleBar = info.status === "ready" && info.data.customTitleBar;
  const dialogProps = (name: ShellDialog) => ({
    open: dialog === name,
    onOpenChange: (open: boolean) => setDialog(open ? name : null),
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-page">
      <TitleBar windowControls={customTitleBar} />
      <div className="flex min-h-0 flex-1">
        <Sidebar.Root
          sections={sections}
          currentId={route.view}
          emphasis="subtle"
          collapsed={collapsed}
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
            !collapsed ? (
              <Typography variant="caption" color="muted-fg" className="block px-4 py-3 tabular-nums">
                {info.status === "ready" ? `v${info.data.version}` : " "}
              </Typography>
            ) : null
          }
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            title={t(VIEWS[route.view].label)}
            onOpenOperations={() => setOperationsOpen(true)}
            onOpenDialog={setDialog}
            onOpenLog={() => navigate({ view: "diagnostics", tab: "log" })}
          />
          <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
      <OperationsDrawer open={operationsOpen} onOpenChange={setOperationsOpen} />
      <CommandPalette
        {...dialogProps("palette")}
        onNavigate={navigate}
        onOpenOperations={() => setOperationsOpen(true)}
        onOpenDialog={setDialog}
      />
      <ShortcutsDialog {...dialogProps("shortcuts")} />
      <AboutDialog {...dialogProps("about")} />
    </div>
  );
}
