import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createOfflineBackend } from "../../bridge/offline-backend";
import type { Backend, RecoveryBackup, StartupRecovery } from "../../bridge/types";
import { RecoveryApp } from "./RecoveryApp";

const recovery = (over: Partial<StartupRecovery> = {}): StartupRecovery => ({
  active: true,
  reason: "corrupt",
  detail: "sqlite: database is corrupt: database disk image is malformed",
  language: "en",
  dataDir: "C:/Users/x/AppData/Roaming/ModOrchestrator",
  backupsDir: "C:/Users/x/AppData/Roaming/ModOrchestrator/backups",
  ...over,
});

const backups: RecoveryBackup[] = [
  { id: "state-20261008T120000.000Z-damaged.db", kind: "damaged", at: "2026-10-08T12:00:00Z", size: 4096, schema: 0, valid: false },
  { id: "state-20261008T110000.000Z-auto.db", kind: "auto", at: "2026-10-08T11:00:00Z", size: 8192, schema: 8, valid: true },
  { id: "state-20261007T110000.000Z-manual.db", kind: "manual", at: "2026-10-07T11:00:00Z", size: 8192, schema: 8, valid: true },
];

function fake(list = backups) {
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    recoveryBackups: vi.fn(async () => list),
    recoveryRestore: vi.fn(async () => {}),
    recoveryStartFresh: vi.fn(async () => {}),
    recoveryOpenFolder: vi.fn(async () => {}),
    recoveryQuit: vi.fn(async () => {}),
  };
  return backend;
}

describe("RecoveryScreen (core/14 §5)", () => {
  it("restores the newest valid backup by default; damaged ones cannot be chosen", async () => {
    const backend = fake();
    render(<RecoveryApp backend={backend} recovery={recovery()} />);
    expect(screen.getByRole("heading", { name: "The database is damaged" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing was changed/)).toBeInTheDocument();
    const list = await screen.findByRole("radiogroup", { name: "Restore a backup" });
    const radios = within(list).getAllByRole("radio");
    expect(radios[0]).toBeDisabled();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(within(list).getByText("Cannot be used")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore and restart" }));
    expect(backend.recoveryRestore).toHaveBeenCalledWith("state-20261008T110000.000Z-auto.db");
  });

  it("starts from scratch only after confirming the consequences", async () => {
    const backend = fake([]);
    render(<RecoveryApp backend={backend} recovery={recovery()} />);
    expect(await screen.findByText("There are no backups in the backups folder.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore and restart" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Start from scratch…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/No file is deleted/)).toBeInTheDocument();
    expect(backend.recoveryStartFresh).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Start from scratch and restart" }));
    expect(backend.recoveryStartFresh).toHaveBeenCalled();
  });

  it("shows a failed action and keeps the screen usable", async () => {
    const backend = fake();
    backend.recoveryRestore = vi.fn(async () => {
      throw new Error(JSON.stringify({ code: "backup_invalid", params: { backup: "x" }, detail: "bad" }));
    });
    render(<RecoveryApp backend={backend} recovery={recovery()} />);
    await screen.findByRole("radiogroup");
    await userEvent.click(screen.getByRole("button", { name: "Restore and restart" }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: "Restore and restart" })).toBeEnabled();
  });

  it("speaks the OS language and explains a newer schema", async () => {
    render(<RecoveryApp backend={fake()} recovery={recovery({ reason: "newer_schema", language: "pt-BR" })} />);
    expect(screen.getByRole("heading", { name: "Este banco de dados é de uma versão mais nova" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abrir pasta de backups" }));
  });
});
