import type { MotionValues } from "./read-motion";

type Frames = (m: MotionValues) => Keyframe[];
export type OverlaySide = "left" | "right" | "top" | "bottom";

const round = (n: number) => Math.round(n * 1000) / 1000;
const reversed =
  (enter: Frames): Frames =>
  (m) =>
    [...enter(m)].reverse();

/** Painel flutuante (modal, menu, popover): opacidade + leve escala, pela amplitude do nível. */
export const overlayEnter: Frames = (m) => [
  { opacity: 0, transform: `scale(${round(1 - 0.04 * m.amp)})` },
  { opacity: 1, transform: "scale(1)" },
];
export const overlayExit = reversed(overlayEnter);

/** Fundo escurecido: só opacidade. */
export const fadeEnter: Frames = () => [{ opacity: 0 }, { opacity: 1 }];
export const fadeExit = reversed(fadeEnter);

const OFFSET: Record<OverlaySide, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

/** Painel lateral (drawer): desliza a partir do lado em que está ancorado. */
export const slideEnter = (side: OverlaySide): Frames => {
  const [x, y] = OFFSET[side];
  return (m) => [
    { opacity: 0, transform: `translate(${round(x * 16 * m.amp)}px, ${round(y * 16 * m.amp)}px)` },
    { opacity: 1, transform: "translate(0px, 0px)" },
  ];
};
export const slideExit = (side: OverlaySide): Frames => reversed(slideEnter(side));
