// Geometria adaptada do Lucide `ellipsis` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, stagger } from "../techniques";

export const MoreHorizontalIcon = defineIcon({
  name: "more-horizontal",
  parts: {
    left: (
      <circle cx="5" cy="12" r="1" />
    ),
    mid: (
      <circle cx="12" cy="12" r="1" />
    ),
    right: (
      <circle cx="19" cy="12" r="1" />
    ),
  },
  action: stagger(["left", "mid", "right"], nudge({ y: -1.5 })),
});
