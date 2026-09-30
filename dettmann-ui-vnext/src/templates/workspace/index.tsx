import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
export interface WorkspaceProps { sidebar:ReactNode; header?:ReactNode; footer?:ReactNode; children:ReactNode; sidebarWidth?:number; className?:string; }
export function Workspace({sidebar,header,footer,children,sidebarWidth=264,className}:WorkspaceProps){return <div className={cn("grid h-screen min-h-0 min-w-0 overflow-hidden bg-page",className)} style={{gridTemplateColumns:`${sidebarWidth}px minmax(0,1fr)`}}><aside className="min-h-0 overflow-auto border-r border-border bg-structure">{sidebar}</aside><div className="min-h-0 min-w-0 overflow-hidden">{header}{children}{footer}</div></div>}
