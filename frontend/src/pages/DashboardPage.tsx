import { Activity, Gamepad2 } from "lucide-react";
import { Alert, Badge, EmptyState, FeaturedIcon, ResourcePage, Spinner, Stack, Table, Typography } from "dettmann-ui";
import { useAppInfo } from "../bridge/use-app-info";
import { useRecentOperations } from "../bridge/use-recent-operations";
import type { Operation, OperationStatus } from "../bridge/types";

const statusBadge: Record<OperationStatus, "default" | "info" | "success" | "danger" | "warning" | "muted"> = {
  pending: "muted",
  running: "info",
  succeeded: "success",
  failed: "danger",
  cancelled: "muted",
  interrupted: "warning",
};

/** Triage center (ui/telas/dashboard.md). */
export function DashboardPage() {
  const info = useAppInfo();

  return (
    <ResourcePage title="Dashboard" description="What needs your attention, and what happened recently.">
      <Stack gap="xl">
        {info && info.interruptedOperations > 0 ? (
          <Alert.Root variant="warning">
            <Alert.Title>Interrupted operations</Alert.Title>
            <Alert.Description>
              {info.interruptedOperations} operation(s) were still running when the app last closed. They are listed
              below as interrupted.
            </Alert.Description>
          </Alert.Root>
        ) : null}

        <Stack as="section" gap="sm" aria-labelledby="setup-status">
          <Typography id="setup-status" variant="heading-6" color="fg">
            Setup status
          </Typography>
          <EmptyState.Root className="rounded-xl border border-border bg-surface">
            <EmptyState.Icon>
              <FeaturedIcon icon={Gamepad2} color="neutral" />
            </EmptyState.Icon>
            <EmptyState.Title>No game managed yet</EmptyState.Title>
            <EmptyState.Description>Managed games and their deployment state will appear here.</EmptyState.Description>
          </EmptyState.Root>
        </Stack>

        <Stack as="section" gap="sm" aria-labelledby="recent-operations">
          <Typography id="recent-operations" variant="heading-6" color="fg">
            Recent operations
          </Typography>
          <RecentOperations />
        </Stack>
      </Stack>
    </ResourcePage>
  );
}

function RecentOperations() {
  const state = useRecentOperations();

  switch (state.status) {
    case "loading":
      return <Spinner label="Loading operations" />;
    case "unavailable":
      return (
        <Alert.Root variant="info">
          <Alert.Description>Operations are available only inside the desktop app.</Alert.Description>
        </Alert.Root>
      );
    case "error":
      return (
        <Alert.Root variant="danger">
          <Alert.Title>Could not load operations</Alert.Title>
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Root>
      );
    case "ready":
      return state.operations.length === 0 ? (
        <EmptyState.Root className="rounded-xl border border-border bg-surface">
          <EmptyState.Icon>
            <FeaturedIcon icon={Activity} color="neutral" />
          </EmptyState.Icon>
          <EmptyState.Title>No operations yet</EmptyState.Title>
          <EmptyState.Description>Imports, deployments and scans will be tracked here.</EmptyState.Description>
        </EmptyState.Root>
      ) : (
        <OperationsTable operations={state.operations} />
      );
  }
}

function OperationsTable({ operations }: { operations: Operation[] }) {
  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Operation</Table.Head>
          <Table.Head>Status</Table.Head>
          <Table.Head>Step</Table.Head>
          <Table.Head>Started</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {operations.map((op) => (
          <Table.Row key={op.id}>
            <Table.Cell>{op.kind}</Table.Cell>
            <Table.Cell>
              <Badge variant={statusBadge[op.status]}>{op.status}</Badge>
            </Table.Cell>
            <Table.Cell>{op.currentStep ?? op.error?.step ?? "—"}</Table.Cell>
            <Table.Cell>{new Date(op.startedAt ?? op.createdAt).toLocaleString()}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}
