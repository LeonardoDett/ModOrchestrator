import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { toneData, type Tone } from "../../theme/tone";

const linearVariants = defineRecipe({
  base: "relative h-2 w-full overflow-hidden rounded-full bg-muted",
});

const circleTrackVariants = defineRecipe({
  base: "stroke-muted",
});

const circleFillVariants = defineRecipe({
  base: "stroke-tone transition-[stroke-dashoffset] duration-normal ease-default",
});

interface ProgressRootProps extends ComponentPropsWithoutRef<"div"> {
  /** Current value */
  value?: number;
  /** Maximum value */
  max?: number;
  tone?: Tone;
}

function clampPercent(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/**
 * Progress.Root is a linear progress bar.
 *
 * @example
 * ```tsx
 * <Progress.Root value={40} />
 * ```
 */
function ProgressRoot({
  value = 0,
  max = 100,
  tone,
  className,
  ...props
}: ProgressRootProps) {
  const percent = clampPercent(value, max);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(linearVariants(), className)}
      {...toneData(tone ?? "secondary")}
      {...props}
    >
      <div
        className="h-full rounded-full bg-tone"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

interface ProgressCircleProps extends ComponentPropsWithoutRef<"svg"> {
  /** Current value */
  value?: number;
  /** Maximum value */
  max?: number;
  /** Diameter in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  tone?: Tone;
}

/**
 * Progress.Circle is a circular progress indicator.
 */
function ProgressCircle({
  value = 0,
  max = 100,
  size = 64,
  strokeWidth = 6,
  tone,
  className,
  ...props
}: ProgressCircleProps) {
  const percent = clampPercent(value, max);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("-rotate-90", className)}
      {...toneData(tone ?? "secondary")}
      {...props}
    >
      <circle
        className={circleTrackVariants()}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
      />
      <circle
        className={circleFillVariants()}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export const Progress = {
  Root: ProgressRoot,
  Circle: ProgressCircle,
};
