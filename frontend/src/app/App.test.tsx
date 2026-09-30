import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, Operation, OperationEvent } from "../bridge/types";

function fakeBackend(initial: Operation[]) {
  let operations = initial;
  const listeners = new Set<(e: OperationEvent) => void>();
  const backend: Backend = {
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1.2.3", dataDir: "/tmp", schemaVersion: 1, interruptedOperations: 1 }),
    listRecentOperations: async () => operations,
    getOperationEvents: async () => [],
    onOperationEvent: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    backend,
    push(next: Operation[], event: OperationEvent) {
      operations = next;
      listeners.forEach((l) => l(event));
    },
  };
}

const op = (id: string, status: Operation["status"]): Operation => ({
  id,
  kind: `kind-${id}`,
  status,
  steps: [],
  progress: { current: 0, total: 0 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("App shell", () => {
  it("renders with the dettmann-ui theme applied", async () => {
    render(<App backend={createOfflineBackend()} />);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.getAttribute("data-theme")).toBe("forest");
  });

  it("navigates between global views through the dettmann-ui sidebar", async () => {
    const user = userEvent.setup();
    render(<App backend={createOfflineBackend()} />);
    const nav = screen.getAllByRole("navigation", { name: "Sidebar" })[0]!;
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("button", { name: "Games" }));
    expect(screen.getByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Games" })).toHaveAttribute("aria-current", "page");
  });

  it("reports an offline backend instead of inventing data", async () => {
    render(<App backend={createOfflineBackend()} />);
    expect(screen.getByText("Backend offline")).toBeInTheDocument();
    expect(screen.getByText(/only inside the desktop app/)).toBeInTheDocument();
  });

  it("shows recent operations and refreshes on operation events", async () => {
    const fake = fakeBackend([op("a", "interrupted")]);
    render(<App backend={fake.backend} />);

    expect(await screen.findByText("kind-a")).toBeInTheDocument();
    expect(await screen.findByText("Interrupted operations")).toBeInTheDocument();
    expect(await screen.findByText("v1.2.3")).toBeInTheDocument();

    await act(async () => {
      fake.push([op("b", "running"), op("a", "interrupted")], { id: "e1", sequence: 1, type: "operation.started", occurredAt: "" });
    });
    expect(await screen.findByText("kind-b")).toBeInTheDocument();
    expect(screen.getByText("1 running")).toBeInTheDocument();
  });
});
