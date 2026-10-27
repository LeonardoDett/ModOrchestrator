// Geometria adaptada do Lucide `cloud-upload` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, trail } from "../techniques";

export const UploadIcon = defineIcon({
  name: "upload",
  parts: {
    cloud: (
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    ),
    head: (
      <path d="m8 17 4-4 4 4" />
    ),
    stem: (
      <path d="M12 13v8" />
    ),
  },
  action: { head: nudge({ y: -1.5 }), stem: [nudge({ y: -1.5 }), trail()] },
  loop: { head: nudge({ y: -1.5, period: 1200 }), stem: [nudge({ y: -1.5, period: 1200 }), trail({ period: 1200 })] },
});
