// Geometria adaptada do Lucide `arrow-up` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ArrowUpIcon = defineIcon({
  name: "arrow-up",
  parts: {
    head: (
      <path d="m5 12 7-7 7 7" />
    ),
    shaft: (
      <path d="M12 19V5" />
    ),
  },
  action: { head: nudge({ y: -1.5 }), shaft: nudge({ y: -1.5, delay: 30 }) },
});
