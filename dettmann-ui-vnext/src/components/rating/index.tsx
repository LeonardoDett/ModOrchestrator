"use client";

import { type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Icon } from "../../primitives/icon";
import { useControllableState } from "../../hooks/use-controllable-state";

const ratingVariants = defineRecipe({
  base: "inline-flex items-center gap-0.5",
});

interface RatingRootProps
  extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  /** Controlled value (1..max) */
  value?: number;
  /** Uncontrolled default */
  defaultValue?: number;
  /** Called with the numeric rating, never a DOM event */
  onValueChange?: (value: number) => void;
  /** Number of stars */
  max?: number;
  /** Read-only display */
  readOnly?: boolean;
  /** Disable interaction */
  disabled?: boolean;
}

/**
 * Rating.Root is a star rating control.
 *
 * @example
 * ```tsx
 * <Rating.Root value={3} onValueChange={setRating} />
 * ```
 */
function RatingRoot({
  value: controlledValue,
  defaultValue = 0,
  onValueChange,
  max = 5,
  readOnly = false,
  disabled = false,
  className,
  ...props
}: RatingRootProps) {
  const [value, setValue] = useControllableState({
    value: controlledValue,
    defaultValue,
    onChange: onValueChange,
  });

  const interactive = !readOnly && !disabled;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setValue(Math.min(max, (value ?? 0) + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setValue(Math.max(0, (value ?? 0) - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setValue(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setValue(max);
    }
  };

  return (
    <div
      role="slider"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? 0}
      aria-disabled={disabled || undefined}
      aria-readonly={readOnly || undefined}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={handleKeyDown}
      className={cn(
        ratingVariants(),
        disabled && "pointer-events-none text-fg-subtle",
        className
      )}
      {...props}
    >
      {Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        const filled = starValue <= (value ?? 0);
        return (
          <button
            key={starValue}
            type="button"
            disabled={!interactive}
            tabIndex={-1}
            aria-label={`${starValue} of ${max}`}
            className={cn(
              "rounded-sm p-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              interactive && "cursor-pointer"
            )}
            onClick={() => interactive && setValue(starValue)}
          >
            <Icon
              icon={Star}
              size="md"
              color={filled ? "warning" : "muted-fg"}
              className={filled ? "fill-current" : undefined}
            />
          </button>
        );
      })}
    </div>
  );
}

export const Rating = {
  Root: RatingRoot,
};
