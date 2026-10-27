// Geometria adaptada do Lucide `panel-left-close` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const PanelLeftCloseIcon = defineIcon({
  name: "panel-left-close",
  parts: {
    frame: (
      <rect width="18" height="18" x="3" y="3" rx="2" />
    ),
    divider: (
      <path d="M9 3v18" />
    ),
    arrow: (
      <path d="m16 15-3-3 3-3" />
    ),
  },
  action: { arrow: nudge({ x: -1.5 }) },
});
