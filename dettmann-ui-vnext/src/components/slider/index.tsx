"use client";

import {
  useCallback,
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { toneData, type Tone } from "../../theme/tone";
import { useControllableState } from "../../hooks/use-controllable-state";
import { createStrictContext } from "../../utils/create-strict-context";

export type SliderValue = number | [number, number];

function isRangeValue(value: SliderValue): value is [number, number] {
  return Array.isArray(value);
}

function snap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (step <= 0) return clamped;
  const steps = Math.round((clamped - min) / step);
  return Math.min(max, Math.max(min, min + steps * step));
}

interface SliderContextValue {
  value: SliderValue;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  orientation: "horizontal" | "vertical";
  isRange: boolean;
  trackRef: RefObject<HTMLDivElement | null>;
  getPercent: (n: number) => number;
  setThumbValue: (index: number, next: number) => void;
  moveFromPointer: (clientX: number, clientY: number, thumbIndex?: number) => void;
}

const [SliderProvider, useSliderContext] =
  createStrictContext<SliderContextValue>("Slider");

const rootVariants = defineRecipe({
  base: "relative flex touch-none select-none",
  variants: {
    orientation: {
      horizontal: "w-full items-center py-2",
      vertical: "h-48 w-5 flex-col items-center px-2",
    },
    disabled: {
      true: "pointer-events-none text-fg-subtle",
      false: "",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    disabled: false,
  },
});

interface SliderRootProps<T extends SliderValue = number>
  extends Omit<ComponentPropsWithoutRef<"div">, "defaultValue" | "onChange"> {
  children: ReactNode;
  /** Controlled value (number or `[min, max]` for range) */
  value?: T;
  /** Uncontrolled initial value */
  defaultValue?: T;
  /** Called when the value changes */
  onValueChange?: (value: T) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Disable pointer and keyboard interaction */
  disabled?: boolean;
  /** Track orientation */
  orientation?: "horizontal" | "vertical";
  tone?: Tone;
}

/**
 * Slider.Root provides shared state for Track, Range, and Thumb.
 */
function SliderRoot<T extends SliderValue = number>({
  children,
  className,
  value: controlledValue,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  orientation = "horizontal",
  tone,
  ...props
}: SliderRootProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);

  const [value, setValue] = useControllableState<SliderValue>({
    value: controlledValue,
    defaultValue: defaultValue ?? (0 as T),
    onChange: onValueChange as ((value: SliderValue) => void) | undefined,
  });

  const isRange = isRangeValue(value);

  const getPercent = useCallback(
    (n: number) => {
      const span = max - min;
      if (span <= 0) return 0;
      return ((n - min) / span) * 100;
    },
    [min, max]
  );

  const setThumbValue = useCallback(
    (index: number, next: number) => {
      const snapped = snap(next, min, max, step);
      if (isRangeValue(value)) {
        const nextRange: [number, number] = [...value];
        if (index === 0) {
          nextRange[0] = Math.min(snapped, nextRange[1]);
        } else {
          nextRange[1] = Math.max(snapped, nextRange[0]);
        }
        setValue(nextRange);
      } else {
        setValue(snapped);
      }
    },
    [value, min, max, step, setValue]
  );

  const valueFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const rtl =
        getComputedStyle(track).direction === "rtl" && orientation === "horizontal";

      let percent: number;
      if (orientation === "vertical") {
        percent = 1 - (clientY - rect.top) / rect.height;
      } else {
        percent = (clientX - rect.left) / rect.width;
        if (rtl) percent = 1 - percent;
      }

      return snap(min + percent * (max - min), min, max, step);
    },
    [min, max, step, orientation]
  );

  const nearestThumb = useCallback(
    (next: number) => {
      if (!isRangeValue(value)) return 0;
      return Math.abs(next - value[0]) <= Math.abs(next - value[1]) ? 0 : 1;
    },
    [value]
  );

  const moveFromPointer = useCallback(
    (clientX: number, clientY: number, thumbIndex?: number) => {
      const next = valueFromPointer(clientX, clientY);
      const index = thumbIndex ?? nearestThumb(next);
      setThumbValue(index, next);
    },
    [valueFromPointer, nearestThumb, setThumbValue]
  );

  return (
    <SliderProvider
      value={{
        value,
        min,
        max,
        step,
        disabled,
        orientation,
        isRange,
        trackRef,
        getPercent,
        setThumbValue,
        moveFromPointer,
      }}
    >
      <div
        className={cn(rootVariants({ orientation, disabled }), className)}
        {...toneData(tone ?? "secondary")}
        {...props}
      >
        {children}
      </div>
    </SliderProvider>
  );
}

const trackVariants = defineRecipe({
  base: "relative grow rounded-full bg-muted",
  variants: {
    orientation: {
      horizontal: "h-2 w-full",
      vertical: "h-full w-2",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

interface SliderTrackProps extends ComponentPropsWithoutRef<"div"> {}

function SliderTrack({ className, onPointerDown, children, ...props }: SliderTrackProps) {
  const { orientation, disabled, trackRef, moveFromPointer } = useSliderContext("Track");

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveFromPointer(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveFromPointer(event.clientX, event.clientY);
  };

  return (
    <div
      ref={trackRef}
      className={cn(trackVariants({ orientation }), className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      {...props}
    >
      {children}
    </div>
  );
}

const rangeVariants = defineRecipe({
  base: "absolute rounded-full bg-tone",
  variants: {
    orientation: {
      horizontal: "h-full",
      vertical: "w-full",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

interface SliderRangeProps extends ComponentPropsWithoutRef<"div"> {}

function SliderRange({ className, style, ...props }: SliderRangeProps) {
  const { value, orientation, getPercent } = useSliderContext("Range");

  const start = isRangeValue(value) ? getPercent(value[0]) : 0;
  const end = isRangeValue(value) ? getPercent(value[1]) : getPercent(value);

  const rangeStyle =
    orientation === "vertical"
      ? { bottom: `${start}%`, height: `${end - start}%` }
      : { left: `${start}%`, width: `${end - start}%` };

  return (
    <div
      className={cn(rangeVariants({ orientation }), className)}
      style={{ ...rangeStyle, ...style }}
      {...props}
    />
  );
}

const thumbVariants = defineRecipe({
  base: [
    "absolute z-base block rounded-full bg-surface border border-border-strong shadow-xs",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page",
  ].join(" "),
  variants: {
    orientation: {
      horizontal: "h-5 w-5 top-1/2 -translate-y-1/2 -translate-x-1/2",
      vertical: "h-5 w-5 left-1/2 -translate-x-1/2 translate-y-1/2",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

type SliderThumbVariants = VariantProps<typeof thumbVariants>;

interface SliderThumbProps
  extends Omit<ComponentPropsWithoutRef<"span">, "onChange">,
    Omit<SliderThumbVariants, "orientation"> {
  /** Thumb index: `0` for single / start, `1` for range end */
  index?: number;
}

function SliderThumb({ className, index = 0, style, ...props }: SliderThumbProps) {
  const {
    value,
    min,
    max,
    step,
    disabled,
    orientation,
    getPercent,
    setThumbValue,
    moveFromPointer,
  } = useSliderContext("Thumb");

  const thumbValue = isRangeValue(value) ? value[index] ?? value[0] : value;

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;

    const rtl =
      getComputedStyle(event.currentTarget).direction === "rtl" &&
      orientation === "horizontal";

    const decrease = rtl ? ["ArrowRight", "ArrowDown"] : ["ArrowLeft", "ArrowDown"];
    const increase = rtl ? ["ArrowLeft", "ArrowUp"] : ["ArrowRight", "ArrowUp"];
    const large = step * 10;

    let next: number | null = null;

    if (decrease.includes(event.key)) next = thumbValue - step;
    else if (increase.includes(event.key)) next = thumbValue + step;
    else if (event.key === "PageDown") next = thumbValue - large;
    else if (event.key === "PageUp") next = thumbValue + large;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;

    if (next === null) return;
    event.preventDefault();
    setThumbValue(index, next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    moveFromPointer(event.clientX, event.clientY, index);
  };

  const handlePointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveFromPointer(event.clientX, event.clientY, index);
  };

  const percent = getPercent(thumbValue);
  const positionStyle =
    orientation === "vertical"
      ? { bottom: `${percent}%` }
      : { left: `${percent}%` };

  return (
    <span
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={thumbValue}
      aria-orientation={orientation}
      aria-disabled={disabled || undefined}
      className={cn(thumbVariants({ orientation }), className)}
      style={{ ...positionStyle, ...style }}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      {...props}
    />
  );
}

/**
 * Slider is a compound input for a numeric value or a two-thumb range.
 *
 * Single thumb: `value` / `onValueChange` are a `number`.
 * Range (two thumbs): pass a `[number, number]` tuple.
 *
 * @example
 * ```tsx
 * <Slider.Root value={40} onValueChange={setValue} min={0} max={100}>
 *   <Slider.Track>
 *     <Slider.Range />
 *   </Slider.Track>
 *   <Slider.Thumb />
 * </Slider.Root>
 *
 * <Slider.Root value={[20, 80]} onValueChange={setRange}>
 *   <Slider.Track>
 *     <Slider.Range />
 *   </Slider.Track>
 *   <Slider.Thumb index={0} />
 *   <Slider.Thumb index={1} />
 * </Slider.Root>
 * ```
 */
export const Slider = {
  Root: SliderRoot,
  Track: SliderTrack,
  Range: SliderRange,
  Thumb: SliderThumb,
};
