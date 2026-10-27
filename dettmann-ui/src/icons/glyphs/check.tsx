// Geometria adaptada do Lucide `check` (ISC).
import { defineIcon } from "../define-icon";
import { draw } from "../techniques";

export const CheckIcon = defineIcon({
  name: "check",
  parts: {
    check: (
      <path d="M20 6 9 17l-5-5" />
    ),
  },
  action: { check: draw() },
});
