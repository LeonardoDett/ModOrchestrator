import type { ReactNode } from "react";
import { Sidebar, Typography, Workspace, type SidebarItem } from "dettmann-ui";
import logo from "../assets/logo.png";
import { useAppInfo } from "../bridge/use-app-info";
import { GLOBAL_NAVIGATION, type ViewId } from "./navigation";
import { TopBar } from "./TopBar";

interface AppShellProps {
  current: ViewId;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
}

export function AppShell({ current, onNavigate, children }: AppShellProps) {
  const info = useAppInfo();
  const items: SidebarItem[] = GLOBAL_NAVIGATION.map((entry) => ({
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    onClick: () => onNavigate(entry.id),
  }));

  return (
    <Workspace
      sidebarWidth={256}
      sidebar={
        <Sidebar.Root
          items={items}
          currentId={current}
          emphasis="subtle"
          className="h-full"
          header={<img src={logo} alt="Mod Orchestrator" className="h-14 w-auto" />}
          footer={
            <Typography variant="caption" color="muted-fg" className="block px-4 py-3">
              {info ? `v${info.version}` : " "}
            </Typography>
          }
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </Workspace>
  );
}
