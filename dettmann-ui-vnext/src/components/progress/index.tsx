import { type ComponentPropsWithoutRef } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { intentData } from "../../theme/emphasis";
import { CATEGORY_COLORS, type CategoryColor } from "../../theme/engine/categories";
import type { Intent } from "../../theme/engine";

const linearVariants = defineRecipe({
  base: "relative h-2 w-full overflow-hidden rounded-pill bg-sunken",
});

const circleTrackVariants = defineRecipe({
  base: "stroke-sunken",
});

const circleFillVariants = defineRecipe({
  base: "stroke-intent-fill transition-[stroke-dashoffset] duration-(--motion-duration) ease-(--motion-ease)",
});

interface ProgressRootProps extends ComponentPropsWithoutRef<"div"> {
  /** Current value */
  value?: number;
  /** Maximum value */
  max?: number;
  intent?: Intent;
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
  intent,
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
      {...intentData(intent ?? "brand")}
      {...props}
    >
      <div
        className="h-full rounded-pill bg-intent-fill transition-[width] duration-(--motion-duration) ease-(--motion-ease)"
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
  intent?: Intent;
}

/**
 * Progress.Circle is a circular progress indicator.
 */
function ProgressCircle({
  value = 0,
  max = 100,
  size = 64,
  strokeWidth = 6,
  intent,
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
      {...intentData(intent ?? "brand")}
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

export interface ProgressSegment {
  value: number;
  /** Rótulo da parte (lido no nome acessível e na legenda). */
  label: string;
  /** Cor da paleta categórica; sem ela, a cor segue a ordem de `CATEGORY_COLORS`. */
  color?: CategoryColor;
}

interface ProgressStackedProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  segments: readonly ProgressSegment[];
  /** Total da barra; padrão a soma das partes. */
  max?: number;
  /** Prefixo do nome acessível ("Arquivos por tipo"). */
  label: string;
  /** Mostra a legenda (ponto, rótulo e valor) abaixo da barra. */
  legend?: boolean;
  /** Texto do valor na legenda e no nome acessível; padrão o número como está. */
  formatValue?: (value: number) => string;
}

/**
 * Progress.Stacked is a proportion bar split in labelled parts (files by type, disk use).
 * It is an image with the whole breakdown as accessible name; colors come from the
 * category palette, never status intents.
 *
 * @example
 * ```tsx
 * <Progress.Stacked label="Arquivos por tipo" legend
 *   segments={[{ label: ".dds", value: 742 }, { label: ".nif", value: 418 }, { label: "outros", value: 44 }]} />
 * ```
 */
function ProgressStacked({
  segments,
  max,
  label,
  legend = false,
  formatValue = String,
  className,
  ...props
}: ProgressStackedProps) {
  const total = max ?? segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const colored = segments.map((s, i) => ({ ...s, color: s.color ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]! }));
  const name = `${label}: ${colored.map((s) => `${s.label} ${formatValue(s.value)}`).join(", ")}`;
  return (
    <div className={cn("flex w-full flex-col gap-2", className)} {...props}>
      <div role="img" aria-label={name} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-pill bg-sunken">
        {colored.map((s) =>
          s.value > 0 ? (
            <span
              key={s.label}
              data-category={s.color}
              className="h-full bg-intent-fill"
              style={{ width: `${clampPercent(s.value, total)}%` }}
            />
          ) : null,
        )}
      </div>
      {legend ? (
        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          {colored.map((s) => (
            <li key={s.label} className="inline-flex items-center gap-1.5">
              <span data-category={s.color} className="size-2 rounded-pill bg-intent-fill" />
              <span className="font-medium text-fg">{s.label}</span>
              <span className="tabular-nums">{formatValue(s.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const Progress = {
  Root: ProgressRoot,
  Circle: ProgressCircle,
  Stacked: ProgressStacked,
};
