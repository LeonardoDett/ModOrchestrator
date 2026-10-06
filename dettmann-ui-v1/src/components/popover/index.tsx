"use client";

import {
  useState,
  useId,
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
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  type Placement,
} from "@floating-ui/react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";

// Context
interface PopoverContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  refs: ReturnType<typeof useFloating>["refs"];
  floatingStyles: ReturnType<typeof useFloating>["floatingStyles"];
  context: ReturnType<typeof useFloating>["context"];
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
  popoverId: string;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext(component: string) {
  const context = useContext(PopoverContext);
  if (!context) {
    throw new Error(`<Popover.${component}> must be used within <Popover.Root>`);
  }
  return context;
}

// Root
interface PopoverRootProps {
  children: ReactNode;
  /** Controlled open state */
  open?: boolean;
  /** Default open state */
  defaultOpen?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Placement of the popover */
  placement?: Placement;
  /** Offset from the trigger */
  offsetValue?: number;
}

function PopoverRoot({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom",
  offsetValue = 8,
}: PopoverRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const setIsOpen = (open: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(open);
    }
    onOpenChange?.(open);
  };

  const popoverId = useId();

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(offsetValue), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  return (
    <PopoverContext.Provider
      value={{
        isOpen,
        setIsOpen,
        refs,
        floatingStyles,
        context,
        getReferenceProps,
        getFloatingProps,
        popoverId,
      }}
    >
      {children}
    </PopoverContext.Provider>
  );
}

// Trigger
interface PopoverTriggerProps {
  children: ReactElement<{ className?: string }>;
  /** Additional class name */
  className?: string;
}

function PopoverTrigger({ children, className }: PopoverTriggerProps) {
  const { refs, getReferenceProps } = usePopoverContext("Trigger");

  if (!isValidElement(children)) {
    throw new Error("<Popover.Trigger> must have a single React element child");
  }

  const childProps = children.props as { className?: string };

  return cloneElement(children, {
    ref: refs.setReference,
    ...getReferenceProps(),
    className: cn(childProps.className, className),
  } as Record<string, unknown>);
}

// Content
const popoverContentVariants = defineRecipe({
  base: [
    "z-50 rounded-xl",
    "bg-raised border border-border shadow-xl",
    "outline-none",
  ].join(" "),
});

type PopoverContentVariants = VariantProps<typeof popoverContentVariants>;

interface PopoverContentProps
  extends ComponentPropsWithoutRef<"div">,
    PopoverContentVariants {}

function PopoverContent({
  children,
  className,
  style,
  ...props
}: PopoverContentProps) {
  const { isOpen, refs, floatingStyles, context, getFloatingProps, popoverId } =
    usePopoverContext("Content");

  if (!isOpen) return null;

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false}>
        <div
          ref={refs.setFloating}
          id={popoverId}
          style={{ ...floatingStyles, ...style }}
          className={cn(popoverContentVariants(), className)}
          {...getFloatingProps()}
          {...props}
        >
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

// Close
interface PopoverCloseProps extends ComponentPropsWithoutRef<"button"> {}

function PopoverClose({ children, onClick, ...props }: PopoverCloseProps) {
  const { setIsOpen } = usePopoverContext("Close");

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    setIsOpen(false);
  };

  return (
    <button type="button" onClick={handleClick} {...props}>
      {children}
    </button>
  );
}

/**
 * Popover is a compound component for floating content triggered by click.
 *
 * @example
 * ```tsx
 * <Popover.Root open={open} onOpenChange={setOpen}>
 *   <Popover.Trigger>
 *     <Button>Open Popover</Button>
 *   </Popover.Trigger>
 *   <Popover.Content className="p-4 w-64">
 *     <p>Popover content</p>
 *     <Popover.Close>Close</Popover.Close>
 *   </Popover.Content>
 * </Popover.Root>
 * ```
 */
export const Popover = {
  Root: PopoverRoot,
  Trigger: PopoverTrigger,
  Content: PopoverContent,
  Close: PopoverClose,
};
