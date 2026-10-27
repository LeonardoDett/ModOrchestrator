// Geometria adaptada do Lucide `minus` (ISC).
import { defineIcon } from "../define-icon";
import { squash } from "../techniques";

export const MinusIcon = defineIcon({
  name: "minus",
  parts: {
    bar: (
      <path d="M5 12h14" />
    ),
  },
  action: { bar: squash() },
});
