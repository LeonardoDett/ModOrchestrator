"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Divider } from "../../primitives/divider";
import { createStrictContext } from "../../utils/create-strict-context";

interface BreadcrumbsContextValue {
  /** Default separator between crumbs */
  separator: ReactNode;
}

const [BreadcrumbsProvider, useBreadcrumbsContext] =
  createStrictContext<BreadcrumbsContextValue>("Breadcrumbs");

const rootVariants = defineRecipe({
  base: "flex flex-wrap items-center gap-2 text-sm",
});

const itemVariants = defineRecipe({
  base: "inline-flex items-center text-sm",
  variants: {
    current: {
      true: "font-medium text-fg",
      false: "text-fg-muted hover:text-primary-text transition-colors duration-fast",
    },
  },
  defaultVariants: {
    current: false,
  },
});

const defaultSeparator = (
  <Divider
    orientation="vertical"
    color="border"
    className="h-3.5"
    decorative
  />
);

interface BreadcrumbsRootProps extends ComponentPropsWithoutRef<"nav"> {
  children: ReactNode;
  /** Override the default thin divider between items */
  separator?: ReactNode;
}

/**
 * Breadcrumbs.Root is a nav landmark wrapping the crumb list.
 */
function BreadcrumbsRoot({
  children,
  className,
  separator = defaultSeparator,
  ...props
}: BreadcrumbsRootProps) {
  return (
    <BreadcrumbsProvider value={{ separator }}>
      <nav aria-label="Breadcrumb" className={className} {...props}>
        <ol className={rootVariants()}>{children}</ol>
      </nav>
    </BreadcrumbsProvider>
  );
}

interface BreadcrumbsItemProps extends Omit<ComponentPropsWithoutRef<"a">, "href"> {
  /** Navigates when set and the item is not current */
  href?: string;
  /** Marks this crumb as the current page */
  current?: boolean;
  children: ReactNode;
}

/**
 * Breadcrumbs.Item is a crumb. Pass `current` on the page the user is on.
 * Inactive crumbs use muted text; the current page uses foreground.
 */
function BreadcrumbsItem({
  href,
  current = false,
  children,
  className,
  ...props
}: BreadcrumbsItemProps) {
  const classes = cn(itemVariants({ current }), className);

  return (
    <li className="inline-flex items-center">
      {current || !href ? (
        <span className={classes} aria-current={current ? "page" : undefined} {...props}>
          {children}
        </span>
      ) : (
        <a href={href} className={classes} {...props}>
          {children}
        </a>
      )}
    </li>
  );
}

interface BreadcrumbsSeparatorProps extends ComponentPropsWithoutRef<"li"> {
  children?: ReactNode;
}

/**
 * Breadcrumbs.Separator sits between items. Defaults to a thin Divider
 * in the border token (neutral-300). Hidden from the accessibility tree.
 */
function BreadcrumbsSeparator({
  children,
  className,
  ...props
}: BreadcrumbsSeparatorProps) {
  const { separator } = useBreadcrumbsContext("Separator");

  return (
    <li
      aria-hidden="true"
      className={cn("inline-flex items-center text-fg-muted select-none", className)}
      {...props}
    >
      {children ?? separator}
    </li>
  );
}

/**
 * Breadcrumbs is a compound trail for the current location.
 *
 * @example
 * ```tsx
 * <Breadcrumbs.Root>
 *   <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
 *   <Breadcrumbs.Separator />
 *   <Breadcrumbs.Item href="/settings">Settings</Breadcrumbs.Item>
 *   <Breadcrumbs.Separator />
 *   <Breadcrumbs.Item current>Profile</Breadcrumbs.Item>
 * </Breadcrumbs.Root>
 * ```
 */
export const Breadcrumbs = {
  Root: BreadcrumbsRoot,
  Item: BreadcrumbsItem,
  Separator: BreadcrumbsSeparator,
};
