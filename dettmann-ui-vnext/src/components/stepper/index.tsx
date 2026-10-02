"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { defineRecipe } from "../../core/recipe";
import { Check } from "lucide-react";
import { cn } from "../../utils/cn";
import { Icon } from "../../primitives/icon";
import { Divider } from "../../primitives/divider";
import { useControllableState } from "../../hooks/use-controllable-state";
import { createStrictContext } from "../../utils/create-strict-context";

type StepperOrientation = "horizontal" | "vertical";
type StepStatus = "completed" | "current" | "upcoming";

interface StepperContextValue {
  value: number;
  onChange: (index: number) => void;
  orientation: StepperOrientation;
  interactive: boolean;
}

const [StepperProvider, useStepperContext] =
  createStrictContext<StepperContextValue>("Stepper");

interface StepContextValue {
  index: number;
  status: StepStatus;
}

const [StepProvider, useStepContext] =
  createStrictContext<StepContextValue>("Stepper.Step");

const rootVariants = defineRecipe({
  base: "flex",
  variants: {
    orientation: {
      horizontal: "flex-row items-start",
      vertical: "flex-col",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

interface StepperRootProps extends Omit<ComponentPropsWithoutRef<"div">, "defaultValue"> {
  children: ReactNode;
  /** Controlled active step index (0-based) */
  value?: number;
  /** Uncontrolled initial step index */
  defaultValue?: number;
  /** Called when the active step changes */
  onValueChange?: (value: number) => void;
  /** Layout direction */
  orientation?: StepperOrientation;
  /** Allow clicking a step to activate it */
  interactive?: boolean;
}

/**
 * Stepper.Root holds the active step index and orientation.
 */
function StepperRoot({
  children,
  className,
  value: controlledValue,
  defaultValue = 0,
  onValueChange,
  orientation = "horizontal",
  interactive = false,
  ...props
}: StepperRootProps) {
  const [value, setValue] = useControllableState({
    value: controlledValue,
    defaultValue,
    onChange: onValueChange,
  });

  return (
    <StepperProvider
      value={{
        value,
        onChange: setValue,
        orientation,
        interactive,
      }}
    >
      <div
        className={cn(rootVariants({ orientation }), className)}
        {...props}
      >
        {Children.map(children, (child, i) => {
          if (!isValidElement<{ isLast?: boolean }>(child)) return child;
          return cloneElement(child, {
            isLast: i === Children.count(children) - 1,
          });
        })}
      </div>
    </StepperProvider>
  );
}

const stepVariants = defineRecipe({
  base: "flex",
  variants: {
    orientation: {
      horizontal: "flex-1 flex-col items-center gap-2",
      vertical: "flex-row items-start gap-3",
    },
    interactive: {
      true: "cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
      false: "",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    interactive: false,
  },
});

interface StepperStepProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** 0-based index of this step */
  index: number;
  /** Hide the connector after this step (set by Root) */
  isLast?: boolean;
  /** In an interactive stepper, a step that cannot be chosen yet */
  disabled?: boolean;
}

/**
 * Stepper.Step is a single step. Pass `index` matching its position.
 */
function StepperStep({
  index,
  isLast = false,
  disabled = false,
  className,
  children,
  onClick,
  onKeyDown,
  ...props
}: StepperStepProps) {
  const { value, onChange, orientation, interactive } = useStepperContext("Step");

  const status: StepStatus =
    index < value ? "completed" : index === value ? "current" : "upcoming";

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    onClick?.(event);
    if (interactive && !disabled) onChange(index);
  };

  // An interactive step is a button for the keyboard and assistive tech.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (!interactive || disabled || event.defaultPrevented) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(index);
    }
  };
  const a11y = interactive
    ? {
        role: "button",
        tabIndex: disabled ? -1 : 0,
        "aria-disabled": disabled || undefined,
        "aria-current": status === "current" ? ("step" as const) : undefined,
      }
    : { "aria-current": status === "current" ? ("step" as const) : undefined };

  return (
    <StepProvider value={{ index, status }}>
      <div
        className={cn(
          stepVariants({ orientation, interactive }),
          !isLast && orientation === "horizontal" && "relative",
          className
        )}
        data-status={status}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...a11y}
        {...props}
      >
        {children}
        {!isLast && (
          <Divider
            decorative
            orientation={orientation === "horizontal" ? "horizontal" : "vertical"}
            color={status === "completed" ? "secondary" : "border"}
            className={cn(
              orientation === "horizontal" &&
                "absolute left-[calc(50%+1rem)] right-[calc(-50%+1rem)] top-4 h-px w-auto",
              orientation === "vertical" && "ml-4 h-8 w-px self-stretch"
            )}
          />
        )}
      </div>
    </StepProvider>
  );
}

const indicatorVariants = defineRecipe({
  base: [
    "relative z-base flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
    "text-sm font-medium border-2 transition-colors duration-fast",
  ].join(" "),
  variants: {
    status: {
      completed: "bg-secondary border-secondary text-on-secondary",
      current: "bg-secondary border-secondary text-on-secondary",
      upcoming: "bg-surface border-border text-fg-muted",
    },
  },
  defaultVariants: {
    status: "upcoming",
  },
});

interface StepperStepIndicatorProps extends ComponentPropsWithoutRef<"div"> {}

/**
 * Stepper.StepIndicator is the circle/check for a step.
 * Defaults to the step number, or a check when completed.
 */
function StepperStepIndicator({ className, children, ...props }: StepperStepIndicatorProps) {
  const { index, status } = useStepContext("StepIndicator");

  return (
    <div
      className={cn(indicatorVariants({ status }), className)}
      aria-hidden={children ? undefined : true}
      {...props}
    >
      {children ??
        (status === "completed" ? (
          <Icon icon={Check} size="sm" />
        ) : (
          index + 1
        ))}
    </div>
  );
}

const labelVariants = defineRecipe({
  base: "text-sm text-center",
  variants: {
    status: {
      completed: "text-secondary-text font-medium",
      current: "text-secondary-text font-medium",
      upcoming: "text-fg-muted",
    },
    orientation: {
      horizontal: "",
      vertical: "text-left pt-1",
    },
  },
  defaultVariants: {
    status: "upcoming",
    orientation: "horizontal",
  },
});

interface StepperStepLabelProps extends ComponentPropsWithoutRef<"span"> {
  children: ReactNode;
}

/**
 * Stepper.StepLabel is the text under/beside the indicator.
 */
function StepperStepLabel({ className, children, ...props }: StepperStepLabelProps) {
  const { status } = useStepContext("StepLabel");
  const { orientation } = useStepperContext("StepLabel");

  return (
    <span className={cn(labelVariants({ status, orientation }), className)} {...props}>
      {children}
    </span>
  );
}

/**
 * Stepper shows a sequence of steps with horizontal or vertical orientation.
 *
 * @example
 * ```tsx
 * <Stepper.Root value={1} orientation="horizontal">
 *   <Stepper.Step index={0}>
 *     <Stepper.StepIndicator />
 *     <Stepper.StepLabel>Account</Stepper.StepLabel>
 *   </Stepper.Step>
 *   <Stepper.Step index={1}>
 *     <Stepper.StepIndicator />
 *     <Stepper.StepLabel>Details</Stepper.StepLabel>
 *   </Stepper.Step>
 * </Stepper.Root>
 * ```
 */
export const Stepper = {
  Root: StepperRoot,
  Step: StepperStep,
  StepIndicator: StepperStepIndicator,
  StepLabel: StepperStepLabel,
};
