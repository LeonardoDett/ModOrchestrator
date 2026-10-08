// Geometria adaptada do Lucide `plus` (ISC).
import { defineIcon } from "../define-icon";
import { squash } from "../techniques";

export const PlusIcon = defineIcon({
  name: "plus",
  parts: {
    h: (
      <path d="M5 12h14" />
    ),
    v: (
      <path d="M12 5v14" />
    ),
  },
  action: { root: squash() },
});
