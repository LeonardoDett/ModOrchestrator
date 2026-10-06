import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Icon } from "../../primitives/icon";
import { Typography } from "../../primitives/typography";

const addVariants = defineRecipe({
  base: [
    "flex aspect-square w-full min-w-0 flex-col items-center justify-center gap-2 p-4 text-center",
    "rounded-xl border border-dashed border-border-strong bg-transparent text-fg-subtle",
    "transition-colors duration-fast ease-default",
    "hover:bg-hover active:bg-pressed",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
    "disabled:pointer-events-none disabled:bg-muted disabled:text-fg-subtle disabled:border-transparent",
  ].join(" "),
});

const DEFAULT_LABEL = "Adicionar";

interface GalleryAddProps extends ComponentPropsWithoutRef<"button"> {
  /** Visible label when `children` is omitted. Defaults to "Adicionar". */
  label?: ReactNode;
}

/**
 * Gallery.Add is a square dashed action. It works inside or outside Gallery.Root.
 * Omit `children` for the plus icon and label. Pass `children` to replace that content.
 *
 * @example
 * ```tsx
 * <Gallery.Add onClick={onAdd} />
 * <Gallery.Add label="Nova foto" onClick={onAdd} />
 * ```
 */
export function GalleryAdd({
  label = DEFAULT_LABEL,
  children,
  className,
  type = "button",
  ...props
}: GalleryAddProps) {
  return (
    <button type={type} className={cn(addVariants(), className)} {...props}>
      {children ?? (
        <>
          <Icon icon={Plus} size="lg" />
          <Typography variant="body-sm" align="center">
            {label}
          </Typography>
        </>
      )}
    </button>
  );
}
