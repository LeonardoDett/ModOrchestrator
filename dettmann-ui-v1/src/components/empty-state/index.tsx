import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";

const rootVariants = defineRecipe({
  base: "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
});

interface EmptyStateRootProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

function EmptyStateRoot({ children, className, ...props }: EmptyStateRootProps) {
  return (
    <div className={cn(rootVariants(), className)} {...props}>
      {children}
    </div>
  );
}

function EmptyStateIcon({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mb-1", className)} {...props} />;
}

interface EmptyStateTitleProps {
  children: ReactNode;
  className?: string;
}

function EmptyStateTitle({ className, children }: EmptyStateTitleProps) {
  return (
    <Typography variant="heading-4" color="fg" className={className}>
      {children}
    </Typography>
  );
}

interface EmptyStateDescriptionProps {
  children: ReactNode;
  className?: string;
}

function EmptyStateDescription({ className, children }: EmptyStateDescriptionProps) {
  return (
    <Typography variant="body-sm" color="muted-fg" className={cn("max-w-sm", className)}>
      {children}
    </Typography>
  );
}

function EmptyStateActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("mt-2 flex flex-wrap items-center justify-center gap-2", className)} {...props} />
  );
}

/**
 * EmptyState is a generic “no data yet” layout. Pass FeaturedIcon, copy, and actions.
 *
 * @example
 * ```tsx
 * <EmptyState.Root>
 *   <EmptyState.Icon>
 *     <FeaturedIcon icon={Inbox} color="neutral" />
 *   </EmptyState.Icon>
 *   <EmptyState.Title>No items</EmptyState.Title>
 *   <EmptyState.Description>Create the first one to get started.</EmptyState.Description>
 *   <EmptyState.Actions>
 *     <Button>Create</Button>
 *   </EmptyState.Actions>
 * </EmptyState.Root>
 * ```
 */
export const EmptyState = {
  Root: EmptyStateRoot,
  Icon: EmptyStateIcon,
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
  Actions: EmptyStateActions,
};
