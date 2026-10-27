"use client";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { SplitPane } from "../split-pane";
import { cn } from "../../utils/cn";
export interface MasterDetailProps extends Omit<ComponentPropsWithoutRef<"div">,"children"> { master:ReactNode; detail?:ReactNode; emptyDetail?:ReactNode; detailOpen?:boolean; masterWidth?:number; side?:"left"|"right"; }
export function MasterDetail({master,detail,emptyDetail="Select an item to inspect",detailOpen=true,masterWidth=360,side="left",className,...props}:MasterDetailProps){return <div className={cn("h-full min-h-0",className)} {...props}><SplitPane side={side} initialSize={masterWidth} main={detailOpen?(detail??<div className="flex h-full items-center justify-center text-sm text-fg-muted">{emptyDetail}</div>):<div/>} sidebar={master}/></div>}
