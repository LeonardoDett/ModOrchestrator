// Geometria adaptada do Lucide `arrow-down` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ArrowDownIcon = defineIcon({
  name: "arrow-down",
  parts: {
    shaft: (
      <path d="M12 5v14" />
    ),
    head: (
      <path d="m19 12-7 7-7-7" />
    ),
  },
  action: { head: nudge({ y: 1.5 }), shaft: nudge({ y: 1.5, delay: 30 }) },
});
