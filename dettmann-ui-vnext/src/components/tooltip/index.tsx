"use client";

import {
  useState,
  createContext,
  useContext,
  type ReactNode,
  type ComponentPropsWithoutRef,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  type Placement,
} from "@floating-ui/react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";

// Context
interface TooltipContextValue {
  isOpen: boolean;
  refs: ReturnType<typeof useFloating>["refs"];
  floatingStyles: ReturnType<typeof useFloating>["floatingStyles"];
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext(component: string) {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error(`<Tooltip.${component}> must be used within <Tooltip.Root>`);
  }
  return context;
}

// Root
interface TooltipRootProps {
  children: ReactNode;
  /** Controlled open state */
  open?: boolean;
  /** Default open state */
  defaultOpen?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Placement of the tooltip */
  placement?: Placement;
  /** Delay before showing (ms) */
  delayShow?: number;
  /** Delay before hiding (ms) */
  delayHide?: number;
  /** Offset from the trigger */
  offsetValue?: number;
}

function TooltipRoot({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = "top",
  delayShow = 200,
  delayHide = 0,
  offsetValue = 6,
}: TooltipRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const setIsOpen = (open: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(open);
    }
    onOpenChange?.(open);
  };

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(offsetValue), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, {
    delay: { open: delayShow, close: delayHide },
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <TooltipContext.Provider
      value={{
        isOpen,
        refs,
        floatingStyles,
        getReferenceProps,
        getFloatingProps,
      }}
    >
      {children}
    </TooltipContext.Provider>
  );
}

// Trigger
interface TooltipTriggerProps {
  children: ReactElement<{ className?: string }>;
  /** Additional class name */
  className?: string;
}

function TooltipTrigger({ children, className }: TooltipTriggerProps) {
  const { refs, getReferenceProps } = useTooltipContext("Trigger");

  if (!isValidElement(children)) {
    throw new Error("<Tooltip.Trigger> must have a single React element child");
  }

  const childProps = children.props as { className?: string };

  return cloneElement(children, {
    ref: refs.setReference,
    ...getReferenceProps(),
    className: cn(childProps.className, className),
  } as Record<string, unknown>);
}

// Content
const tooltipContentVariants = defineRecipe({
  base: [
    "z-tooltip px-3 py-1.5 rounded-lg",
    "bg-fg text-page text-sm",
    "shadow-xs",
    "max-w-xs",
  ].join(" "),
});

type TooltipContentVariants = VariantProps<typeof tooltipContentVariants>;

interface TooltipContentProps
  extends ComponentPropsWithoutRef<"div">,
    TooltipContentVariants {}

function TooltipContent({
  children,
  className,
  style,
  ...props
}: TooltipContentProps) {
  const { isOpen, refs, floatingStyles, getFloatingProps } =
    useTooltipContext("Content");

  if (!isOpen) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        role="tooltip"
        style={{ ...floatingStyles, ...style }}
        className={cn(tooltipContentVariants(), className)}
        {...getFloatingProps()}
        {...props}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}

/**
 * Tooltip is a compound component for hover/focus-triggered hints.
 *
 * @example
 * ```tsx
 * <Tooltip.Root open={open} onOpenChange={setOpen}>
 *   <Tooltip.Trigger>
 *     <Button>Hover me</Button>
 *   </Tooltip.Trigger>
 *   <Tooltip.Content>
 *     Helpful tooltip text
 *   </Tooltip.Content>
 * </Tooltip.Root>
 * ```
 */
export const Tooltip = {
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
};
