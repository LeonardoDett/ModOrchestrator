import type { Intent } from "../theme/engine";
import { CircleAlertIcon } from "./glyphs/circle-alert";
import { CircleCheckIcon } from "./glyphs/circle-check";
import { InfoIcon } from "./glyphs/info";
import { SparklesIcon } from "./glyphs/sparkles";
import { TriangleAlertIcon } from "./glyphs/triangle-alert";
import type { AnimatedIconComponent } from "./types";

const ICONS: Record<Intent, AnimatedIconComponent> = {
  neutral: InfoIcon,
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  danger: CircleAlertIcon,
  brand: SparklesIcon,
  accent: SparklesIcon,
};

/** Glifo de status de cada intent: fonte única para `Alert`, `Toast` e afins (status nunca só por cor). */
export function intentIcon(intent: Intent): AnimatedIconComponent {
  return ICONS[intent];
}
