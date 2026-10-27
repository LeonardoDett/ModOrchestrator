// Geometria adaptada do Lucide `arrow-up-down` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ArrowUpDownIcon = defineIcon({
  name: "arrow-up-down",
  parts: {
    up: (
      <>
        <path d="m3 8 4-4 4 4" />
        <path d="M7 4v16" />
      </>
    ),
    down: (
      <>
        <path d="m21 16-4 4-4-4" />
        <path d="M17 20V4" />
      </>
    ),
  },
  action: { up: nudge({ y: -1.5 }), down: nudge({ y: 1.5, delay: 40 }) },
});
