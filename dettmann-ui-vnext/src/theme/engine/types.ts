/** Cor em OKLCH: l 0..1, c >= 0, h 0..360 (0 quando acromático). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Intensidade de movimento; a ordem de `MOTION_LEVELS` é a ordem de intensidade. */
export type MotionLevel = "calm" | "responsive" | "expressive";

export interface MotionSpec {
  stiffness: number;
  damping: number;
  mass: number;
  /** Duração de transições não-mola, em ms. */
  duration: number;
  amplitude: number;
  pressScale: number;
  /** Atraso entre itens de uma sequência, em ms. */
  stagger: number;
}

export type MotionTune = Partial<Record<MotionLevel, Partial<MotionSpec>>>;
