import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";

export interface CardRootProps extends ComponentPropsWithoutRef<"div"> { variant?:"default"|"raised"|"subtle"|"interactive"; selected?:boolean; children?:ReactNode; }
function CardRoot({variant="default",selected=false,className,...props}:CardRootProps){return <div className={cn("rounded-xl border",variant==="raised"?"border-border bg-raised shadow-md":variant==="subtle"?"border-border-subtle bg-sunken": "border-border bg-surface shadow-xs",variant==="interactive"&&"cursor-pointer transition-colors duration-fast hover:border-border-strong hover:bg-hover",selected&&"border-primary bg-primary-subtle",className)} {...props}/>}
function CardHeader({className,...props}:ComponentPropsWithoutRef<"div">){return <div className={cn("flex flex-col gap-1 px-5 pt-5",className)} {...props}/>}
function CardTitle({className,children,...props}:ComponentPropsWithoutRef<"div">){return <div className={className} {...props}><Typography variant="heading-4" color="fg">{children}</Typography></div>}
function CardDescription({className,children,...props}:ComponentPropsWithoutRef<"div">){return <div className={className} {...props}><Typography variant="body-sm" color="muted-fg">{children}</Typography></div>}
function CardBody({className,...props}:ComponentPropsWithoutRef<"div">){return <div className={cn("px-5 py-4",className)} {...props}/>}
function CardFooter({className,...props}:ComponentPropsWithoutRef<"div">){return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-5 py-3",className)} {...props}/>}
export const Card={Root:CardRoot,Header:CardHeader,Title:CardTitle,Description:CardDescription,Body:CardBody,Footer:CardFooter};
