// Geometria adaptada do Lucide `scan-search` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const ScanSearchIcon = defineIcon({
  name: "scan-search",
  parts: {
    frame: (
      <>
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      </>
    ),
    lens: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m16 16-1.9-1.9" />
      </>
    ),
  },
  action: { lens: nudge({ x: 1, y: -1 }) },
  loop: { lens: nudge({ x: 1, y: -1, period: 1400 }) },
});
