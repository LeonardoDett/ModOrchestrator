export const TONES = [
  "primary",
  "secondary",
  "accent",
  "info",
  "success",
  "danger",
  "warning",
] as const;

export type Tone = (typeof TONES)[number];

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page";

export const disabledControl =
  "disabled:pointer-events-none disabled:bg-muted disabled:text-fg-subtle disabled:border-transparent";

export const toneSolid =
  "bg-tone text-on-tone hover:bg-tone-hover active:bg-tone-pressed";

export const toneSoft =
  "bg-tone-subtle text-tone-text border border-tone-border hover:bg-tone-subtle-hover";

export const toneOutline =
  "border border-tone-border bg-transparent text-tone-text hover:bg-tone-subtle";

export const toneGhost = "bg-transparent text-tone-text hover:bg-tone-subtle";

export const neutralOutline =
  "border border-border-strong bg-transparent text-fg hover:bg-hover active:bg-pressed";

export const neutralGhost =
  "bg-transparent text-fg hover:bg-hover active:bg-pressed";

export function toneData(tone?: Tone): { "data-tone"?: Tone } {
  return tone ? { "data-tone": tone } : {};
}

const CHROMATIC = new Set<string>(TONES);

export function isTone(value: string | undefined | null): value is Tone {
  return !!value && CHROMATIC.has(value);
}
