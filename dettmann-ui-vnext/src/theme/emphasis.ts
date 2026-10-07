import type { Emphasis, Intent, MotionLevel } from "./engine";

export const INTENTS: readonly Intent[] = ["neutral", "brand", "accent", "info", "success", "warning", "danger"];
export const EMPHASES: readonly Emphasis[] = ["low", "medium", "high"];

export const EMPHASIS_MOTION: Record<Emphasis, MotionLevel> = { low: "calm", medium: "responsive", high: "expressive" };

export interface EmphasisInput {
  emphasis?: Emphasis;
  intent?: Intent;
  motion?: MotionLevel;
}

export interface EmphasisResolution {
  emphasis: Emphasis;
  intent: Intent;
  motion: MotionLevel;
  className: string;
  attrs: { "data-intent": Intent; "data-layer": Emphasis; "data-motion": MotionLevel };
}

const NEUTRAL: Record<Emphasis, string> = {
  high: "bg-fg text-canvas hover:opacity-90",
  medium: "bg-fill-neutral text-fg hover:bg-fill-neutral-hover",
  low: "bg-transparent text-fg hover:bg-state-hover active:bg-state-pressed",
};

const COLORED: Record<Emphasis, string> = {
  high: "bg-intent-fill text-on-intent hover:bg-intent-fill-hover active:bg-intent-fill-pressed",
  medium: "bg-intent-subtle text-intent-text hover:bg-state-hover",
  low: "bg-transparent text-intent-text hover:bg-state-hover active:bg-state-pressed",
};

/** Resolve (emphasis, intent, motion) em classes e atributos; única fonte da tabela para os componentes. */
export function resolveEmphasis(
  input: EmphasisInput,
  defaults: { emphasis?: Emphasis; intent?: Intent } = {},
): EmphasisResolution {
  const emphasis = input.emphasis ?? defaults.emphasis ?? "medium";
  const intent = input.intent ?? defaults.intent ?? (emphasis === "high" ? "brand" : "neutral");
  const motion = input.motion ?? EMPHASIS_MOTION[emphasis];
  const className = (intent === "neutral" ? NEUTRAL : COLORED)[emphasis];
  return { emphasis, intent, motion, className, attrs: { "data-intent": intent, "data-layer": emphasis, "data-motion": motion } };
}

/** `data-intent` só quando há intent explícito (escopa os tokens `intent-*` sem forçar neutral). */
export function intentData(intent?: Intent): { "data-intent"?: Intent } {
  return intent === undefined ? {} : { "data-intent": intent };
}
