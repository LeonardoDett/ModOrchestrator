"use client";

import { type ComponentPropsWithoutRef, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { intentData } from "../../theme/emphasis";
import { Icon, type IconComponent } from "../../primitives/icon";
import { Skeleton } from "../../primitives/skeleton";
import type { Intent } from "../../theme/engine";

const tileVariants = defineRecipe({
  slots: {
    root: "flex min-w-0 flex-col items-start gap-0.5 rounded-card border border-border bg-surface text-left",
    label: "flex items-center gap-1.5 text-xs text-fg-muted",
    value: "flex items-baseline gap-1 font-semibold tabular-nums text-fg",
    unit: "text-xs font-medium text-fg-muted",
    description: "text-xs text-fg-subtle",
  },
  variants: {
    size: {
      sm: { root: "px-3 py-2", value: "text-sm" },
      md: { root: "px-3 py-2.5", value: "text-lg" },
    },
    interactive: {
      true: { root: "cursor-pointer motion-transition hover:state-layer-hover active:state-layer-pressed focus-ring" },
      false: {},
    },
  },
  defaultVariants: { size: "md", interactive: false },
});

interface StatTileBaseProps {
  /** Rótulo acima do valor ("Mods"). */
  label: ReactNode;
  /** Valor já formatado pelo consumidor ("142", "48 GB"). */
  value: ReactNode;
  /** Unidade ao lado do valor ("de 380"). */
  unit?: ReactNode;
  /** Linha de apoio abaixo ("210 mil arquivos"). */
  description?: ReactNode;
  icon?: IconComponent;
  /** Pinta o ícone e o valor (status ou destaque). */
  intent?: Intent;
  size?: "sm" | "md";
  /** Carregando: o valor vira um esqueleto. */
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
}

export interface StatTileProps extends StatTileBaseProps {
  /** Vira um link para a tela do número. */
  href?: string;
  /** Vira um botão. */
  onClick?: MouseEventHandler<HTMLElement>;
}

/**
 * StatTile is a small labelled number (KPI). It never formats numbers: the consumer
 * sends the localized text. With `href` or `onClick` the whole tile is the link/button.
 *
 * @example
 * ```tsx
 * <StatTile.Grid columns={4}>
 *   <StatTile label="Mods" value="142" unit="de 380" href="#/mods" />
 *   <StatTile label="Conflitos" value="38" description="pares de mods" intent="warning" icon={TriangleAlertIcon} />
 * </StatTile.Grid>
 * ```
 */
function StatTileRoot({ label, value, unit, description, icon, intent, size, loading = false, href, onClick, className, style }: StatTileProps) {
  const interactive = Boolean(href || onClick);
  const s = tileVariants({ size, interactive });
  const tinted = intent !== undefined && intent !== "neutral";
  const body = (
    <>
      <span className={s.label()}>
        {icon ? (
          <span className={cn("inline-flex", tinted ? "text-intent-text" : "text-fg-muted")}>
            <Icon icon={icon} size="xs" color="current" />
          </span>
        ) : null}
        {label}
      </span>
      <span className={cn(s.value(), tinted && "text-intent-text")}>
        {loading ? <Skeleton className="h-5 w-12" /> : value}
        {unit && !loading ? <span className={s.unit()}>{unit}</span> : null}
      </span>
      {description ? <span className={s.description()}>{description}</span> : null}
    </>
  );
  const common = { className: cn(s.root(), className), style, ...intentData(tinted ? intent : undefined) };
  if (href)
    return (
      <a href={href} onClick={onClick} {...common}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} {...common}>
        {body}
      </button>
    );
  return <div {...common}>{body}</div>;
}

interface StatTileGridProps extends ComponentPropsWithoutRef<"div"> {
  /** Colunas de largura igual. Padrão 4. */
  columns?: number;
}

function StatTileGrid({ columns = 4, className, style, ...props }: StatTileGridProps) {
  return (
    <div
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ...style }}
      {...props}
    />
  );
}

export const StatTile = Object.assign(StatTileRoot, { Grid: StatTileGrid });
