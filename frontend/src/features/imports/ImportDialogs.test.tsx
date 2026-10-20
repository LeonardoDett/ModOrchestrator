import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "dettmann-ui";
import { BackendProvider } from "../../bridge/backend-context";
import { createOfflineBackend } from "../../bridge/offline-backend";
import type { Backend, ImportOptions, ImportPreview, ImportSource } from "../../bridge/types";
import { I18nProvider } from "../../i18n/i18n";
import { ImportOfferDialog } from "./ImportDialogs";

const MO2: ImportSource = { manager: "mo2", path: "D:\\MO2", name: "Skyrim", gameRef: "Skyrim Special Edition", gamePath: "D:\\Game", location: "D:\\MO2" };

// A generic game: the backend lists no plugin parts (D128).
const PREVIEW: ImportPreview = {
  source: MO2,
  parts: ["mods", "order", "categories"],
  defaults: ["mods", "order"],
  mods: 3,
  active: 2,
  plugins: 0,
  files: 9,
  size: 3 * 1024 * 1024,
  freeSpace: 100 * 1024 * 1024 * 1024,
  modList: [
    { key: "a", name: "Alpha", files: 3, size: 1024 * 1024 },
    { key: "b", name: "Bravo", files: 3, size: 1024 * 1024 },
    { key: "c", name: "Charlie", files: 3, size: 1024 * 1024 },
  ],
  skipped: [],
  separators: 1,
  orderRules: 0,
  dependencies: 0,
  incompatibilities: 0,
  profiles: [
    { name: "Default", active: true, mods: 3, enabled: 2, plugins: 0, loadOrder: 0 },
    { name: "Second", active: false, mods: 3, enabled: 1, plugins: 0, loadOrder: 0 },
  ],
  categories: 2,
  existing: 0,
  deployed: false,
};

function setup() {
  const started: ImportOptions[] = [];
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    importSources: async () => [MO2],
    importPreview: async () => PREVIEW,
    importStart: async (_i, _s, o) => {
      started.push(o);
      return "op1";
    },
  };
  const onStarted = vi.fn();
  render(
    <BackendProvider backend={backend}>
      <I18nProvider language="pt-BR">
        <ToastProvider>
          <ImportOfferDialog instance="i1" gameName="Jogo" gameRoot="D:\Game" context="add" onClose={() => undefined} onStarted={onStarted} />
        </ToastProvider>
      </I18nProvider>
    </BackendProvider>,
  );
  return { started, onStarted };
}

describe("import dialogs (RD16, boards ImportarOferta and ImportarEscolha)", () => {
  it("offers everything with a generic preview: no plugin part anywhere", async () => {
    const { started, onStarted } = setup();
    const card = await screen.findByRole("radio", { name: /Mod Organizer 2/ });
    await waitFor(() => expect(within(card).getByText("3 mods, 2 ativos")).toBeInTheDocument());
    expect(within(card).getByText("ordem com 1 separadores")).toBeInTheDocument();
    expect(screen.queryByText(/plugins/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Começar do zero/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Importar tudo do Mod Organizer 2/ }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("op1"));
    expect(started[0]).toEqual({ parts: ["mods", "order"], profiles: ["Default", "Second"], exclude: [] });
  });

  it("chooses parts and profiles", async () => {
    const { started } = setup();
    await waitFor(() => expect(screen.getByRole("button", { name: /Escolher o que importar/ })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /Escolher o que importar/ }));
    expect(screen.getByRole("checkbox", { name: "Categorias do Mod Organizer 2" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("checkbox", { name: "Plugins e ordem de carga" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Second" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Categorias do Mod Organizer 2" }));
    expect(screen.getByText("1 de 2 escolhidos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Importar e abrir o jogo" }));
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]?.profiles).toEqual(["Default"]);
    expect(started[0]?.parts).toContain("categories");
  });
});
