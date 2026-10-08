// Geometria adaptada do Lucide `download` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, trail } from "../techniques";

export const DownloadIcon = defineIcon({
  name: "download",
  parts: {
    tray: (
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    ),
    head: (
      <polyline points="7 10 12 15 17 10" />
    ),
    stem: (
      <line x1="12" x2="12" y1="15" y2="3" />
    ),
  },
  action: { head: nudge({ y: 1.5 }), stem: [nudge({ y: 1.5 }), trail()] },
  loop: { head: nudge({ y: 1.5, period: 1200 }), stem: [nudge({ y: 1.5, period: 1200 }), trail({ period: 1200 })] },
});
