import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { XIcon } from "../../icons/glyphs/x";
import { cn } from "../../utils/cn";
import { resolveEmphasis, restingClassName } from "../../theme/emphasis";
import type { CategoryColor, Intent } from "../../theme/engine";
import { Icon, type IconComponent } from "../../primitives/icon";

const tagVariants = defineRecipe({
  base: [
    "inline-flex items-center gap-1",
    "font-medium whitespace-nowrap text-xs",
    "border",
  ].join(" "),
  variants: {
    size: {
      /** Inline label under a name (board JogoMods): 18 px, no outline. */
      xs: "h-4.5 text-[0.6875rem]",
      sm: "h-5",
      md: "h-6",
    },
    outline: {
      true: "border-intent-border",
      false: "border-transparent",
    },
    /** `pill` (default) for tags; `rounded` for a category chip (boards). */
    shape: {
      pill: "rounded-pill",
      rounded: "rounded-control",
    },
    dismissible: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    { size: "xs", dismissible: false, class: "px-1.75" },
    { size: "xs", dismissible: true, class: "pl-1.75 pr-0.5" },
    { size: "sm", dismissible: false, class: "px-2" },
    { size: "md", dismissible: false, class: "px-2.5" },
    { size: "sm", dismissible: true, class: "pl-2 pr-0.5" },
    { size: "md", dismissible: true, class: "pl-2.5 pr-0.5" },
  ],
  defaultVariants: {
    size: "md",
    dismissible: false,
    shape: "pill",
  },
});

const tagAddVariants = defineRecipe({
  base: [
    "inline-flex items-center gap-1 rounded-pill border border-dashed border-border-strong bg-transparent",
    "font-medium whitespace-nowrap text-fg-muted",
    "motion-transition motion-press hover:bg-state-hover hover:text-fg focus-ring",
  ].join(" "),
  variants: {
    size: {
      xs: "h-4.5 px-1.75 text-[0.6875rem]",
      sm: "h-5.5 px-2 text-xs",
      md: "h-6 px-2.5 text-xs",
    },
  },
  defaultVariants: { size: "sm" },
});

type TagVariants = VariantProps<typeof tagVariants>;

interface TagProps
  extends Omit<ComponentPropsWithoutRef<"span">, "onRemove">,
    Omit<TagVariants, "dismissible" | "outline"> {
  children: ReactNode;
  /** Value delivered to onRemove (never a DOM event) */
  value?: string;
  /** Called with `value` when the dismiss control is pressed */
  onRemove?: (value: string) => void;
  /** Accessible name of the dismiss control (localize it). */
  removeLabel?: string;
  /** Significado cromático; padrão `neutral`. */
  intent?: Intent;
  /** `medium` = tinta suave (padrão), `low` = só contorno. */
  emphasis?: "low" | "medium";
  /**
   * Cor da paleta categórica (categoria, tag do usuário). Exclusiva com `intent`:
   * sem significado de status.
   */
  color?: CategoryColor;
  /** Ícone antes do texto (decorativo). */
  icon?: IconComponent;
  /** Ponto da cor antes do texto (tag do usuário). */
  dot?: boolean;
  /** Contorno na cor do intent. Padrão: sim, menos no `xs`. */
  outline?: boolean;
}

/**
 * Tag is a dismissible pill. Use Badge when the label is not removable.
 *
 * @example
 * ```tsx
 * <Tag value="design" onRemove={setRemoved}>Design</Tag>
 * <Tag color="violet" icon={LayersIcon}>Gráficos</Tag>
 * <Tag size="xs" color="amber" dot>essencial</Tag>
 * ```
 */
export function Tag({
  children,
  className,
  size,
  value = "",
  onRemove,
  removeLabel = "Remove",
  intent = "neutral",
  emphasis = "medium",
  color,
  icon,
  dot = false,
  shape,
  outline,
  ...props
}: TagProps) {
  // Com cor da paleta, as classes coloridas do intent; `data-category` reaponta as variáveis.
  const resolved = resolveEmphasis({ emphasis, intent: color ? "brand" : intent });
  return (
    <span
      className={cn(
        tagVariants({ size, dismissible: Boolean(onRemove), shape, outline: outline ?? size !== "xs" }),
        restingClassName(resolved),
        className
      )}
      data-intent={resolved.intent}
      data-category={color}
      data-layer={resolved.emphasis}
      {...props}
    >
      {dot ? <span aria-hidden="true" className="size-1.25 shrink-0 rounded-pill bg-intent-fill" /> : null}
      {icon ? <Icon icon={icon} size="xs" color="current" /> : null}
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          className="inline-flex h-4 w-4 items-center justify-center rounded-pill text-fg-muted motion-transition hover:bg-state-hover hover:text-fg focus-ring"
          onClick={() => onRemove(value)}
        >
          <XIcon size="xs" />
        </button>
      ) : null}
    </span>
  );
}

interface TagAddProps extends ComponentPropsWithoutRef<"button"> {
  /** Same heights as Tag; `sm` here is 22 px, the tags of a detail header. */
  size?: "xs" | "sm" | "md";
}

/**
 * Tag.Add-style dashed pill that starts adding a tag ("+ tag").
 *
 * @example
 * ```tsx
 * <TagAdd onClick={startAdding}>+ tag</TagAdd>
 * ```
 */
export function TagAdd({ size, className, type = "button", ...props }: TagAddProps) {
  return <button type={type} className={cn(tagAddVariants({ size }), className)} {...props} />;
}
