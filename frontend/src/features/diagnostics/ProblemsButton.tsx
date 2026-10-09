import { OctagonX, ShieldCheck } from "lucide-react";
import { Badge, Button, Icon } from "dettmann-ui";
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
      emphasis="low"
      size="sm"
      onClick={() => navigate({ view: "diagnostics", tab: "problems" })}
      aria-label={count > 0 ? tp("topbar.problemsCount", count) : t("topbar.problems")}
      startIcon={
        count > 0 ? <Icon icon={OctagonX} size="sm" className="text-danger-text" /> : <Icon icon={ShieldCheck} size="sm" />
      }
    >
      {t("topbar.problems")}
      {count > 0 ? (
        <Badge intent="danger" size="sm" aria-hidden="true">
          {count}
        </Badge>
      ) : null}
    </Button>
  );
}
