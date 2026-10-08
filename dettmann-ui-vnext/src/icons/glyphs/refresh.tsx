// Geometria adaptada do Lucide `refresh-cw` (ISC).
import { defineIcon } from "../define-icon";
import { rotate, spin } from "../techniques";

export const RefreshIcon = defineIcon({
  name: "refresh",
  parts: {
    upper: (
      <>
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
    lower: (
      <>
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </>
    ),
  },
  action: { root: rotate({ deg: 110 }) },
  loop: { root: spin() },
});
