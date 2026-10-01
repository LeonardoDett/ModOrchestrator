import { ArrowDown, ArrowUp, ArrowUpDown, CircleDot, Equal, EyeOff } from "lucide-react";
import { Indicator } from "dettmann-ui";
import type { ConflictDecision, ConflictIndicator, ConflictMod, ConflictResolution, FileLocation } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";

/** Icons of the per-mod indicator (core/05 §5.2); never color alone (D043). */
const INDICATOR_ICON = {
  wins_all: ArrowUp,
  loses_all: ArrowDown,
  mixed: ArrowUpDown,
  fully_overwritten: EyeOff,
  redundant_only: Equal,
} as const;

/** The Conflitos cell of the Mods table; empty when the mod has none. */
export function ConflictIndicatorCell({ value, onOpen }: { value: ConflictIndicator | undefined; onOpen: () => void }) {
  const { t, tp } = useI18n();
  if (!value || value.indicator === "none") return null;
  const label = `${t(`conflicts.indicator.${value.indicator}` as MessageKey)} · ${tp("conflicts.files", value.files)}`;
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-hover"
      aria-label={t("conflicts.openEditor", { label })}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <Indicator
        icon={INDICATOR_ICON[value.indicator]}
        tone={value.indicator === "fully_overwritten" ? "warning" : value.indicator === "redundant_only" ? "subtle" : "neutral"}
        label={label}
      />
      {value.unreviewed > 0 ? <Indicator icon={CircleDot} tone="info" label={tp("conflicts.unreviewedPairs", value.unreviewed)} /> : null}
    </button>
  );
}

export function useConflictText() {
  const { t } = useI18n();
  return {
    decision: (d: ConflictDecision) => t(`conflicts.decision.${d}` as MessageKey),
    resolution: (r: ConflictResolution) => t(`conflicts.resolution.${r}` as MessageKey),
  };
}

/** "Mod (#12)" with the disabled state spelled out. */
export function modLabel(t: ReturnType<typeof useI18n>["t"], m: ConflictMod) {
  return m.enabled ? t("conflicts.modPriority", { name: m.name, priority: m.priority }) : t("conflicts.modDisabled", { name: m.name, priority: m.priority });
}

export const locationKey = (l: FileLocation) => `${l.target}:${l.path.toLowerCase()}`;

/** Shown path with its target ("data: textures/sky.dds"). */
export const locationText = (l: FileLocation) => `${l.target}: ${l.path}`;
