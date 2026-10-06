import type { MotionLevel, MotionSpec, MotionTune } from "./types";

export const MOTION_LEVELS: readonly MotionLevel[] = ["calm", "responsive", "expressive"];

export const MOTION_DEFAULTS: Record<MotionLevel, MotionSpec> = {
  calm: { stiffness: 400, damping: 40, mass: 1, duration: 160, amplitude: 0.45, pressScale: 0.985, stagger: 20 },
  responsive: { stiffness: 300, damping: 22, mass: 1, duration: 280, amplitude: 1, pressScale: 0.96, stagger: 35 },
  expressive: { stiffness: 260, damping: 14, mass: 1, duration: 420, amplitude: 1.6, pressScale: 0.92, stagger: 50 },
};

type Pt = [number, number];

const DT = 1 / 600;
const REST_WINDOW = 0.05;
const MAX_SIM_SECONDS = 10;
const SAMPLES = 120;

function simulate(
  { stiffness: k, damping: d, mass: m }: Pick<MotionSpec, "stiffness" | "damping" | "mass">,
  tolerance: number,
): { restTime: number; overshoot: number; sample: (t: number) => number } {
  const steps = Math.round(MAX_SIM_SECONDS / DT);
  const xs: number[] = [0];
  let x = 0;
  let v = 0;
  let max = 0;
  let restSince = -1;
  let restTime = MAX_SIM_SECONDS;
  for (let i = 1; i <= steps; i++) {
    v += ((-k * (x - 1) - d * v) / m) * DT;
    x += v * DT;
    xs.push(x);
    if (x > max) max = x;
    if (Math.abs(x - 1) < tolerance && Math.abs(v) < tolerance) {
      if (restSince < 0) restSince = i * DT;
      if (i * DT - restSince >= REST_WINDOW) {
        restTime = restSince;
        break;
      }
    } else restSince = -1;
  }
  const sample = (t: number) => {
    const f = Math.min(Math.max(t / DT, 0), xs.length - 1);
    const i = Math.floor(f);
    const a = xs[i]!;
    const b = xs[Math.min(i + 1, xs.length - 1)]!;
    return a + (b - a) * (f - i);
  };
  return { restTime, overshoot: Math.max(0, max - 1), sample };
}

function perpDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Ramer–Douglas–Peucker; devolve os índices mantidos, em ordem. */
function rdp(pts: Pt[], epsilon: number): number[] {
  const keep = new Set<number>([0, pts.length - 1]);
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const dist = perpDistance(pts[i]!, pts[s]!, pts[e]!);
      if (dist > worst) {
        worst = dist;
        idx = i;
      }
    }
    if (idx >= 0 && worst > epsilon) {
      keep.add(idx);
      stack.push([s, idx], [idx, e]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

function fmt(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  const trimmed = s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  return trimmed === "-0" ? "0" : trimmed;
}

/** Posições que o CSS inferiria (distribuição uniforme entre âncoras) vs. as reais. */
function explicitPositions(pos: number[]): boolean[] {
  const n = pos.length;
  const explicit = pos.map((_, j) => j === 0 || j === n - 1);
  const EPS = 1e-4;
  for (let changed = true; changed; ) {
    changed = false;
    let a = 0;
    for (let j = 1; j < n; j++) {
      if (!explicit[j]) continue;
      for (let i = a + 1; i < j; i++) {
        const pa = pos[a]!;
        const inferred = pa + ((pos[j]! - pa) * (i - a)) / (j - a);
        if (Math.abs(inferred - pos[i]!) > EPS) {
          explicit[i] = true;
          changed = true;
        }
      }
      a = j;
    }
  }
  return explicit;
}

export function springToLinear(
  spring: Pick<MotionSpec, "stiffness" | "damping" | "mass">,
  opts: { maxPoints?: number; tolerance?: number } = {},
): { easing: string; duration: number; overshoot: number } {
  const maxPoints = Math.max(3, opts.maxPoints ?? 48);
  const tolerance = opts.tolerance ?? 0.001;
  const { restTime, overshoot, sample } = simulate(spring, tolerance);

  const all: Pt[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const u = i / (SAMPLES - 1);
    all.push([u, i === 0 ? 0 : i === SAMPLES - 1 ? 1 : sample(u * restTime)]);
  }

  let epsilon = 0.0005;
  let kept = rdp(all, epsilon);
  while (kept.length > maxPoints) {
    epsilon *= 1.3;
    kept = rdp(all, epsilon);
  }

  const values = kept.map((i) => Number(fmt(all[i]![1], 4)));
  const pos = kept.map((i) => all[i]![0]);
  const explicit = explicitPositions(pos);
  const parts = values.map((val, j) => {
    const v = fmt(val, 4);
    return explicit[j] && j !== 0 && j !== values.length - 1 ? `${v} ${fmt(pos[j]! * 100, 2)}%` : v;
  });

  return {
    easing: `linear(${parts.join(", ")})`,
    duration: Math.round(restTime * 1000),
    overshoot,
  };
}

const LIMITS: Record<keyof MotionSpec, [number, number]> = {
  stiffness: [1, Infinity],
  damping: [1, Infinity],
  mass: [0.1, Infinity],
  duration: [0, Infinity],
  amplitude: [0, Infinity],
  pressScale: [0.8, 1],
  stagger: [0, Infinity],
};

export function validateMotionSpec(partial: Partial<MotionSpec>, mode: "dev" | "prod"): Partial<MotionSpec> {
  const out: Partial<MotionSpec> = {};
  for (const key of Object.keys(partial) as (keyof MotionSpec)[]) {
    const value = partial[key];
    const limits = LIMITS[key];
    if (value === undefined || !limits) continue;
    const [lo, hi] = limits;
    const ok = Number.isFinite(value) && value >= lo && value <= hi;
    if (ok) out[key] = value;
    else if (mode === "dev") {
      const range = hi === Infinity ? `>= ${lo}` : `in [${lo}, ${hi}]`;
      throw new Error(`Invalid motion spec: ${key}=${value} (must be ${range})`);
    } else out[key] = Number.isNaN(value) ? lo : Math.min(Math.max(value, lo), hi);
  }
  return out;
}

export function resolveMotionSpecs(ceiling: MotionLevel, tune: MotionTune = {}): Record<MotionLevel, MotionSpec> {
  const tuned = {} as Record<MotionLevel, MotionSpec>;
  for (const level of MOTION_LEVELS) tuned[level] = { ...MOTION_DEFAULTS[level], ...tune[level] };
  const cap = MOTION_LEVELS.indexOf(ceiling);
  const out = {} as Record<MotionLevel, MotionSpec>;
  MOTION_LEVELS.forEach((level, i) => {
    out[level] = { ...tuned[i > cap ? ceiling : level] };
  });
  return out;
}

export function motionVars(specs: Record<MotionLevel, MotionSpec>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const level of MOTION_LEVELS) {
    const s = specs[level];
    const spring = springToLinear(s);
    vars[`motion-${level}-ease`] = spring.easing;
    vars[`motion-${level}-spring-duration`] = `${spring.duration}ms`;
    vars[`motion-${level}-duration`] = `${s.duration}ms`;
    vars[`motion-${level}-amp`] = String(s.amplitude);
    vars[`motion-${level}-press`] = String(s.pressScale);
    vars[`motion-${level}-stagger`] = `${s.stagger}ms`;
  }
  return vars;
}
