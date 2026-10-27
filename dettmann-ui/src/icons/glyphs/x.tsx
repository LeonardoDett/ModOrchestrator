// Geometria adaptada do Lucide `x` (ISC).
import { defineIcon } from "../define-icon";
import { squash, rotate } from "../techniques";

export const XIcon = defineIcon({
  name: "x",
  parts: {
    a: (
      <path d="M18 6 6 18" />
    ),
    b: (
      <path d="m6 6 12 12" />
    ),
  },
  action: { root: [squash(), rotate({ deg: 15 })] },
});
