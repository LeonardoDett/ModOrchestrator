// Geometria adaptada do Lucide `chevron-first` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, stagger } from "../techniques";

export const ChevronFirstIcon = defineIcon({
  name: "chevron-first",
  parts: {
    chevron: (
      <path d="m17 18-6-6 6-6" />
    ),
    bar: (
      <path d="M7 6v12" />
    ),
  },
  action: stagger(["chevron", "bar"], nudge({ x: -1.5 })),
});
