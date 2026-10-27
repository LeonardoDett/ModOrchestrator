// Geometria adaptada do Lucide `info` (ISC).
import { defineIcon } from "../define-icon";
import { squash } from "../techniques";

export const InfoIcon = defineIcon({
  name: "info",
  parts: {
    ring: (
      <circle cx="12" cy="12" r="10" />
    ),
    mark: (
      <>
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    ),
  },
  action: { mark: squash({ amount: 0.15 }) },
});
