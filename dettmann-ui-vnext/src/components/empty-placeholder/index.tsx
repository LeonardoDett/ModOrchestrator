import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";

const rootVariants = defineRecipe({
  base: "flex w-full flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-fg-subtle",
});

const mediaVariants = defineRecipe({
  base: "[&_img]:h-24 [&_img]:w-auto [&_svg]:h-24 [&_svg]:w-24",
});

const DEFAULT_MESSAGE = "Ainda não há nada aqui";

interface EmptyPlaceholderProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Ícone ou ilustração. Opcional. */
  media?: ReactNode;
  /** Texto de ajuda. Cai no padrão quando omitido. */
  message?: ReactNode;
}

/**
 * EmptyPlaceholder is a dim, centered empty region with no actions.
 * Pass an icon or illustration as `media`. Omit `message` for the default help text.
 *
 * @example
 * ```tsx
 * <EmptyPlaceholder media={<Icon icon={Inbox} size="2xl" />} />
 * <EmptyPlaceholder message="Nenhum item por aqui." />
 * ```
 */
export function EmptyPlaceholder({
  media,
  message = DEFAULT_MESSAGE,
  className,
  ...props
}: EmptyPlaceholderProps) {
  return (
    <div className={cn(rootVariants(), className)} {...props}>
      {media != null ? <div className={mediaVariants()}>{media}</div> : null}
      <Typography variant="body-sm" className="max-w-sm">
        {message}
      </Typography>
    </div>
  );
}
