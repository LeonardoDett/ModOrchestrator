import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Container, type ContainerVariants } from "../../primitives/container";
import { Typography } from "../../primitives/typography";

const headerVariants = defineRecipe({
  base: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
});

const headingBlockVariants = defineRecipe({
  base: "flex min-w-0 flex-1 flex-col gap-1",
});

const actionsVariants = defineRecipe({
  base: "flex shrink-0 flex-wrap items-center gap-2",
});

const bodyVariants = defineRecipe({
  base: "flex flex-1 flex-col gap-6",
});

interface PageContainerProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  /** Page title (optional slot) */
  title?: ReactNode;
  /** Page description under the title (optional slot) */
  description?: ReactNode;
  /** Action buttons or controls (optional slot) */
  actions?: ReactNode;
  /** Container max-width (default `2xl` = 1440px desktop frame) */
  size?: ContainerVariants["size"];
  /** Container horizontal padding (default `lg` scales 16 → 32 → 80px) */
  padding?: ContainerVariants["padding"];
}

/**
 * PageContainer wraps page content with optional title, description, and actions.
 * Default max-width is the 1440px desktop frame token (`size="2xl"`).
 * It is a content wrapper, not a full app shell.
 *
 * @example
 * ```tsx
 * <PageContainer
 *   title="Users"
 *   description="Manage accounts"
 *   actions={<Button>New user</Button>}
 * >
 *   <Table />
 * </PageContainer>
 * ```
 */
export function PageContainer({
  title,
  description,
  actions,
  children,
  size = "full",
  padding = "lg",
  className,
  ...props
}: PageContainerProps) {
  const hasHeader = title != null || description != null || actions != null;

  return (
    <Container size={size} padding={padding} className={cn(bodyVariants(), className)} {...props}>
      {hasHeader ? (
        <div className={headerVariants()}>
          <div className={headingBlockVariants()}>
            {title != null ? (
              typeof title === "string" ? (
                <Typography variant="heading-2" color="fg">
                  {title}
                </Typography>
              ) : (
                title
              )
            ) : null}
            {description != null ? (
              typeof description === "string" ? (
                <Typography variant="body" color="muted-fg">
                  {description}
                </Typography>
              ) : (
                description
              )
            ) : null}
          </div>
          {actions != null ? <div className={actionsVariants()}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Container>
  );
}
