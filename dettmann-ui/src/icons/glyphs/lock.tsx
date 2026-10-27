// Geometria adaptada do Lucide `lock` (ISC).
import { defineIcon } from "../define-icon";
import { lift } from "../techniques";

export const LockIcon = defineIcon({
  name: "lock",
  parts: {
    shackle: (
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    ),
    body: (
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    ),
  },
  action: { shackle: lift({ y: -1.5 }) },
});
