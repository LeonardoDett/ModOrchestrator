import { act, render, screen, waitFor, within } from "@testing-library/react";
import { openOperations, SETTINGS_TABS } from "../test/shell";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, LogEntry, LogFilter, Operation, OperationEvent, Setting } from "../bridge/types";
import { chooseOption } from "../test/select";

const setting = (key: string, value: string, options: string[], def = options[0]!): Setting => ({
  key,
  tab: key.startsWith("theme.") ? "theme" : "interface",
  type: "enum",
  value,
  default: def,
  isDefault: value === def,
  options,
  advanced: false,
  restartRequired: false,
});

function fakeBackend(initial: Operation[]) {
  let operations = initial;
  const listeners = new Set<(e: OperationEvent) => void>();
  const values: Record<string, string> = { "ui.language": "en", "theme.mode": "dark", "theme.id": "orchestrator", "theme.density": "comfortable" };
  const logFilters: LogFilter[] = [];
  const log: LogEntry[] = [
    { time: "2026-01-01T00:00:00Z", level: "info", message: "startup" },
    { time: "2026-01-01T00:00:01Z", level: "error", message: "copy failed", operation: "a", error: "access denied" },
  ];
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    window: null,
    getAppInfo: async () => ({
      name: "Mod Orchestrator",
      version: "1.2.3",
      dataDir: "/tmp",
      schemaVersion: 2,
      interruptedOperations: 1,
      logsDir: "/tmp/logs",
      customTitleBar: false,
    }),
    listRecentOperations: vi.fn(async () => operations),
    getOperationEvents: async () => [],
    onOperationEvent: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    settingsTabs: async () => SETTINGS_TABS,
    listAppSettings: async () => [
      setting("ui.language", values["ui.language"]!, ["en", "pt-BR"]),
      setting("theme.mode", values["theme.mode"]!, ["dark", "light", "system"]),
      setting("theme.id", values["theme.id"]!, ["orchestrator", "forest", "graphite"]),
      setting("theme.density", values["theme.density"]!, ["comfortable", "compact"]),
    ],
    setAppSetting: vi.fn(async (key: string, value: string) => {
      if (value === "bogus") throw new Error(JSON.stringify({ code: "setting_invalid", params: { key, value }, detail: "settings: invalid" }));
      values[key] = value;
    }),
    resetAppSetting: async () => {},
    logTail: async (filter) => {
      logFilters.push(filter);
      return log.filter((e) => (filter.levels.length === 0 || filter.levels.includes(e.level)) && (!filter.operation || e.operation === filter.operation));
    },
    openLogFolder: async () => {},
  };
  return {
    backend,
    logFilters,
    push(next: Operation[], event: OperationEvent) {
      operations = next;
      listeners.forEach((l) => l(event));
    },
  };
}

const op = (id: string, status: Operation["status"], extra: Partial<Operation> = {}): Operation => ({
  id,
  kind: `kind-${id}`,
  status,
  steps: [],
  progress: { current: 0, total: 0 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...extra,
});

const sidebar = () => screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

describe("App shell", () => {
  beforeEach(() => localStorage.clear());

  it("applies the orchestrator theme in dark mode", async () => {
    render(<App backend={createOfflineBackend()} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("orchestrator"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("title bar is a structural layer and paints the logo as a themed mask", async () => {
    render(<App backend={createOfflineBackend()} />);
    await screen.findByRole("heading", { level: 1, name: "Home" });
    const logo = screen.getByRole("img", { name: "Mod Orchestrator" });
    expect(logo.tagName).not.toBe("IMG");
    expect(logo).toHaveClass("bg-fg");
    expect(logo.style.maskImage || logo.style.getPropertyValue("mask-image") || logo.style.getPropertyValue("-webkit-mask-image")).toContain("url(");
    expect(logo.closest("header")).toHaveAttribute("data-layer", "medium");
  });

  it("renders the sectioned sidebar and navigates", async () => {
    const user = userEvent.setup();
    render(<App backend={createOfflineBackend()} />);
    const nav = sidebar();
    expect(within(nav).getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Settings" }).closest(".mt-auto")).not.toBeNull();
    await user.click(within(nav).getByRole("button", { name: "Library" }));
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(screen.getByText("Live data is available only inside the desktop app.")).toBeInTheDocument();
  });

  it("reports an offline backend instead of inventing data", async () => {
    render(<App backend={createOfflineBackend()} />);
    expect(screen.getByText("Backend offline")).toBeInTheDocument();
    expect(screen.getAllByText(/only inside the desktop app/).length).toBeGreaterThan(0);
    // Without a game there is only the app level: no game menu, no game top bar (D023, D120).
    expect(within(sidebar()).queryByRole("button", { name: "Mods" })).not.toBeInTheDocument();
    // No window controls outside a frameless desktop window.
    expect(screen.queryByRole("button", { name: "Minimize" })).not.toBeInTheDocument();
  });

  it("rereads operations from the backend on events instead of merging them (INV-OPS-04)", async () => {
    const fake = fakeBackend([op("a", "interrupted")]);
    render(<App backend={fake.backend} />);
    // Home (board Inicio) lists only what is running; an interrupted one shows in the banner.
    expect(await screen.findByText("Interrupted operations")).toBeInTheDocument();
    expect(screen.queryByText("kind-a")).not.toBeInTheDocument();
    expect(await screen.findByText("v1.2.3")).toBeInTheDocument();

    // The event carries a status the backend does not confirm: the UI must
    // show what it reads back, not what the event says.
    await act(async () => {
      fake.push([op("b", "running"), op("a", "interrupted")], { id: "e1", sequence: 1, type: "operation.started", occurredAt: "", operationId: "b", status: "failed" });
    });
    expect(await screen.findByText("kind-b")).toBeInTheDocument();
    const user = userEvent.setup();
    await openOperations(user);
    const drawer = await screen.findByRole("dialog", { name: "Operations" });
    expect(within(drawer).getByRole("region", { name: "In progress" })).toHaveTextContent("kind-b");
  });

  it("switches the language through the backend setting", async () => {
    const user = userEvent.setup();
    const fake = fakeBackend([]);
    render(<App backend={fake.backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    const select = await screen.findByRole("combobox", { name: "Language" });
    await chooseOption(user, select, "Português (Brasil)");
    expect(fake.backend.setAppSetting).toHaveBeenCalledWith("ui.language", "pt-BR");
    expect(await screen.findByRole("heading", { level: 1, name: "Configurações" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("pt-BR");
    const nav = screen.getAllByRole("navigation", { name: "Navegação principal" })[0]!;
    expect(within(nav).getByRole("button", { name: "Biblioteca" })).toBeInTheDocument();
    // The whole app renders twice (both languages) with role queries over it.
  }, 30000);

  it("translates coded backend errors (INV-OPS-05)", async () => {
    const user = userEvent.setup();
    const fake = fakeBackend([]);
    fake.backend.listAppSettings = async () => [setting("theme.density", "comfortable", ["comfortable", "compact", "bogus"])];
    render(<App backend={fake.backend} />);
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("tab", { name: "Theme" }));
    await chooseOption(user, await screen.findByRole("combobox", { name: "Table density" }), "bogus");
    expect(await screen.findByText("Could not save the setting")).toBeInTheDocument();
    expect(screen.getByText("The value bogus is not valid for theme.density.")).toBeInTheDocument();
  });

  it("opens the operations drawer with steps and structured errors", async () => {
    const user = userEvent.setup();
    const failed = op("f", "failed", {
      steps: [{ name: "extract", status: "failed" }],
      error: { code: "brand_new_failure", message: "bad header", step: "extract", retryable: true },
    });
    render(<App backend={fakeBackend([op("r", "running", { progress: { current: 2, total: 5 } }), failed]).backend} />);
    await openOperations(user);
    const drawer = await screen.findByRole("dialog", { name: "Operations" });
    expect(within(drawer).getByRole("region", { name: "In progress" })).toHaveTextContent("kind-r");
    expect(within(drawer).getByText("2 of 5")).toBeInTheDocument();
    expect(within(drawer).getByText("Unexpected error (brand_new_failure).")).toBeInTheDocument();
    expect(within(drawer).getByRole("img", { name: "Failed" })).toBeInTheDocument();
  });

  it("shows the technical log filtered by operation from the drawer", async () => {
    const user = userEvent.setup();
    const fake = fakeBackend([op("a", "failed")]);
    render(<App backend={fake.backend} />);
    await openOperations(user);
    const drawer = await screen.findByRole("dialog", { name: "Operations" });
    await user.click(within(drawer).getByRole("button", { name: "View log entries" }));
    expect(await screen.findByText("copy failed")).toBeInTheDocument();
    expect(screen.queryByText("startup")).not.toBeInTheDocument();
    expect(fake.logFilters.at(-1)).toMatchObject({ operation: "a" });
    await user.click(screen.getByRole("button", { name: "Show every operation" }));
    expect(await screen.findByText("startup")).toBeInTheDocument();
  });

  it("opens the command palette with Ctrl+K and runs a command", async () => {
    const user = userEvent.setup();
    render(<App backend={fakeBackend([]).backend} />);
    await screen.findByText("v1.2.3");
    await user.keyboard("{Control>}k{/Control}");
    const field = await screen.findByRole("textbox", { name: "Type a command or a screen" });
    await user.type(field, "technical");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Log" })).toHaveAttribute("aria-selected", "true");
  });
});
