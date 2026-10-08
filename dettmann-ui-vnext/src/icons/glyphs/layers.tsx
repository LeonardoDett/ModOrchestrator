// Geometria adaptada do Lucide `layers` (ISC).
import { defineIcon } from "../define-icon";
import { lift, stagger } from "../techniques";

export const LayersIcon = defineIcon({
  name: "layers",
  parts: {
    top: (
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
    ),
    middle: (
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
    ),
    bottom: (
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    ),
  },
  action: stagger(["top", "middle", "bottom"], lift({ y: -1.5 })),
});
