// Geometria adaptada do Lucide `moon` (ISC).
import { defineIcon } from "../define-icon";
import { rotate } from "../techniques";

export const MoonIcon = defineIcon({
  name: "moon",
  parts: {
    moon: (
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    ),
  },
  action: { moon: rotate({ deg: -20 }) },
});
