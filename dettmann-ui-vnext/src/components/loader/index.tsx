"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { animateLoop, readMotion, type MotionValues } from "../../motion";
import { ICON_STROKE } from "../../primitives/icon";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";
import { cn } from "../../utils/cn";

export type LoaderVariant = "arc" | "dots" | "pulse" | "bars";
export type LoaderSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface LoaderProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  /** Forma da animação. */
  variant?: LoaderVariant;
  size?: LoaderSize;
  /** Cor semântica: pinta com `text-intent-fill` e escopa `data-intent`. */
  intent?: Intent;
  /** Texto para leitores de tela. */
  label?: string;
}

const SIZE: Record<LoaderSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

const STROKE: Record<LoaderSize, number> = ICON_STROKE;

/** Períodos por variante: dado da técnica, não do tema. */
const PERIOD = { arc: 1000, dots: 900, pulse: 1600, bars: 1000 } as const;

/** Curva de cada segmento dos loops de ida-e-volta (o timing de `animateLoop` é linear). */
const EASE = "ease-in-out";

const ORIGIN: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
const DOT_X = [5, 12, 19] as const;
const BAR_X = [4.5, 9.5, 14.5, 19.5] as const;

type Loop = (el: Element, index: number, m: MotionValues) => Array<Animation | null>;

const LOOPS: Record<LoaderVariant, Loop> = {
  arc: (el) => [
    animateLoop(el, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { period: PERIOD.arc }),
    animateLoop(
      el,
      [{ strokeDasharray: "14 43" }, { strokeDasharray: "40 17" }, { strokeDasharray: "14 43" }],
      { period: PERIOD.arc },
    ),
  ],
  dots: (el, i, m) => [
    animateLoop(
      el,
      (v) => [
        { transform: "translateY(0px)", easing: EASE },
        { transform: `translateY(${-3 * v.amp}px)`, easing: EASE },
        { transform: "translateY(0px)" },
      ],
      { period: PERIOD.dots, delay: i * m.stagger },
    ),
  ],
  pulse: (el, i) => [
    animateLoop(
      el,
      (v) => {
        const peak = `scale(${1 + 0.25 * v.amp})`;
        // Dois círculos em contrafase: preenchimento -> anel (crossfade).
        const [from, to] = i === 0 ? [1, 0.2] : [0.2, 1];
        return [
          { transform: "scale(1)", opacity: from, easing: EASE },
          { transform: peak, opacity: to, easing: EASE },
          { transform: "scale(1)", opacity: from },
        ];
      },
      { period: PERIOD.pulse },
    ),
  ],
  bars: (el, i, m) => [
    animateLoop(
      el,
      [{ transform: "scaleY(0.4)" }, { transform: "scaleY(1)" }, { transform: "scaleY(0.4)" }],
      { period: PERIOD.bars, delay: i * m.stagger },
    ),
  ],
};

function Shapes({ variant }: { variant: LoaderVariant }) {
  switch (variant) {
    case "arc":
      return <circle data-loop cx="12" cy="12" r="9" strokeDasharray="14 43" style={ORIGIN} />;
    case "dots":
      return DOT_X.map((cx) => (
        <circle key={cx} data-loop cx={cx} cy="12" r="1.75" fill="currentColor" stroke="none" style={ORIGIN} />
      ));
    case "pulse":
      return (
        <>
          <circle data-loop cx="12" cy="12" r="5" fill="currentColor" stroke="none" style={ORIGIN} />
          <circle data-loop cx="12" cy="12" r="8" style={ORIGIN} />
        </>
      );
    case "bars":
      return BAR_X.map((x) => <line key={x} data-loop x1={x} y1="6" x2={x} y2="18" style={ORIGIN} />);
  }
}

/**
 * Loader é o indicador de carregamento animado. O movimento vem de
 * `animateLoop`: segue `data-motion` e vira pulso de opacidade sob redução de movimento.
 *
 * @example
 * ```tsx
 * <Loader />
 * <Loader variant="dots" intent="brand" size="lg" />
 * <Loader size="sm" label="Salvando" />
 * ```
 */
export function Loader({
  variant = "arc",
  size = "md",
  intent,
  label = "Loading",
  className,
  ...props
}: LoaderProps) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const m = readMotion(root);
    const animations = Array.from(root.querySelectorAll("[data-loop]")).flatMap((el, i) =>
      LOOPS[variant](el, i, m),
    );
    return () => {
      for (const a of animations) a?.cancel();
    };
  }, [variant]);

  return (
    <span
      ref={rootRef}
      role="status"
      aria-label={label}
      {...intentData(intent)}
      className={cn("inline-flex shrink-0", SIZE[size], intent && "text-intent-fill", className)}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE[size]}
        strokeLinecap="round"
        strokeLinejoin="round"
        overflow="visible"
      >
        <Shapes variant={variant} />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
