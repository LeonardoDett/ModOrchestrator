"use client";

import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  type ComponentPropsWithoutRef,
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
} from "@floating-ui/react";
import { format as formatDate } from "date-fns";
import { useDatePickerContext } from "./date-picker.context";
import { DatePickerPanel } from "./date-picker.panel";

interface DatePickerPopoverProps {
  children: ReactNode;
  /** Panel content (defaults to DatePicker.Panel) */
  panel?: ReactNode;
}

/**
 * DatePicker.Popover wraps Trigger and Panel with floating-ui positioning.
 * This is a convenience wrapper that handles the floating context.
 *
 * @example
 * ```tsx
 * <DatePicker.Root value={date} onChange={setDate}>
 *   <DatePicker.Popover>
 *     <DatePicker.Trigger>
 *       <Button>{date ? format(date, "PP") : "Select date"}</Button>
 *     </DatePicker.Trigger>
 *   </DatePicker.Popover>
 * </DatePicker.Root>
 * ```
 */
export function DatePickerPopover({ children, panel }: DatePickerPopoverProps) {
  const { isOpen, setIsOpen, disabled } = useDatePickerContext("Popover");

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  return (
    <>
      {/* Clone children to inject refs and props */}
      {cloneElement(children as ReactElement<{ setReference?: (node: HTMLElement | null) => void; referenceProps?: Record<string, unknown> }>, {
        setReference: refs.setReference,
        referenceProps: getReferenceProps({ disabled }),
      })}

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
            >
              {panel ?? <DatePickerPanel />}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

// Re-export for convenience
export { DatePickerPanel };

// Input integration component
interface DatePickerInputProps
  extends Omit<ComponentPropsWithoutRef<"button">, "value" | "onChange"> {
  /** Placeholder text */
  placeholder?: string;
  /** Custom format function */
  formatFn?: (date: Date | null) => string;
}

/**
 * DatePicker.Input is a styled trigger that looks like an input field.
 * Prefer `DatePicker.Field` inside `Input.Root`/`Input.Box` for form usage.
 * Use this only when composing Root + Popover yourself.
 */
export function DatePickerInput({
  placeholder = "Selecione uma data...",
  formatFn,
  className,
  ...props
}: DatePickerInputProps & {
  setReference?: (node: HTMLButtonElement | null) => void;
  referenceProps?: Record<string, unknown>;
}) {
  const { value, isOpen, setIsOpen, disabled, format, locale } =
    useDatePickerContext("Input");

  const { setReference, referenceProps = {}, ...restProps } = props;

  const displayValue = formatFn
    ? formatFn(value)
    : value
    ? formatDate(value, format, locale ? { locale } : undefined)
    : "";

  const handleClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <button
      ref={setReference}
      type="button"
      disabled={disabled}
      onClick={handleClick}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      className={`
        flex w-full items-center justify-between
        px-3.5 py-2.5 text-sm text-left
        bg-transparent
        disabled:cursor-not-allowed
        ${className ?? ""}
      `}
      {...referenceProps}
      {...restProps}
    >
      <span className={displayValue ? "text-fg" : "text-fg-muted"}>
        {displayValue || placeholder}
      </span>
      <svg
        className="h-4 w-4 shrink-0 text-fg-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    </button>
  );
}
