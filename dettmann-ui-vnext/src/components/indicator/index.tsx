import { type ComponentPropsWithoutRef, type ComponentType, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";

const indicatorVariants = defineRecipe({
  base: "inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium tabular-nums",
  variants: {
    paint: {
      tinted: "text-intent-text",
      neutral: "text-fg-muted",
      subtle: "text-fg-subtle",
    },
    size: {
      sm: "text-xs",
      md: "text-sm",
    },
  },
  defaultVariants: { paint: "neutral", size: "sm" },
});

const ICON_SIZE = { sm: "h-3.5 w-3.5", md: "h-4 w-4" } as const;

export interface IndicatorProps extends Omit<ComponentPropsWithoutRef<"span">, "children" | "role"> {
  /**
   * `icon` (padrão): ícone + contagem para células densas, com nome acessível.
   * `chip`: ícone, valor em destaque e rótulo visíveis dentro de um chip com borda
   * ("142 de 380 ativos"), para cabeçalhos de página. O texto é lido como está.
   */
  variant?: "icon" | "chip";
  /** Valor em destaque da variação `chip` (padrão: `count`). */
  value?: ReactNode;
  /** Icon that carries the meaning (never color alone). */
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Accessible name and tooltip text ("3 problems", "Wins 12 files"). */
  label: string;
  /** Optional count shown next to the icon. */
  count?: number;
  /** Semantic intent; "neutral" and "subtle" use foreground roles. */
  intent?: Intent | "subtle";
  size?: "sm" | "md";
}

/**
 * Indicator is a compact icon + optional count for dense table cells
 * (conflicts, dependencies, problems). It is an image with an accessible
 * name, so screen readers read the label instead of a bare number.
 *
 * @example
 * ```tsx
 * <Indicator icon={AlertTriangle} intent="warning" count={3} label="3 problems" />
 * <Indicator variant="chip" icon={Package} value="142" label="de 380 ativos" />
 * ```
 */
export function Indicator({
  icon: Icon,
  label,
  count,
  intent = "neutral",
  size = "sm",
  variant = "icon",
  value,
  className,
  title,
  ...props
}: IndicatorProps) {
  const chromatic = intent !== "neutral" && intent !== "subtle";
  if (variant === "chip") {
    const shown = value ?? count;
    return (
      <span
        data-slot="indicator-chip"
        title={title}
        className={cn(
          "inline-flex h-control-sm shrink-0 items-center gap-2 whitespace-nowrap rounded-control border border-border bg-surface px-2.5 text-xs text-fg-muted tabular-nums",
          className,
        )}
        {...props}
      >
        <span className={cn("inline-flex", chromatic ? "text-intent-text" : "text-fg-muted")} {...intentData(chromatic ? intent : undefined)}>
          <Icon aria-hidden="true" className={ICON_SIZE.md} />
        </span>
        {shown !== undefined ? <span className="font-semibold text-fg">{shown}</span> : null}
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={label}
      title={title ?? label}
      className={cn(indicatorVariants({ paint: chromatic ? "tinted" : intent, size }), className)}
      {...intentData(chromatic ? intent : undefined)}
      {...props}
    >
      <Icon aria-hidden="true" className={ICON_SIZE[size]} />
      {count !== undefined ? <span aria-hidden="true">{count}</span> : null}
    </span>
  );
}
