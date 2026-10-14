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
  type Ref,
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
import { OverlayScope } from "../../primitives/portal";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { mergeRefs } from "../../utils/merge-refs";
import { Presence } from "../../motion/presence";
import { fadeEnter } from "../../motion/overlay-keyframes";

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
    // Posiciona por left/top: o `transform` fica livre para a entrada animada.
    transform: false,
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

  const childProps = children.props as { className?: string; ref?: Ref<Element> };
  // Preserva o ref do filho (React 19: `props.ref`; React 18: `element.ref`).
  const childRef = childProps.ref ?? (children as unknown as { ref?: Ref<Element> }).ref;

  return cloneElement(children, {
    ref: mergeRefs<Element>([childRef, refs.setReference]),
    ...getReferenceProps(),
    className: cn(childProps.className, className),
  } as Record<string, unknown>);
}

// Content
const tooltipContentVariants = defineRecipe({
  base: [
    "z-tooltip px-2 py-1 rounded-control",
    "bg-fg text-canvas text-caption font-medium",
    "shadow-overlay",
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
      <OverlayScope>
        <Presence show enter={fadeEnter}>
          <div
            ref={refs.setFloating}
            role="tooltip"
            data-motion="responsive"
            style={{ ...floatingStyles, ...style }}
            className={cn(tooltipContentVariants(), className)}
            {...getFloatingProps()}
            {...props}
          >
            {children}
          </div>
        </Presence>
      </OverlayScope>
    </FloatingPortal>
  );
}

/**
 * Tooltip is a compound component for hover/focus-triggered hints. The trigger keeps
 * its own ref, so a forwarded-ref component (like `Button`) can be wrapped directly.
 *
 * @example
 * ```tsx
 * <Tooltip.Root>
 *   <Tooltip.Trigger>
 *     <Button size="icon" aria-label="Notificações">…</Button>
 *   </Tooltip.Trigger>
 *   <Tooltip.Content>Notificações</Tooltip.Content>
 * </Tooltip.Root>
 * ```
 */
export const Tooltip = {
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
};
