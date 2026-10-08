// Geometria adaptada do Lucide `history` (ISC).
import { defineIcon } from "../define-icon";
import { rotate, spin } from "../techniques";

export const HistoryIcon = defineIcon({
  name: "history",
  parts: {
    arc: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    minute: (
      <path d="M12 7v5" />
    ),
    hour: (
      <path d="M12 12l4 2" />
    ),
  },
  origin: { minute: "50% 100%", hour: "0% 0%" },
  action: { root: rotate({ deg: -18 }) },
  loop: { minute: spin({ period: 1200 }), hour: spin({ period: 7200 }) },
});
