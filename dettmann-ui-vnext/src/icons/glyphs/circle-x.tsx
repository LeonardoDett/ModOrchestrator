// Geometria adaptada do Lucide `circle-x` (ISC).
import { defineIcon } from "../define-icon";
import { rotate, squash } from "../techniques";

export const CircleXIcon = defineIcon({
  name: "circle-x",
  parts: {
    ring: (
      <circle cx="12" cy="12" r="10" />
    ),
    cross: (
      <>
        <path d="m15 9-6 6" />
        <path d="m9 9 6 6" />
      </>
    ),
  },
  action: { cross: [squash(), rotate({ deg: 15 })] },
});
