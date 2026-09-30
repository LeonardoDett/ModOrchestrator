"use client";

import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "../../utils/cn";
import { Input } from "../input";

export interface CommandItem<T = unknown> { id: string; label: string; description?: string; keywords?: string[]; value: T; disabled?: boolean; icon?: ReactNode; }
export interface CommandProps<T = unknown> extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  items: readonly CommandItem<T>[];
  value?: string;
  onValueChange?: (item: CommandItem<T>) => void;
  placeholder?: string;
  emptyMessage?: ReactNode;
}

export function Command<T>({ items, onValueChange, placeholder="Search", emptyMessage="No results", className, ...props }: CommandProps<T>) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => { const q=query.trim().toLowerCase(); return q ? items.filter(i => [i.label, i.description, ...(i.keywords ?? [])].filter(Boolean).join(" ").toLowerCase().includes(q)) : [...items]; }, [items, query]);
  useEffect(() => setActive(0), [query]);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!filtered.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(i => (i + 1) % filtered.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(i => (i - 1 + filtered.length) % filtered.length); }
    else if (event.key === "Enter") { event.preventDefault(); const item=filtered[active]; if (item && !item.disabled) onValueChange?.(item); }
  };
  return <div ref={ref} onKeyDown={handleKeyDown} className={cn("flex min-h-0 flex-col rounded-xl border border-border bg-surface shadow-lg", className)} {...props}>
    <div className="border-b border-border p-2"><Input.Root><Input.Box><Search className="h-4 w-4 text-fg-muted" /><Input.Field aria-label={placeholder} value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholder} /></Input.Box></Input.Root></div>
    <div role="listbox" className="max-h-80 overflow-auto p-1">
      {filtered.length ? filtered.map((item,index)=><button key={item.id} type="button" role="option" aria-selected={index===active} disabled={item.disabled} onMouseEnter={()=>setActive(index)} onClick={()=>onValueChange?.(item)} className={cn("flex w-full items-start gap-3 rounded-md px-3 py-2 text-left", index===active?"bg-hover":"", item.disabled&&"opacity-50")}>{item.icon}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-fg">{item.label}</span>{item.description?<span className="block truncate text-xs text-fg-muted">{item.description}</span>:null}</span></button>):<div className="p-6 text-center text-sm text-fg-muted">{emptyMessage}</div>}
    </div>
  </div>;
}
