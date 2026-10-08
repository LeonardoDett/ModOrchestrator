// Geometria adaptada do Lucide `panel-left-open` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const PanelLeftOpenIcon = defineIcon({
  name: "panel-left-open",
  parts: {
    frame: (
      <rect width="18" height="18" x="3" y="3" rx="2" />
    ),
    divider: (
      <path d="M9 3v18" />
    ),
    arrow: (
      <path d="m14 9 3 3-3 3" />
    ),
  },
  action: { arrow: nudge({ x: 1.5 }) },
});
