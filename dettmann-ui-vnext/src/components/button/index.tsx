import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Spinner } from "../../primitives/spinner";
import { resolveEmphasis } from "../../theme/emphasis";
import type { Emphasis, Intent, MotionLevel } from "../../theme/engine";

const buttonVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center gap-2",
    "text-sm font-semibold",
    "rounded-control",
    "motion-transition motion-press",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:bg-sunken disabled:text-fg-subtle disabled:border-transparent disabled:shadow-none",
  ].join(" "),
  variants: {
    /** Size variant: altura pelas primitivas de controle. */
    size: {
      sm: "h-control-sm px-3 text-xs",
      md: "h-control-md px-4 text-sm",
      lg: "h-control-lg px-5 text-md",
      icon: "size-control-md p-0",
      "icon-sm": "size-control-sm p-0",
      "icon-lg": "size-control-lg p-0",
    },
    /** Full width */
    fullWidth: {
      true: "w-full",
      false: "",
    },
  },
  defaultVariants: {
    size: "md",
    fullWidth: false,
  },
});

type ButtonVariants = VariantProps<typeof buttonVariants>;

interface ButtonProps
  extends ComponentPropsWithoutRef<"button">,
    ButtonVariants {
  /** Camada 60/30/10. Padrão `medium`; `high` sem intent resolve para `brand`. */
  emphasis?: Emphasis;
  /** Significado cromático. Padrão `neutral` (ou `brand` quando `emphasis="high"`). */
  intent?: Intent;
  /** Nível de movimento; padrão derivado da ênfase. */
  motion?: MotionLevel;
  /** Show loading spinner */
  loading?: boolean;
  /** Loading text (optional) */
  loadingText?: string;
  /** Optional icon rendered before the label; gap is applied automatically */
  startIcon?: ReactNode;
  /** Optional icon rendered after the label; gap is applied automatically */
  endIcon?: ReactNode;
}

/**
 * Button: aparência resolvida pela tabela central `emphasis × intent`.
 *
 * @example
 * ```tsx
 * <Button>Salvar</Button>
 * <Button emphasis="high">Implantar</Button>
 * <Button emphasis="low" intent="danger">Excluir</Button>
 * <Button startIcon={<Icon icon={Plus} size="sm" />}>Adicionar</Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      className,
      emphasis,
      intent,
      motion,
      size,
      fullWidth,
      loading = false,
      loadingText,
      startIcon,
      endIcon,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || loading;
    const hasIcons = Boolean(startIcon || endIcon);
    const resolved = resolveEmphasis({ emphasis, intent, motion });

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          buttonVariants({ size, fullWidth }),
          resolved.className,
          resolved.emphasis !== "low" && "shadow-raised",
          hasIcons && "gap-2",
          className
        )}
        {...resolved.attrs}
        {...props}
      >
        {loading && (
          <Spinner
            size={size === "sm" || size === "icon-sm" ? "xs" : "sm"}
            className="shrink-0"
          />
        )}
        {!loading && startIcon ? (
          <span className="inline-flex shrink-0">{startIcon}</span>
        ) : null}
        {loading && loadingText ? loadingText : children}
        {!loading && endIcon ? (
          <span className="inline-flex shrink-0">{endIcon}</span>
        ) : null}
      </button>
    );
  }
);
