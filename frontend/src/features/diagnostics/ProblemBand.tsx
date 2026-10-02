import { Alert, Button, Inline, Stack } from "dettmann-ui";
import { useProblems } from "../../bridge/queries";
import type { Diagnostic, DiagnosticModule } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useDeploy } from "../deploy/DeployContext";
import { SEVERITY_LOOK, actionLabel, diagnosticImpact, diagnosticTitle, shownSeverity } from "./diagnostic-labels";
import { useDiagnosticAction } from "./use-diagnostic-action";

const MAX_SHOWN = 3;

interface ProblemBandProps {
  /** Modules shown by this screen; all when absent. */
  modules?: readonly DiagnosticModule[];
  /** Codes the screen already explains in its own way. */
  exclude?: readonly string[];
}

/**
 * Problem band of a screen (ui/00 §1.2 "triagem primeiro", D014): the
 * blocking and error diagnostics of the active game that belong to the
 * screen, each with its main action, before the rest of the content. It
 * renders nothing when there is nothing to fix; diagnostics come from the
 * backend and are never kept here (INV-OPS-04).
 */
export function ProblemBand({ modules, exclude = [] }: ProblemBandProps) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const { instance } = useDeploy();
  const { navigate } = useNavigation();
  const act = useDiagnosticAction();
  const problems = useProblems(instance);
  if (problems.status !== "ready" || !problems.data) return null;
  const shown = problems.data.items.filter(
    (d) => d.severity === "error" && (!modules || modules.includes(d.module)) && !exclude.includes(d.code),
  );
  if (shown.length === 0) return null;
  return (
    <Stack gap="sm" aria-label={t("topbar.problems")} role="region">
      {shown.slice(0, MAX_SHOWN).map((d) => (
        <BandItem key={d.key} d={d} onAct={(i) => void act(d, i)} />
      ))}
      {shown.length > MAX_SHOWN ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => navigate({ view: "diagnostics", tab: "problems" })}>
            {tp("diag.band.more", shown.length - MAX_SHOWN)} · {t("diag.seeAll")}
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}

function BandItem({ d, onAct }: { d: Diagnostic; onAct: (index: number) => void }) {
  const i18n = useI18n();
  const look = SEVERITY_LOOK[shownSeverity(d)];
  const Icon = look.icon;
  const impact = diagnosticImpact(i18n, d);
  return (
    <Alert.Root variant={look.tone}>
      <Alert.Title>
        <Inline gap="xs" align="center">
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{diagnosticTitle(i18n, d)}</span>
        </Inline>
      </Alert.Title>
      {impact ? <Alert.Description>{impact}</Alert.Description> : null}
      <Inline gap="xs" className="mt-2">
        {d.actions.slice(0, 2).map((a, i) => (
          <Button key={`${a.id}-${i}`} size="sm" variant={i === 0 ? "outline" : "ghost"} onClick={() => onAct(i)}>
            {actionLabel(i18n, a)}
          </Button>
        ))}
      </Inline>
    </Alert.Root>
  );
}
