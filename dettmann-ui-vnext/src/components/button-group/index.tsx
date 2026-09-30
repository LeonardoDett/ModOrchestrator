import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const buttonGroupVariants = defineRecipe({
  base: [
    "inline-flex isolate",
    "[&>*]:rounded-none [&>*]:-ml-px [&>*:first-child]:ml-0",
    "[&>*:first-child]:rounded-l-lg [&>*:last-child]:rounded-r-lg",
    "[&>*:focus-visible]:z-10",
  ].join(" "),
});

interface ButtonGroupProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * ButtonGroup visually joins adjacent Buttons (shared edges, 8px outer radius).
 *
 * @example
 * ```tsx
 * <ButtonGroup>
 *   <Button variant="secondary">Left</Button>
 *   <Button variant="secondary">Middle</Button>
 *   <Button variant="secondary">Right</Button>
 * </ButtonGroup>
 * ```
 */
export function ButtonGroup({ className, ...props }: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(buttonGroupVariants(), className)}
      {...props}
    />
  );
}
