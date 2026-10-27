// Geometria adaptada do Lucide `play` (ISC).
import { defineIcon } from "../define-icon";
import { squash } from "../techniques";

export const PlayIcon = defineIcon({
  name: "play",
  parts: {
    shape: (
      <polygon points="6 3 20 12 6 21 6 3" />
    ),
  },
  action: { shape: squash() },
});
