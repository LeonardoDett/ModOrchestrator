// Geometria adaptada do Lucide `copy` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const CopyIcon = defineIcon({
  name: "copy",
  parts: {
    back: (
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    ),
    front: (
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    ),
  },
  action: { front: nudge({ x: 1.2, y: 1.2 }) },
});
