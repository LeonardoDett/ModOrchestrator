"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";

export interface ContextMenuItem { id:string; label:ReactNode; shortcut?:string; disabled?:boolean; destructive?:boolean; onSelect?:()=>void; }
export interface ContextMenuProps { items:readonly ContextMenuItem[]; children:ReactNode; className?:string; }

export function ContextMenu({items,children,className}:ContextMenuProps){
  const [position,setPosition]=useState<{x:number;y:number}|null>(null);
  const firstRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!position)return;
    const close=()=>setPosition(null);
    const key=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape")close()};
    window.addEventListener("pointerdown",close);window.addEventListener("scroll",close,true);window.addEventListener("resize",close);window.addEventListener("keydown",key);
    requestAnimationFrame(()=>firstRef.current?.focus());
    return()=>{window.removeEventListener("pointerdown",close);window.removeEventListener("scroll",close,true);window.removeEventListener("resize",close);window.removeEventListener("keydown",key)};
  },[position]);
  const onMenuKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.key!=="ArrowDown"&&event.key!=="ArrowUp")return;event.preventDefault();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=buttons[(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length];next?.focus()};
  return <>
    <div onContextMenu={event=>{event.preventDefault();setPosition({x:event.clientX,y:event.clientY})}} className={className}>{children}</div>
    {position?createPortal(<div className="fixed z-dropdown min-w-52 rounded-lg border border-border bg-raised p-1 shadow-lg" style={{left:position.x,top:position.y}} role="menu" onPointerDown={e=>e.stopPropagation()} onKeyDown={onMenuKeyDown}>
      {items.map((item,index)=><button ref={index===0?firstRef:undefined} key={item.id} type="button" role="menuitem" disabled={item.disabled} onClick={()=>{item.onSelect?.();setPosition(null)}} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",item.destructive?"text-danger-text hover:bg-danger-subtle":"text-fg hover:bg-hover",item.disabled&&"pointer-events-none opacity-50")}><span className="min-w-0 flex-1">{item.label}</span>{item.shortcut?<span className="text-xs text-fg-subtle">{item.shortcut}</span>:null}</button>)}
    </div>,document.body):null}
  </>;
}
