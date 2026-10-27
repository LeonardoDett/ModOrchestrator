import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";

export interface CardRootProps extends ComponentPropsWithoutRef<"div"> {
  /**
   * `low` (default): a bordered surface, outside the structural layer.
   * `medium`: structure (`bg-structure`, `data-layer="medium"`). There is no `high`:
   * the highlight comes from the action inside the card.
   */
  emphasis?: "low" | "medium";
  /** Clickable card: pointer cursor, hover layer and focus ring. */
  interactive?: boolean;
  selected?: boolean;
  children?: ReactNode;
}

// Um fundo e uma borda por estado (o `cn` não resolve conflito de classes).
const REST = {
  low: "border-border bg-surface",
  medium: "border-border bg-structure",
} as const;

/**
 * Card groups related content on a flat surface (separation by border, never shadow).
 *
 * @example
 * ```tsx
 * <Card.Root>
 *   <Card.Header>
 *     <Card.Title>Members</Card.Title>
 *   </Card.Header>
 *   <Card.Body>...</Card.Body>
 * </Card.Root>
 * <Card.Root emphasis="medium">...</Card.Root>
 * ```
 */
function CardRoot({ emphasis = "low", interactive = false, selected = false, className, ...props }: CardRootProps) {
  return (
    <div
      data-layer={emphasis === "medium" ? "medium" : undefined}
      className={cn(
        "rounded-card border",
        selected ? "border-border-strong bg-selected" : REST[emphasis],
        interactive && "cursor-pointer motion-transition hover:state-layer-hover focus-ring",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("flex flex-col gap-1 px-4 pt-4", className)} {...props} />;
}

function CardTitle({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={className} {...props}>
      <Typography variant="heading-4" color="fg">
        {children}
      </Typography>
    </div>
  );
}

function CardDescription({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={className} {...props}>
      <Typography variant="body-sm" color="muted-fg">
        {children}
      </Typography>
    </div>
  );
}

function CardBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}

function CardFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-4 py-3", className)} {...props} />;
}

export const Card = {
  Root: CardRoot,
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Body: CardBody,
  Footer: CardFooter,
};
