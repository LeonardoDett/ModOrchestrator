import { useMemo, type ReactNode } from "react";
import { PRESETS, ThemeScope, useTheme, withSeed, type PresetId } from "dettmann-ui";

/**
 * Paints its children with a game's accent (D122): the brand roles of the
 * subtree come from the accent, as inside the game. Without an accent the
 * app's own colors stay. Used where several games show side by side
 * (Library cards, Home).
 */
export function GameAccent({ id, accent, className, children }: { id: string; accent?: string; className?: string; children: ReactNode }) {
  const theme = useTheme();
  const base = PRESETS[theme.theme.id as PresetId] ?? PRESETS.orchestrator;
  const seeded = useMemo(() => (accent ? withSeed(base, accent, `game-${id}`) : undefined), [base, accent, id]);
  if (!seeded) return <div className={className}>{children}</div>;
  return (
    <ThemeScope theme={seeded} className={className}>
      {children}
    </ThemeScope>
  );
}

