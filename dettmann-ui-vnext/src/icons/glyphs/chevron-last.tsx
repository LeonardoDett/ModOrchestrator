// Geometria adaptada do Lucide `chevron-last` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, stagger } from "../techniques";

export const ChevronLastIcon = defineIcon({
  name: "chevron-last",
  parts: {
    chevron: (
      <path d="m7 18 6-6-6-6" />
    ),
    bar: (
      <path d="M17 6v12" />
    ),
  },
  action: stagger(["chevron", "bar"], nudge({ x: 1.5 })),
});
