// Geometria adaptada do Lucide `chevron-up` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ChevronUpIcon = defineIcon({
  name: "chevron-up",
  parts: {
    chevron: (
      <path d="m18 15-6-6-6 6" />
    ),
  },
  action: { chevron: nudge({ y: -1.5 }) },
});
