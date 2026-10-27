// Geometria adaptada do Lucide `filter` (ISC).
import { defineIcon } from "../define-icon";
import { squash } from "../techniques";

export const FilterIcon = defineIcon({
  name: "filter",
  parts: {
    funnel: (
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    ),
  },
  action: { funnel: squash({ amount: 0.1 }) },
});
