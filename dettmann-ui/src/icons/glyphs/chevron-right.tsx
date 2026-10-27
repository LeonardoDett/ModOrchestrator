// Geometria adaptada do Lucide `chevron-right` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ChevronRightIcon = defineIcon({
  name: "chevron-right",
  parts: {
    chevron: (
      <path d="m9 18 6-6-6-6" />
    ),
  },
  action: { chevron: nudge({ x: 1.5 }) },
});
