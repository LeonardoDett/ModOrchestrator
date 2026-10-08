// Geometria adaptada do Lucide `git-compare` (ISC).
import { defineIcon } from "../define-icon";
import { nudge, stagger } from "../techniques";

export const GitCompareIcon = defineIcon({
  name: "git-compare",
  parts: {
    left: (
      <>
        <circle cx="6" cy="6" r="3" />
        <path d="M11 18H8a2 2 0 0 1-2-2V9" />
      </>
    ),
    right: (
      <>
        <circle cx="18" cy="18" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      </>
    ),
  },
  action: stagger(["left", "right"], nudge({ x: 1.5 })),
});
