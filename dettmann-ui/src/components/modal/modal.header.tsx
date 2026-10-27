import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const modalHeaderVariants = defineRecipe({
  // D-040: header and footer are structure bands around the raised body (boards).
  base: "flex shrink-0 border-b border-border bg-structure",
  variants: {
    layout: {
      /** Title and actions on one line. */
      inline: "items-center justify-between gap-4 px-6 pt-5 pb-4",
      /** Rows stacked 16 px apart, the last one (tabs) touching the bottom line. */
      stacked: "flex-col items-stretch gap-4 px-6 pt-5",
      /** One 76 px line: image or icon, title block, actions (wizard boards). */
      bar: "h-19 items-center gap-4 pl-6 pr-5",
    },
  },
  defaultVariants: { layout: "inline" },
});

interface ModalHeaderProps extends ComponentPropsWithoutRef<"div"> {
  /** `inline` (default), `stacked` (a header with tabs under it) or `bar` (one 76 px line). */
  layout?: "inline" | "stacked" | "bar";
}

/**
 * Modal.Header is the header section of the modal.
 * Typically contains the title and close button.
 */
export function ModalHeader({
  children,
  className,
  layout,
  ...props
}: ModalHeaderProps) {
  return (
    <div data-layer="medium" className={cn(modalHeaderVariants({ layout }), className)} {...props}>
      {children}
    </div>
  );
}
