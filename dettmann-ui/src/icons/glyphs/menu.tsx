// Geometria adaptada do Lucide `menu` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, stagger } from "../techniques";

export const MenuIcon = defineIcon({
  name: "menu",
  parts: {
    top: (
      <line x1="4" x2="20" y1="6" y2="6" />
    ),
    mid: (
      <line x1="4" x2="20" y1="12" y2="12" />
    ),
    bottom: (
      <line x1="4" x2="20" y1="18" y2="18" />
    ),
  },
  action: stagger(["top", "mid", "bottom"], nudge({ x: 1.5 })),
});
