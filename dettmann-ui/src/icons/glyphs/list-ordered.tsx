// Geometria adaptada do Lucide `list-ordered` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, stagger } from "../techniques";

export const ListOrderedIcon = defineIcon({
  name: "list-ordered",
  parts: {
    "row1": (
      <>
        <path d="M10 6h11" />
        <path d="M4 6h1v4" />
        <path d="M4 10h2" />
      </>
    ),
    "row2": (
      <path d="M10 12h11" />
    ),
    "row3": (
      <>
        <path d="M10 18h11" />
        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
      </>
    ),
  },
  action: stagger(["row1", "row2", "row3"], nudge({ x: 1.5 })),
});
