// Geometria adaptada do Lucide `chevron-left` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ChevronLeftIcon = defineIcon({
  name: "chevron-left",
  parts: {
    chevron: (
      <path d="m15 18-6-6 6-6" />
    ),
  },
  action: { chevron: nudge({ x: -1.5 }) },
});
