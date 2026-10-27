// Geometria adaptada do Lucide `file-search` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const FileSearchIcon = defineIcon({
  name: "file-search",
  parts: {
    page: (
      <>
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3" />
      </>
    ),
    lens: (
      <>
        <path d="m9 18-1.5-1.5" />
        <circle cx="5" cy="14" r="3" />
      </>
    ),
  },
  action: { lens: nudge({ x: 1.2, y: -1.2 }) },
  loop: { lens: nudge({ x: 1.2, y: -1.2, period: 1400 }) },
});
