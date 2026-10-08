// Geometria adaptada do Lucide `triangle-alert` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, pulse } from "../techniques";

export const TriangleAlertIcon = defineIcon({
  name: "triangle-alert",
  parts: {
    triangle: (
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    ),
    mark: (
      <>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  action: { mark: nudge({ y: 1.2 }) },
  loop: { root: pulse({ amount: 0.08 }) },
});
