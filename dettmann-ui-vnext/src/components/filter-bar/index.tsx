import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { FilterIcon } from "../../icons/glyphs/filter";
import { SearchIcon } from "../../icons/glyphs/search";
import { cn } from "../../utils/cn";
import { Input } from "../input";
import { Badge } from "../badge";
import { Button } from "../button";
export interface FilterBarProps extends ComponentPropsWithoutRef<"div"> { query?:string; onQueryChange?:(value:string)=>void; queryPlaceholder?:string; activeFilterCount?:number; onFiltersClick?:()=>void; filters?:ReactNode; actions?:ReactNode; }
export function FilterBar({query,onQueryChange,queryPlaceholder="Search",activeFilterCount=0,onFiltersClick,filters,actions,className,...props}:FilterBarProps){return <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-surface p-2",className)} {...props}><div className="min-w-[16rem] flex-1"><Input.Root value={query??""} onChange={(value:string)=>onQueryChange?.(value)}><Input.Box><SearchIcon size="sm" className="text-fg-muted"/><Input.Field aria-label={queryPlaceholder} placeholder={queryPlaceholder}/></Input.Box></Input.Root></div>{onFiltersClick?<Button emphasis="medium" startIcon={<FilterIcon size="lg"/>} onClick={onFiltersClick}>Filters{activeFilterCount? <Badge size="sm" intent="brand">{activeFilterCount}</Badge>:null}</Button>:null}{filters}{actions}</div>}
