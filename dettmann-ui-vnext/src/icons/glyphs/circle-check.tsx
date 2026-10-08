// Geometria adaptada do Lucide `circle-check` (ISC).
import { defineIcon } from "../define-icon";
import { draw } from "../techniques";

export const CircleCheckIcon = defineIcon({
  name: "circle-check",
  parts: {
    ring: (
      <circle cx="12" cy="12" r="10" />
    ),
    check: (
      <path d="m9 12 2 2 4-4" />
    ),
  },
  action: { check: draw() },
});
