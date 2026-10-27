// Geometria adaptada do Lucide `clock` (ISC).
import { defineIcon } from "../define-icon";
import { rotate, spin } from "../techniques";

export const ClockIcon = defineIcon({
  name: "clock",
  parts: {
    face: (
      <circle cx="12" cy="12" r="10" />
    ),
    minute: (
      <path d="M12 6v6" />
    ),
    hour: (
      <path d="M12 12l4 2" />
    ),
  },
  origin: { minute: "50% 100%", hour: "0% 0%" },
  action: { minute: rotate({ deg: 15 }), hour: rotate({ deg: 15 }) },
  loop: { minute: spin({ period: 1200 }), hour: spin({ period: 7200 }) },
});
