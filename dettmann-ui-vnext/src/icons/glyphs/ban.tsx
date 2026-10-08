// Geometria adaptada do Lucide `ban` (ISC).
import { defineIcon } from "../define-icon";
import { draw } from "../techniques";

export const BanIcon = defineIcon({
  name: "ban",
  parts: {
    ring: (
      <circle cx="12" cy="12" r="10" />
    ),
    slash: (
      <path d="m4.9 4.9 14.2 14.2" />
    ),
  },
  action: { slash: draw() },
});
