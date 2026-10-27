import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const buttonGroupVariants = defineRecipe({
  base: [
    "inline-flex isolate",
    "[&>*]:rounded-none [&>*]:-ml-px [&>*:first-child]:ml-0",
    "[&>*:first-child]:rounded-l-control [&>*:last-child]:rounded-r-control",
    "[&>*:focus-visible]:z-10",
  ].join(" "),
});

interface ButtonGroupProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * ButtonGroup visually joins adjacent Buttons (shared edges, outer radius from the control shape).
 *
 * @example
 * ```tsx
 * <ButtonGroup>
 *   <Button>Left</Button>
 *   <Button>Middle</Button>
 *   <Button>Right</Button>
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
