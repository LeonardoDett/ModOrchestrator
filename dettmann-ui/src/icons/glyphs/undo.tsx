// Geometria adaptada do Lucide `rotate-ccw` (ISC).
import { defineIcon } from "../define-icon";
import { rotate } from "../techniques";

export const UndoIcon = defineIcon({
  name: "undo",
  parts: {
    arc: (
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    ),
    head: (
      <path d="M3 3v5h5" />
    ),
  },
  action: { root: rotate({ deg: -100 }) },
});
