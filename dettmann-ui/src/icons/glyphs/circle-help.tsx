// Geometria adaptada do Lucide `circle-help` (ISC).
import { defineIcon } from "../define-icon";
import { rotate } from "../techniques";

export const CircleHelpIcon = defineIcon({
  name: "circle-help",
  parts: {
    ring: (
      <circle cx="12" cy="12" r="10" />
    ),
    mark: (
      <>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    ),
  },
  action: { mark: rotate({ deg: 15 }) },
});
