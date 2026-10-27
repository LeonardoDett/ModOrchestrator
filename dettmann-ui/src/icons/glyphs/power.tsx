// Geometria adaptada do Lucide `power` (ISC).
import { defineIcon } from "../define-icon";
import { draw, stagger } from "../techniques";

export const PowerIcon = defineIcon({
  name: "power",
  parts: {
    stem: (
      <path d="M12 2v10" />
    ),
    arc: (
      <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
    ),
  },
  action: stagger(["stem", "arc"], draw()),
});
