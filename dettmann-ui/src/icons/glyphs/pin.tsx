// Geometria adaptada do Lucide `pin` (ISC).
import { defineIcon } from "../define-icon";
import { lift } from "../techniques";

export const PinIcon = defineIcon({
  name: "pin",
  parts: {
    needle: (
      <path d="M12 17v5" />
    ),
    head: (
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    ),
  },
  action: { root: lift({ y: -1.5, rotate: 10 }) },
});
