// Geometria adaptada do Lucide `circle-alert` (ISC).
import { defineIcon } from "../define-icon";
import { nudge } from "../techniques";

export const CircleAlertIcon = defineIcon({
  name: "circle-alert",
  parts: {
    ring: (
      <circle cx="12" cy="12" r="10" />
    ),
    mark: (
      <>
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </>
    ),
  },
  action: { mark: nudge({ y: 1.5 }) },
});
