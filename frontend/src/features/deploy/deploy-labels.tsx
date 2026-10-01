import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, OctagonX, XCircle } from "lucide-react";
import type { Tone } from "dettmann-ui";
import type { DeployStatus, DeployStatusKind, FileLocation } from "../../bridge/types";
import type { MessageKey } from "../../i18n/i18n";

/**
 * Presentation of the status the backend derived (core/04 §7, ui/03 §5):
 * always icon + label, never color alone (D043). No decision is taken here.
 */
export interface StatusLook {
  tone: Tone | undefined;
  icon: LucideIcon;
  label: MessageKey;
  spin?: boolean;
}

const LOOKS: Record<DeployStatusKind, StatusLook> = {
  in_sync: { tone: "success", icon: CheckCircle2, label: "deploy.status.in_sync" },
  pending: { tone: "info", icon: Clock, label: "deploy.status.pending" },
  never_deployed: { tone: undefined, icon: CircleDashed, label: "deploy.status.never_deployed" },
  blocked: { tone: "danger", icon: OctagonX, label: "deploy.status.blocked" },
  failed: { tone: "danger", icon: XCircle, label: "deploy.status.failed" },
  unknown: { tone: "warning", icon: AlertTriangle, label: "deploy.status.unknown" },
};

const BUSY_LOOK: StatusLook = { tone: "primary", icon: Loader2, label: "deploy.status.busy", spin: true };

/** The look of a status; a deploy or purge holding the instance wins. */
export function statusLook(s: DeployStatus): StatusLook {
  if (s.busy === "deploy" || s.busy === "purge" || s.busy === "move_staging" || s.busy === "change_method") return BUSY_LOOK;
  return LOOKS[s.kind] ?? LOOKS.unknown;
}

export function locationText(l: FileLocation) {
  return `${l.target}:${l.path}`;
}

/** Human size for space estimates. */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}
