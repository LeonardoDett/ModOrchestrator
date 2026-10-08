// Geometria adaptada do Lucide `eye` (ISC).
import { defineIcon } from "../define-icon";
import { squash } from "../techniques";

export const EyeIcon = defineIcon({
  name: "eye",
  parts: {
    outline: (
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    ),
    pupil: (
      <circle cx="12" cy="12" r="3" />
    ),
  },
  action: { outline: squash({ amount: 0.06 }), pupil: squash({ amount: 0.15 }) },
});
