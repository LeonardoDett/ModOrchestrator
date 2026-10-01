"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { Ban, Check, Loader2, Minus, type LucideIcon } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { focusRing, toneData, type Tone } from "../../theme/tone";

export type StatusToggleState = "on" | "off" | "unavailable" | "busy";

const statusToggleVariants = defineRecipe({
  slots: {
    track: [
      "relative inline-flex shrink-0 items-center rounded-full p-0.5",
      "transition-colors duration-fast ease-default",
      focusRing,
    ].join(" "),
    thumb: [
      "pointer-events-none flex shrink-0 items-center justify-center rounded-full bg-surface shadow-xs",
      "transition-transform duration-fast ease-default",
    ].join(" "),
    icon: "",
  },
  variants: {
    state: {
      on: { track: "bg-tone cursor-pointer", icon: "text-tone-text" },
      off: { track: "bg-border-strong cursor-pointer", icon: "text-fg-muted" },
      unavailable: { track: "cursor-not-allowed border border-dashed border-border-strong bg-muted", thumb: "bg-muted shadow-none", icon: "text-fg-subtle" },
      busy: { track: "cursor-progress bg-muted", icon: "animate-spin text-fg-muted" },
    },
    size: {
      sm: { track: "h-5 w-9", thumb: "h-4 w-4", icon: "h-3 w-3" },
      md: { track: "h-6 w-11", thumb: "h-5 w-5", icon: "h-3.5 w-3.5" },
    },
  },
  defaultVariants: { state: "off", size: "sm" },
});

const ICONS: Record<StatusToggleState, LucideIcon> = { on: Check, off: Minus, unavailable: Ban, busy: Loader2 };

const SHIFT: Record<"sm" | "md", string> = { sm: "translate-x-4", md: "translate-x-5" };

export interface StatusToggleProps
  extends Omit<ComponentPropsWithoutRef<"button">, "type" | "role" | "onClick" | "children" | "aria-checked"> {
  /** on/off are interactive; unavailable and busy are not. */
  state: StatusToggleState;
  /** Called with the requested state when an on/off toggle is activated. */
  onCheckedChange?: (next: boolean) => void;
  /** Accessible name of the switch, usually the row item ("Enable SkyUI"). */
  label: string;
  /** Description of each state, read by assistive tech and shown as title. */
  stateLabels: Record<StatusToggleState, string>;
  size?: "sm" | "md";
  /** Tone of the "on" track (default primary). */
  tone?: Tone;
}

/**
 * StatusToggle is a compact switch for table cells with four states: on,
 * off, unavailable (cannot be toggled, e.g. not installed) and busy (an
 * operation is running). The state is never conveyed by color alone: the
 * thumb carries an icon and the state label is exposed as description.
 *
 * @example
 * ```tsx
 * <StatusToggle state="on" label="SkyUI" stateLabels={labels} onCheckedChange={setEnabled} />
 * ```
 */
export const StatusToggle = forwardRef<HTMLButtonElement, StatusToggleProps>(function StatusToggle(
  { state, onCheckedChange, label, stateLabels, size = "sm", tone = "primary", className, disabled, title, ...props },
  ref,
) {
  const descriptionId = useId();
  const interactive = (state === "on" || state === "off") && !disabled;
  const { track, thumb, icon } = statusToggleVariants({ state, size });
  const Icon = ICONS[state];
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={state === "on"}
      aria-label={label}
      aria-describedby={descriptionId}
      aria-busy={state === "busy" || undefined}
      aria-disabled={!interactive || undefined}
      data-state={state}
      title={title ?? stateLabels[state]}
      className={cn(track(), className)}
      onClick={() => {
        if (interactive) onCheckedChange?.(state !== "on");
      }}
      {...toneData(tone)}
      {...props}
    >
      <span className={cn(thumb(), state === "on" && SHIFT[size])}>
        <Icon aria-hidden="true" className={icon()} />
      </span>
      <span id={descriptionId} className="sr-only">
        {stateLabels[state]}
      </span>
    </button>
  );
});
