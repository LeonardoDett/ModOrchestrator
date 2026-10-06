"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Stack } from "../../primitives/stack";
import { Toolbar } from "../toolbar";
import { Tree, type TreeNode } from "../tree";
import { FileList, type FileListItem } from "../file-list";

export interface FileBrowserProps<T=unknown> extends Omit<ComponentPropsWithoutRef<"div">,"onChange"> {
  tree: readonly TreeNode<T>[];
  files: readonly FileListItem[];
  toolbar?: ReactNode;
  selectedPath?: string;
  onPathSelect?: (path:string)=>void;
  onFileOpen?: (item:FileListItem)=>void;
  fileActions?: (item:FileListItem)=>ReactNode;
  sidebarWidth?: number;
}
export function FileBrowser<T>({tree,files,toolbar,selectedPath,onPathSelect,onFileOpen,fileActions,sidebarWidth=260,className,...props}:FileBrowserProps<T>){
  return <div className={className} {...props}><Stack gap="none" className="min-h-0 overflow-hidden rounded-xl border border-border bg-surface"><Toolbar end={toolbar}/><div className="grid min-h-[32rem] min-w-0" style={{gridTemplateColumns:`${sidebarWidth}px minmax(0,1fr)`}}><aside className="min-h-0 overflow-auto border-r border-border bg-structure"><Tree nodes={tree} selectedId={selectedPath} onSelect={node=>{const value=typeof node.data==="string"?node.data:node.id;onPathSelect?.(value)}}/></aside><main className="min-w-0 overflow-auto"><FileList items={files} onOpen={onFileOpen} rowActions={fileActions}/></main></div></Stack></div>;
}
