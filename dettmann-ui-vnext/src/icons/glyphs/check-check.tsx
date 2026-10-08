// Geometria adaptada do Lucide `check-check` (ISC).
import { defineIcon } from "../define-icon";
import { draw, stagger } from "../techniques";

export const CheckCheckIcon = defineIcon({
  name: "check-check",
  parts: {
    first: (
      <path d="M18 6 7 17l-5-5" />
    ),
    second: (
      <path d="m22 10-7.5 7.5L13 16" />
    ),
  },
  action: stagger(["first", "second"], draw()),
});
