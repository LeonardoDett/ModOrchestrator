import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { XIcon } from "../../icons/glyphs/x";
import { cn } from "../../utils/cn";
import { Icon } from "../../primitives/icon";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";

const tagVariants = defineRecipe({
  base: [
    "inline-flex items-center gap-1",
    "font-medium whitespace-nowrap text-xs",
    "rounded-full",
    "border border-intent-border bg-intent-subtle text-intent-text",
  ].join(" "),
  variants: {
    size: {
      sm: "h-5",
      md: "h-6",
    },
    dismissible: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    { size: "sm", dismissible: false, class: "px-2" },
    { size: "md", dismissible: false, class: "px-2.5" },
    { size: "sm", dismissible: true, class: "pl-2 pr-0.5" },
    { size: "md", dismissible: true, class: "pl-2.5 pr-0.5" },
  ],
  defaultVariants: {
    size: "md",
    dismissible: false,
  },
});

type TagVariants = VariantProps<typeof tagVariants>;

interface TagProps
  extends Omit<ComponentPropsWithoutRef<"span">, "onRemove">,
    Omit<TagVariants, "dismissible"> {
  children: ReactNode;
  /** Value delivered to onRemove (never a DOM event) */
  value?: string;
  /** Called with `value` when the dismiss control is pressed */
  onRemove?: (value: string) => void;
  /** Accessible name of the dismiss control (localize it). */
  removeLabel?: string;
  /** Significado cromático; padrão `neutral`. */
  intent?: Intent;
}

/**
 * Tag is a dismissible pill. Use Badge when the label is not removable.
 *
 * @example
 * ```tsx
 * <Tag value="design" onRemove={setRemoved}>Design</Tag>
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
  ...props
}: TagProps) {
  return (
    <span
      className={cn(
        tagVariants({ size, dismissible: Boolean(onRemove) }),
        className
      )}
      {...intentData(intent)}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-fg-muted hover:bg-state-hover hover:text-fg"
          onClick={() => onRemove(value)}
        >
          <Icon icon={XIcon} size="xs" />
        </button>
      ) : null}
    </span>
  );
}
