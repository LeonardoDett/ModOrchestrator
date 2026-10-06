import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Spinner } from "../../primitives/spinner";
import { toneData, type Tone } from "../../theme/tone";

const buttonSolid =
  "bg-tone text-on-tone shadow-xs hover:bg-tone-hover active:bg-tone-pressed";
const buttonSoft =
  "bg-tone-subtle text-tone-text shadow-xs hover:bg-tone-subtle-hover";
const buttonOutlineNeutral =
  "border border-border-strong bg-transparent text-fg shadow-xs hover:bg-hover active:bg-pressed";
const buttonOutlineTone =
  "border border-tone-border bg-transparent text-tone-text shadow-xs hover:bg-tone-subtle";
const buttonGhostNeutral = "bg-transparent text-fg hover:bg-hover active:bg-pressed";
const buttonGhostTone = "bg-transparent text-tone-text hover:bg-tone-subtle";

const buttonVariants = defineRecipe({
  base: [
    "inline-flex items-center justify-center gap-2",
    "text-sm font-semibold",
    "rounded-lg",
    "transition-colors duration-fast ease-default",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
    "disabled:pointer-events-none disabled:bg-muted disabled:text-fg-subtle disabled:border-transparent disabled:shadow-none",
  ].join(" "),
  variants: {
    /** Visual variant */
    variant: {
      primary: buttonSolid,
      solid: buttonSolid,
      secondary: buttonSoft,
      soft: buttonSoft,
      outline: "",
      ghost: "",
      danger: buttonSolid,
      success: buttonSolid,
      link: "bg-transparent text-primary-text underline-offset-4 hover:underline",
    },
    /** Size variant */
    size: {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2.5 text-sm",
      lg: "px-5 py-3 text-md",
      icon: "h-10 w-10 p-0",
      "icon-sm": "h-8 w-8 p-0",
      "icon-lg": "h-12 w-12 p-0",
    },
    /** Full width */
    fullWidth: {
      true: "w-full",
      false: "",
    },
  },
  compoundVariants: [
    {
      variant: "link",
      class: "px-0 py-0 shadow-none",
    },
  ],
  defaultVariants: {
    variant: "primary",
    size: "md",
    fullWidth: false,
  },
});

type ButtonVariants = VariantProps<typeof buttonVariants>;

interface ButtonProps
  extends ComponentPropsWithoutRef<"button">,
    ButtonVariants {
  /** Papel cromático. Sem valor, outline/ghost ficam neutros, o sólido md/lg herda primary e o sólido sm/icon usa secondary. */
  tone?: Tone;
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
 * Button component with multiple variants and sizes.
 *
 * @example
 * ```tsx
 * <Button>Click me</Button>
 * <Button variant="secondary" size="lg">Large Secondary</Button>
 * <Button variant="outline" loading>Loading...</Button>
 * <Button variant="danger" disabled>Disabled</Button>
 * <Button startIcon={<Icon icon={Plus} size="sm" />}>Adicionar</Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      className,
      variant,
      tone,
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
    const resolvedSize = size ?? "md";
    const compactSolid =
      (resolvedSize === "sm" ||
        resolvedSize === "icon" ||
        resolvedSize === "icon-sm" ||
        resolvedSize === "icon-lg") &&
      (variant == null || variant === "primary" || variant === "solid");
    const impliedTone: Tone | undefined =
      tone ??
      (variant === "danger"
        ? "danger"
        : variant === "success"
          ? "success"
          : variant === "secondary" || compactSolid
            ? "secondary"
            : variant == null || variant === "primary" || variant === "solid"
              ? // A solid button paints with bg-tone, which needs a tone:
                // without it the primary action rendered transparent.
                "primary"
              : undefined);
    const neutral = variant === "outline" || variant === "ghost";
    const surfaceTone = neutral ? tone : impliedTone;
    const outlineClass =
      variant === "outline" ? (tone ? buttonOutlineTone : buttonOutlineNeutral) : undefined;
    const ghostClass =
      variant === "ghost" ? (tone ? buttonGhostTone : buttonGhostNeutral) : undefined;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          buttonVariants({ variant, size, fullWidth }),
          outlineClass,
          ghostClass,
          hasIcons && "gap-2",
          className
        )}
        {...toneData(surfaceTone)}
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
