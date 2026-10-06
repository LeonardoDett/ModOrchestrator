import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Filter, Search } from "lucide-react";
import { cn } from "../../utils/cn";
import { Input } from "../input";
import { Badge } from "../badge";
import { Button } from "../button";
export interface FilterBarProps extends ComponentPropsWithoutRef<"div"> { query?:string; onQueryChange?:(value:string)=>void; queryPlaceholder?:string; activeFilterCount?:number; onFiltersClick?:()=>void; filters?:ReactNode; actions?:ReactNode; }
export function FilterBar({query,onQueryChange,queryPlaceholder="Search",activeFilterCount=0,onFiltersClick,filters,actions,className,...props}:FilterBarProps){return <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-surface p-2",className)} {...props}><div className="min-w-[16rem] flex-1"><Input.Root value={query??""} onChange={(value:string)=>onQueryChange?.(value)}><Input.Box><Search aria-hidden="true" className="h-4 w-4 text-fg-muted"/><Input.Field aria-label={queryPlaceholder} placeholder={queryPlaceholder}/></Input.Box></Input.Root></div>{onFiltersClick?<Button variant="outline" startIcon={<Filter/>} onClick={onFiltersClick}>Filters{activeFilterCount? <Badge size="sm" variant="default" tone="primary">{activeFilterCount}</Badge>:null}</Button>:null}{filters}{actions}</div>}
