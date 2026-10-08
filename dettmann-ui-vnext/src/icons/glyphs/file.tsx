// Geometria adaptada do Lucide `file` (ISC).
import { defineIcon } from "../define-icon";
import { flip } from "../techniques";

export const FileIcon = defineIcon({
  name: "file",
  parts: {
    page: (
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    ),
    fold: (
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    ),
  },
  action: { root: flip({ deg: 40 }) },
});
