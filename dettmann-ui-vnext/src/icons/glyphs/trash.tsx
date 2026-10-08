// Geometria adaptada do Lucide `trash-2` (ISC).
import { defineIcon } from "../define-icon";
import { lift, squash } from "../techniques";

export const TrashIcon = defineIcon({
  name: "trash",
  parts: {
    lid: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </>
    ),
    body: (
      <>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
      </>
    ),
  },
  origin: { lid: "100% 100%" },
  action: { lid: lift({ y: -1.8, rotate: 14 }), body: squash({ amount: 0.06, delay: 40 }) },
});
