import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { XIcon } from "../../icons/glyphs/x";
import { cn } from "../../utils/cn";
import { Button } from "../button";

export interface InspectorProps extends Omit<ComponentPropsWithoutRef<"aside">, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  sticky?: boolean;
  /** Renders a close button and closes on Escape. */
  onClose?: () => void;
  /** Accessible name of the close button. */
  closeLabel?: string;
}

/** Whether Escape belongs to something else: a field being edited, an open dialog or menu. */
function escapeIsTaken(event: KeyboardEvent) {
  if (event.defaultPrevented) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return true;
  return document.querySelector("[aria-modal='true'], [role='menu'], [aria-expanded='true'][aria-haspopup], [role='combobox'][aria-expanded='true']") !== null;
}

/**
 * Side panel with the details of the selected item. With `onClose`, Escape
 * closes it from anywhere on the page (the list it details usually has the
 * focus), unless a field, dialog or menu is using Escape.
 */
export function Inspector({ title, description, actions, children, sticky = true, onClose, closeLabel = "Close", className, ...props }: InspectorProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closable = onClose !== undefined;
  useEffect(() => {
    if (!closable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeIsTaken(event)) return;
      event.preventDefault();
      closeRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closable]);
  return (
    <aside className={cn("min-w-0 border-l border-border bg-raised", sticky && "sticky top-0 h-fit", className)} {...props}>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title ? <h2 className="truncate text-sm font-semibold text-fg">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
          </div>
          {actions}
          {onClose ? (
            <Button emphasis="low" size="icon-sm" aria-label={closeLabel} onClick={onClose}>
              <XIcon size="sm" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </aside>
  );
}
