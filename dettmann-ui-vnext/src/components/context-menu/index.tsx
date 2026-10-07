"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";

export interface ContextMenuItem { id:string; label:ReactNode; shortcut?:string; disabled?:boolean; destructive?:boolean; onSelect?:()=>void; }
export interface ContextMenuProps { items:readonly ContextMenuItem[]; children:ReactNode; className?:string; }

/** Shift+F10 and the ContextMenu key open the menu from the keyboard. */
function isMenuKey(event:KeyboardEvent<HTMLElement>){return event.key==="ContextMenu"||(event.shiftKey&&event.key==="F10")}

/**
 * Where a keyboard-opened menu appears: under the focused element, or under
 * the active descendant of a composite widget (the focused row of a table).
 */
function keyboardAnchor(target:Element):{x:number;y:number}{
  const descendant=target.getAttribute("aria-activedescendant");
  const anchor=(descendant?document.getElementById(descendant):null)??target;
  const rect=anchor.getBoundingClientRect();
  return {x:rect.left+Math.min(24,rect.width/2),y:rect.top+Math.min(rect.height,32)};
}

export function ContextMenu({items,children,className}:ContextMenuProps){
  const [position,setPosition]=useState<{x:number;y:number}|null>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const returnFocusRef=useRef<HTMLElement|null>(null);
  const open=(next:{x:number;y:number})=>{
    returnFocusRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setPosition(next);
  };
  const close=(restoreFocus:boolean)=>{
    setPosition(null);
    if(restoreFocus)returnFocusRef.current?.focus({preventScroll:true});
    returnFocusRef.current=null;
  };
  useEffect(()=>{
    if(!position)return;
    const dismiss=()=>close(false);
    const key=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();close(true)}};
    window.addEventListener("pointerdown",dismiss);window.addEventListener("scroll",dismiss,true);window.addEventListener("resize",dismiss);window.addEventListener("keydown",key);
    requestAnimationFrame(()=>menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    return()=>{window.removeEventListener("pointerdown",dismiss);window.removeEventListener("scroll",dismiss,true);window.removeEventListener("resize",dismiss);window.removeEventListener("keydown",key)};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[position]);
  const onMenuKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(event.key==="Tab"){event.preventDefault();close(true);return}
    const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if(buttons.length===0)return;
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next:HTMLButtonElement|undefined;
    if(event.key==="ArrowDown")next=buttons[(index+1)%buttons.length];
    else if(event.key==="ArrowUp")next=buttons[(index-1+buttons.length)%buttons.length];
    else if(event.key==="Home")next=buttons[0];
    else if(event.key==="End")next=buttons[buttons.length-1];
    else return;
    event.preventDefault();
    next?.focus();
  };
  return <>
    <div
      onContextMenu={event=>{event.preventDefault();open({x:event.clientX,y:event.clientY})}}
      onKeyDown={event=>{if(event.defaultPrevented||!isMenuKey(event))return;event.preventDefault();open(keyboardAnchor(event.target as Element))}}
      className={className}
    >{children}</div>
    {position?createPortal(<div ref={menuRef} className="fixed z-dropdown min-w-52 rounded-control border border-border bg-raised p-1 shadow-overlay" style={{left:position.x,top:position.y}} role="menu" onPointerDown={e=>e.stopPropagation()} onKeyDown={onMenuKeyDown}>
      {items.map(item=><button key={item.id} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled} onClick={()=>{item.onSelect?.();close(true)}} className={cn("flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",item.destructive?"text-danger-text hover:bg-danger-subtle focus-visible:bg-danger-subtle":"text-fg hover:bg-state-hover focus-visible:bg-state-hover",item.disabled&&"pointer-events-none opacity-50")}><span className="min-w-0 flex-1">{item.label}</span>{item.shortcut?<span className="text-xs text-fg-subtle">{item.shortcut}</span>:null}</button>)}
    </div>,document.body):null}
  </>;
}
