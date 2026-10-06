import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";
import { Icon } from "../../primitives/icon";
import { toneData, type Tone } from "../../theme/tone";

const tagVariants = defineRecipe({
  base: [
    "inline-flex items-center gap-1",
    "font-medium whitespace-nowrap text-xs",
    "rounded-full",
    "border border-secondary-border bg-secondary-subtle text-secondary-text",
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
  tone?: Tone;
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
  tone,
  ...props
}: TagProps) {
  return (
    <span
      className={cn(
        tagVariants({ size, dismissible: Boolean(onRemove) }),
        tone && "border-tone-border bg-tone-subtle text-tone-text",
        className
      )}
      {...toneData(tone)}
      {...props}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-fg-muted hover:bg-hover hover:text-fg"
          onClick={() => onRemove(value)}
        >
          <Icon icon={X} size="xs" />
        </button>
      ) : null}
    </span>
  );
}
