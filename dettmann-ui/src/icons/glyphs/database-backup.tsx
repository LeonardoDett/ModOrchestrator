// Geometria adaptada do Lucide `database-backup` (ISC).
import { defineIcon } from "../define-icon";
import { pulse, squash, stagger } from "../techniques";

export const DatabaseBackupIcon = defineIcon({
  name: "database-backup",
  parts: {
    top: (
      <ellipse cx="12" cy="5" rx="9" ry="3" />
    ),
    side: (
      <>
        <path d="M21 9.3V5" />
        <path d="M3 5v14a9 3 0 0 0 6.47 2.88" />
      </>
    ),
    middle: (
      <path d="M3 12a9 3 0 0 0 5 2.69" />
    ),
    backup: (
      <>
        <path d="M12 12v4h4" />
        <path d="M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16" />
      </>
    ),
  },
  action: stagger(["top", "middle", "backup"], squash({ amount: 0.08 })),
  loop: stagger(["top", "middle", "backup"], pulse()),
});
