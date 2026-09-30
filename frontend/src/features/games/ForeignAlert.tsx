import { TriangleAlert } from "lucide-react";
import { Alert, Button, Inline, Stack } from "dettmann-ui";
import type { ForeignFinding } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";

const KIND_LABEL: Record<ForeignFinding["kind"], MessageKey> = {
  vortex: "foreign.vortex",
  mo2: "foreign.mo2",
  other_instance: "foreign.otherInstance",
};

/** Text for one finding (the file or folder that gives the other manager away). */
export function useFindingLabel() {
  const { t, has } = useI18n();
  return (f: ForeignFinding) => {
    const key = KIND_LABEL[f.kind];
    return `${has(key) ? t(key) : f.kind}: ${f.name}`;
  };
}

interface ForeignAlertProps {
  findings: ForeignFinding[];
  /** The assistant only warns; an existing instance can also offer actions. */
  onOpenFolder?: () => void;
  onRecheck?: () => void;
}

/**
 * Deployment by another manager in the game folders (core/04 §11, INV-DEP-08).
 * The finding is calculated by the backend on every read; the actions lead to
 * where it can be resolved ("open folder", "I removed it, check again").
 */
export function ForeignAlert({ findings, onOpenFolder, onRecheck }: ForeignAlertProps) {
  const { t } = useI18n();
  const label = useFindingLabel();
  if (findings.length === 0) return null;
  return (
    <Alert.Root variant="warning">
      <Alert.Title>
        <span className="inline-flex items-center gap-2">
          <TriangleAlert aria-hidden="true" className="h-4 w-4" />
          {t("foreign.title")}
        </span>
      </Alert.Title>
      <Alert.Description>
        <Stack gap="sm">
          <span>{t("foreign.description")}</span>
          <ul className="list-disc pl-5">
            {findings.map((f) => (
              <li key={`${f.kind}|${f.target ?? ""}|${f.name}`}>{label(f)}</li>
            ))}
          </ul>
          {onOpenFolder || onRecheck ? (
            <Inline gap="sm">
              {onOpenFolder ? (
                <Button size="sm" variant="outline" onClick={onOpenFolder}>
                  {t("foreign.openFolder")}
                </Button>
              ) : null}
              {onRecheck ? (
                <Button size="sm" variant="outline" onClick={onRecheck}>
                  {t("foreign.recheck")}
                </Button>
              ) : null}
            </Inline>
          ) : null}
        </Stack>
      </Alert.Description>
    </Alert.Root>
  );
}
