"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { BanIcon } from "../../icons/glyphs/ban";
import { CheckIcon } from "../../icons/glyphs/check";
import { MinusIcon } from "../../icons/glyphs/minus";
import type { AnimatedIconComponent } from "../../icons/types";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Loader } from "../loader";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";

const focusRing =
  "focus-ring";

export type StatusToggleState = "on" | "off" | "unavailable" | "busy";

const statusToggleVariants = defineRecipe({
  slots: {
    track: [
      "relative inline-flex shrink-0 items-center rounded-pill p-0.5",
      "motion-transition",
      focusRing,
    ].join(" "),
    thumb: [
      "pointer-events-none flex shrink-0 items-center justify-center rounded-pill border",
      "transition-transform duration-(--motion-duration) ease-(--motion-ease)",
    ].join(" "),
    icon: "",
  },
  variants: {
    state: {
      on: { track: "bg-intent-fill cursor-pointer", thumb: "bg-surface border-border", icon: "text-intent-text" },
      off: { track: "bg-border-strong cursor-pointer", thumb: "bg-surface border-border", icon: "text-fg-muted" },
      unavailable: { track: "cursor-not-allowed border border-dashed border-border-strong bg-sunken", thumb: "bg-sunken border-transparent", icon: "text-fg-subtle" },
      busy: { track: "cursor-progress bg-sunken", thumb: "bg-surface border-border", icon: "text-fg-muted" },
    },
    size: {
      sm: { track: "h-5 w-9", thumb: "h-4 w-4", icon: "h-3! w-3!" },
      md: { track: "h-6 w-11", thumb: "h-5 w-5", icon: "h-3.5! w-3.5!" },
    },
  },
  defaultVariants: { state: "off", size: "sm" },
});

const ICONS: Record<Exclude<StatusToggleState, "busy">, AnimatedIconComponent> = { on: CheckIcon, off: MinusIcon, unavailable: BanIcon };

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
  /** Intent of the "on" track (default brand). */
  intent?: Intent;
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
  { state, onCheckedChange, label, stateLabels, size = "sm", intent = "brand", className, disabled, title, ...props },
  ref,
) {
  const descriptionId = useId();
  const interactive = (state === "on" || state === "off") && !disabled;
  const { track, thumb, icon } = statusToggleVariants({ state, size });
  const Icon = state === "busy" ? null : ICONS[state];
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
      {...intentData(intent)}
      {...props}
    >
      <span className={cn(thumb(), state === "on" && SHIFT[size])}>
        {state === "busy" ? (
          <Loader size="xs" decorative className={icon()} />
        ) : (
          Icon && <Icon size="xs" strokeWidth={2} className={icon()} />
        )}
      </span>
      <span id={descriptionId} className="sr-only">
        {stateLabels[state]}
      </span>
    </button>
  );
});
