// Geometria adaptada do Lucide `chevron-down` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ChevronDownIcon = defineIcon({
  name: "chevron-down",
  parts: {
    chevron: (
      <path d="m6 9 6 6 6-6" />
    ),
  },
  action: { chevron: nudge({ y: 1.5 }) },
});
