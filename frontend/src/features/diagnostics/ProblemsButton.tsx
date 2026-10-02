import { OctagonX, ShieldCheck } from "lucide-react";
import { Badge, Button } from "dettmann-ui";
import { useProblems } from "../../bridge/queries";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useDeploy } from "../deploy/DeployContext";

/** Top bar problems counter (ui/00 §2.3): blocking + errors of the active game, opens Diagnostics. */
export function ProblemsButton() {
  const { t, tp } = useI18n();
  const { instance } = useDeploy();
  const { navigate } = useNavigation();
  const problems = useProblems(instance);
  if (!instance || problems.status !== "ready" || !problems.data) return null;
  const count = problems.data.counts.blocking + problems.data.counts.errors;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => navigate({ view: "diagnostics", tab: "problems" })}
      aria-label={count > 0 ? tp("topbar.problemsCount", count) : t("topbar.problems")}
      startIcon={
        count > 0 ? <OctagonX aria-hidden="true" className="h-4 w-4 text-danger-text" /> : <ShieldCheck aria-hidden="true" className="h-4 w-4" />
      }
    >
      {t("topbar.problems")}
      {count > 0 ? (
        <Badge tone="danger" size="sm" aria-hidden="true">
          {count}
        </Badge>
      ) : null}
    </Button>
  );
}
