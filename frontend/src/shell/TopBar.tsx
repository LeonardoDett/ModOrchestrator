import { Badge, Inline, Spinner, Typography } from "dettmann-ui";
import { useBackend } from "../bridge/backend-context";
import { useRecentOperations } from "../bridge/use-recent-operations";

/** Top bar slots per the UI plan; game/profile/deployment slots fill in later phases. */
export function TopBar() {
  const backend = useBackend();
  const operations = useRecentOperations();
  const running = operations.status === "ready" ? operations.operations.filter((op) => op.status === "running").length : 0;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <Typography variant="body-sm" color="muted-fg">
        No game selected
      </Typography>
      <Inline gap="sm" align="center">
        {running > 0 ? (
          <Badge variant="info" aria-live="polite">
            <Inline gap="xs" align="center">
              <Spinner size="sm" />
              {running} running
            </Inline>
          </Badge>
        ) : null}
        {!backend.connected ? <Badge variant="warning">Backend offline</Badge> : null}
      </Inline>
    </header>
  );
}
