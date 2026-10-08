// Geometria adaptada do Lucide `file-archive` (ISC).
import { defineIcon } from "../define-icon";
import { lift } from "../techniques";

export const FileArchiveIcon = defineIcon({
  name: "file-archive",
  parts: {
    page: (
      <>
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M15.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 .274 1.01" />
      </>
    ),
    zip: (
      <>
        <path d="M10 12v-1" />
        <path d="M10 18v-2" />
        <path d="M10 7V6" />
        <circle cx="10" cy="20" r="2" />
      </>
    ),
  },
  action: { zip: lift({ y: -1.2 }) },
});
