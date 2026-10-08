// Geometria adaptada do Lucide `search` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const SearchIcon = defineIcon({
  name: "search",
  parts: {
    lens: (
      <circle cx="11" cy="11" r="8" />
    ),
    handle: (
      <path d="m21 21-4.3-4.3" />
    ),
  },
  action: { root: nudge({ x: 1.5, y: -1.5 }) },
  loop: { root: nudge({ x: 1.5, y: -1.5, period: 1400 }) },
});
