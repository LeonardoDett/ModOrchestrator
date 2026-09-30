import { Activity } from "lucide-react";
import { Alert, Button, Drawer, EmptyState, FeaturedIcon, Spinner, Stack, Typography } from "dettmann-ui";
import { useOperations } from "../../bridge/queries";
import type { Operation } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { OperationDetails } from "./OperationDetails";

interface OperationsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Operations drawer (ui/00 §2.3): operations in progress first, then recent ones. */
export function OperationsDrawer({ open, onOpenChange }: OperationsDrawerProps) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const go = (route: Parameters<typeof navigate>[0]) => {
    onOpenChange(false);
    navigate(route);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Content side="right" aria-describedby={undefined}>
        <Drawer.Header>
          <Drawer.Title>{t("operations.title")}</Drawer.Title>
          <Drawer.CloseButton aria-label={t("common.close")} />
        </Drawer.Header>
        <Drawer.Body>
          <DrawerContent onViewLog={(id) => go({ view: "diagnostics", tab: "log", operation: id })} />
        </Drawer.Body>
        <Drawer.Footer>
          <Button variant="outline" onClick={() => go({ view: "diagnostics", tab: "operations" })}>
            {t("operations.openDiagnostics")}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer.Root>
  );
}

function DrawerContent({ onViewLog }: { onViewLog: (id: string) => void }) {
  const { t } = useI18n();
  const query = useOperations(30);
  switch (query.status) {
    case "loading":
      return <Spinner label={t("common.loading")} />;
    case "unavailable":
      return (
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      );
    case "error":
      return <ErrorAlert title="operations.loadError" error={query.error} onRetry={query.reload} />;
    case "ready": {
      if (query.data.length === 0) {
        return (
          <EmptyState.Root>
            <EmptyState.Icon>
              <FeaturedIcon icon={Activity} color="neutral" />
            </EmptyState.Icon>
            <EmptyState.Title>{t("operations.emptyTitle")}</EmptyState.Title>
            <EmptyState.Description>{t("operations.emptyDescription")}</EmptyState.Description>
          </EmptyState.Root>
        );
      }
      const live = query.data.filter((op) => op.status === "running" || op.status === "pending");
      const done = query.data.filter((op) => !live.includes(op));
      return (
        <Stack gap="lg">
          <OperationGroup title="operations.inProgress" operations={live} onViewLog={onViewLog} />
          <OperationGroup title="operations.recent" operations={done} onViewLog={onViewLog} />
        </Stack>
      );
    }
  }
}

function OperationGroup({ title, operations, onViewLog }: { title: MessageKey; operations: Operation[]; onViewLog: (id: string) => void }) {
  const { t } = useI18n();
  if (operations.length === 0) return null;
  return (
    <Stack as="section" gap="sm" aria-label={t(title)}>
      <Typography variant="caption" color="muted-fg" className="font-semibold uppercase tracking-wide">
        {t(title)}
      </Typography>
      <ul className="flex flex-col gap-2">
        {operations.map((op) => (
          <li key={op.id} className="rounded-lg border border-border bg-surface p-3">
            <OperationDetails operation={op} compact onViewLog={onViewLog} />
          </li>
        ))}
      </ul>
    </Stack>
  );
}
