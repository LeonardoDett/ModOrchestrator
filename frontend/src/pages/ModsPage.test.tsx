import { render, screen, waitFor, within } from "@testing-library/react";
import { openScreen } from "../test/shell";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { createOfflineBackend } from "../bridge/offline-backend";
import type { Backend, Category, FomodSelection, FomodView, ImportAnswer, ModDetails, ModRow, QueueItem } from "../bridge/types";

const row = (over: Partial<ModRow>): ModRow => ({
  id: "m1",
  name: "SkyUI",
  detectedName: "SkyUI",
  version: "5.2",
  author: "",
  category: "",
  categoryPath: [],
  state: "installed",
  enabled: true,
  size: 2048,
  files: 3,
  type: "default",
  typeName: "Default",
  content: ["plugin", "interface"],
  installer: "basic",
  source: "SkyUI.7z",
  hasNotes: false,
  queued: false,
  ...over,
});

function world() {
  const state = {
    mods: [
      row({ category: "c1", categoryPath: ["Interface"], categoryColor: "violet", categoryIcon: "monitor", tags: ["essencial"] }),
      row({ id: "m2", name: "Textures", enabled: false }),
      row({ id: "m3", name: "Pending", state: "imported" }),
    ],
    categories: [{ id: "c1", name: "Interface", order: 0, color: "violet", icon: "monitor" }] as Category[],
    queue: [] as QueueItem[],
    calls: [] as string[],
    answers: [] as ImportAnswer[],
    dropped: null as null | ((paths: string[]) => void),
    settings: [] as string[],
  };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const backend: Backend = {
    ...createOfflineBackend(),
    connected: true,
    getAppInfo: async () => ({ name: "Mod Orchestrator", version: "1", dataDir: "/d", schemaVersion: 4, interruptedOperations: 0, logsDir: "/l", customTitleBar: false }),
    listRecentOperations: async () => [],
    onOperationEvent: (l) => {
      listeners.add(l as () => void);
      return () => listeners.delete(l as () => void);
    },
    listAppSettings: async () => [],
    workspace: async () => ({ active: { id: "i1", name: "Skyrim", gameName: "Skyrim" }, instances: [{ id: "i1", name: "Skyrim", gameName: "Skyrim" }], items: ["overview", "mods"] }),
    modList: async () => state.mods,
    importQueue: async () => state.queue,
    categories: async () => state.categories,
    tags: async () => [{ name: "essencial", color: "amber", order: 0, mods: 1 }],
    listInstanceSettings: async () => [],
    setInstanceSetting: async (_i, key, value) => {
      state.settings.push(`${key}=${value}`);
    },
    installAll: async (_i, ids) => {
      state.calls.push(`installAll:${ids.join(",")}`);
      return ["op9"];
    },
    saveCategory: async (_i, c) => {
      state.calls.push(`category:${c.name}:${c.parent ?? ""}:${c.color ?? ""}:${c.icon ?? ""}`);
      state.categories = [...state.categories, { ...c, id: "c2" }];
      notify();
      return "c2";
    },
    modDetails: async (id): Promise<ModDetails> => ({
      ...state.mods.find((m) => m.id === id)!,
      description: "",
      notes: "",
      tags: state.mods.find((m) => m.id === id)!.tags ?? [],
      modTypes: [],
      installation: {
        id: "in1",
        installer: id === "m1" ? "fomod" : "basic",
        options: {},
        files: 1160,
        size: 1,
        createdAt: "2026-10-01T00:00:00Z",
        ...(id === "m1" ? { choices: [{ step: 0, stepName: "Base", group: 0, groupName: "Resolution", names: ["2K"] }] } : {}),
      },
    }),
    modFiles: async () => ({ total: 0, files: [] }),
    modHistory: async () => [],
    modSummary: async () => ({ conflicts: { opponents: 3, winsAgainst: 2, losesTo: 1 }, requirements: { total: 2, present: 1 } }),
    modExtensions: async () => [
      { ext: ".dds", files: 742, size: 1 },
      { ext: ".nif", files: 418, size: 1 },
    ],
    modConflicts: async (_i, id) => ({ mod: { id, name: id, priority: 1, enabled: true }, indicator: "none", opponents: [] }),
    setModsEnabled: async (_i, ids, enabled) => {
      state.calls.push(`enable:${ids.join(",")}:${enabled}`);
      state.mods = state.mods.map((m) => (ids.includes(m.id) ? { ...m, enabled } : m));
    },
    importFiles: async (_i, paths) => {
      state.calls.push(`import:${paths.join(",")}`);
      return ["op1"];
    },
    pickImportFiles: async () => {
      state.calls.push("pick");
      return [];
    },
    resolveImport: async (_op, answer) => {
      state.answers.push(answer);
      state.queue = [];
      notify();
    },
    previewModRemoval: async (_i, ids) => ({ mods: ids.map((id) => ({ id, name: id, version: "" })), orphanRules: 1, sharedArchives: [], deployed: false }),
    removeMods: async (_i, ids, withArchives) => {
      state.calls.push(`remove:${ids.join(",")}:${withArchives}`);
      return "op";
    },
    onFileDrop: (listener) => {
      state.dropped = listener;
      return () => (state.dropped = null);
    },
  };
  return { state, backend, notify };
}

async function openMods(user: ReturnType<typeof userEvent.setup>) {
  await openScreen(user, "Mods");
}

/** A decision waits in the queue: the band opens the queue, the item opens the dialog. */
async function openDecision(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Open queue" }));
  const queue = await screen.findByRole("dialog", { name: "Install queue" });
  await user.click(within(queue).getByRole("button", { name: "Choose options" }));
}

describe("Mods screen (F4)", () => {
  beforeEach(() => localStorage.clear());

  it("lists mods with an accessible status toggle that asks the backend", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await openMods(user);

    const toggle = await screen.findByRole("switch", { name: "Enable Textures" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    // A mod that is not installed cannot be toggled.
    expect(screen.getByRole("switch", { name: "Enable Pending" })).toBeDisabled();
    await user.click(toggle);
    expect(state.calls).toContain("enable:m2:true");
    await waitFor(() => expect(screen.getByRole("switch", { name: "Disable Textures" })).toHaveAttribute("aria-checked", "true"));
  });

  it("filters by text and status without asking the backend", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    await user.type(screen.getByRole("textbox", { name: "Search by name or tag" }), "tex");
    expect(screen.queryByText("SkyUI")).not.toBeInTheDocument();
    expect(screen.getByText("Textures")).toBeInTheDocument();
  });

  it("imports dropped files and answers a root decision from the queue", async () => {
    const user = userEvent.setup();
    const { state, backend, notify } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");

    state.dropped?.(["C:\\Downloads\\Options.zip"]);
    await waitFor(() => expect(state.calls).toContain("import:C:\\Downloads\\Options.zip"));

    state.queue = [
      {
        operationId: "op1",
        kind: "import",
        label: "Options.zip",
        status: "running",
        step: "plan_install",
        cancellable: true,
        decision: { kind: "root_ambiguous", choices: ["root", "cancel"], duplicates: [], candidates: ["Option A", "Option B"], folders: ["Option A", "Option B"] },
      },
    ];
    notify();
    await openDecision(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Folder to install: Option A")).toBeInTheDocument();
    await user.click(within(dialog).getByText("Option B"));
    await user.click(within(dialog).getByRole("button", { name: "Install" }));
    expect(state.answers).toEqual([{ choice: "root", root: "Option B" }]);
  });

  it("runs the FOMOD wizard: the backend evaluates each click, the summary confirms requirements (DLG-06)", async () => {
    const user = userEvent.setup();
    const { state, backend, notify } = world();
    const asked: FomodSelection[][] = [];
    // A fake backend: 2K is Recommended, 4K adds an ini through a flag, the
    // Dawnguard patch is NotUsable. The UI must show what comes back.
    backend.fomodState = async (_op, selection) => {
      asked.push(selection);
      const chosen = selection.find((s) => s.step === 0 && s.group === 0)?.options ?? [0];
      const view: FomodView = {
        steps: [
          {
            index: 0,
            name: "Textures",
            visible: true,
            groups: [
              {
                index: 0,
                name: "Resolution",
                type: "SelectExactlyOne",
                options: [
                  { index: 0, name: "2K", description: "2K textures", type: "Recommended", selected: chosen.includes(0), locked: false, disabled: false },
                  { index: 1, name: "4K", description: "4K textures", type: "Optional", selected: chosen.includes(1), locked: false, disabled: false },
                ],
              },
              {
                index: 1,
                name: "Patches",
                type: "SelectAny",
                options: [{ index: 0, name: "Dawnguard patch", description: "", type: "NotUsable", selected: false, locked: false, disabled: true }],
              },
            ],
          },
        ],
        selection: [
          { step: 0, group: 0, options: chosen },
          { step: 0, group: 1, options: [] },
        ],
        problems: [],
        summary: {
          target: "data",
          files: chosen.includes(1) ? 3 : 2,
          size: 2048,
          folders: [
            { folder: "", files: 1 },
            { folder: "textures", files: 1 },
          ],
          warnings: [{ code: "fomod_missing_source", params: { source: "extras/readme.txt" } }],
          requirements: [{ file: "SkyUI_SE.esp", mod: "m1", modName: "SkyUI" }],
        },
      };
      return view;
    };
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    state.queue = [
      {
        operationId: "op1",
        kind: "import",
        label: "Wizard Mod.zip",
        status: "running",
        step: "plan_install",
        cancellable: true,
        decision: { kind: "fomod", choices: ["install", "cancel"], duplicates: [], candidates: [], folders: [], fomod: { module: "Wizard Mod", hasImage: false, previous: [], warnings: [] } },
      },
    ];
    notify();
    await openDecision(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Step 1 of 1")).toBeInTheDocument();
    expect(await within(dialog).findByRole("radio", { name: "2K" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByText("Recommended")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Dawnguard patch" })).toBeDisabled();
    expect(within(dialog).getByText("Not usable with your current setup.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: "4K" }));
    await waitFor(() => expect(within(dialog).getByRole("radio", { name: "4K" })).toHaveAttribute("aria-checked", "true"));
    expect(asked.at(-1)).toEqual([{ step: 0, group: 0, options: [1] }]);

    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(await within(dialog).findByText("Files by destination")).toBeInTheDocument();
    // Your choices by step, the two numbers and the files by destination.
    expect(within(dialog).getByText("Your choices")).toBeInTheDocument();
    expect(within(dialog).getAllByText("4K").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("3")).toBeInTheDocument();
    expect(within(dialog).getByText("data/textures")).toBeInTheDocument();
    // The mod can be organized before it is installed (B10).
    await user.click(within(dialog).getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Interface" }));
    await user.type(within(dialog).getByRole("combobox", { name: "New tag" }), "4K{Enter}");
    expect(within(dialog).getByText("The installer refers to extras/readme.txt, which is not in the archive; it was skipped.")).toBeInTheDocument();
    // No rule without an explicit action (INV-CON-02): unchecked by default.
    const requirement = within(dialog).getByRole("checkbox", { name: "Create a requirement rule: this mod requires SkyUI (SkyUI_SE.esp)" });
    expect(requirement).toHaveAttribute("aria-checked", "false");
    await user.click(requirement);
    await user.click(within(dialog).getByRole("button", { name: "Install" }));
    expect(state.answers).toEqual([
      {
        choice: "install",
        fomod: [
          { step: 0, group: 0, options: [1] },
          { step: 0, group: 1, options: [] },
        ],
        requirements: ["SkyUI_SE.esp"],
        category: "c1",
        tags: ["4K"],
      },
    ]);
  });

  it("reinstalls a FOMOD with the previous choices in one click (D030)", async () => {
    const user = userEvent.setup();
    const { state, backend, notify } = world();
    backend.fomodState = async (_op, selection) => ({
      steps: [{ index: 0, name: "Main", visible: true, groups: [{ index: 0, name: "Version", type: "SelectExactlyOne", options: [{ index: 0, name: "AE", description: "", type: "Optional", selected: selection.length === 0, locked: false, disabled: false }, { index: 1, name: "SE", description: "", type: "Optional", selected: selection.length > 0, locked: false, disabled: false }] }] }],
      selection: [{ step: 0, group: 0, options: selection.length ? [1] : [0] }],
      problems: [],
      summary: { files: 1, size: 1, folders: [], warnings: [], requirements: [] },
    });
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    const previous = [{ step: 0, group: 0, options: [1] }];
    state.queue = [
      {
        operationId: "op2",
        kind: "reinstall",
        label: "Engine Fixes",
        status: "running",
        cancellable: true,
        decision: { kind: "fomod", choices: ["install", "cancel"], duplicates: [], candidates: [], folders: [], fomod: { module: "Engine Fixes", hasImage: false, previous, warnings: [] } },
      },
    ];
    notify();
    await openDecision(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The choices of the previous installation are loaded.")).toBeInTheDocument();
    expect(await within(dialog).findByRole("radio", { name: "SE" })).toHaveAttribute("aria-checked", "true");
    // The option chosen last time is marked, so changing it is a clear decision.
    expect(within(dialog).getByText("Previous choice")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Install with the previous choices" }));
    expect(state.answers).toEqual([{ choice: "install", fomod: previous }]);
  });

  it("removes selected mods through DLG-07, reporting orphan rules", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    screen.getByRole("grid").focus();
    await user.keyboard("{Enter}");
    const detail = await screen.findByRole("dialog", { name: "SkyUI" });
    await user.click(within(detail).getByRole("button", { name: "Remove…" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/1 rule mentions these mods/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: /Also remove the original files/ }));
    await user.click(within(dialog).getByRole("button", { name: "Remove…" }));
    await waitFor(() => expect(state.calls).toContain("remove:m1:true"));
  });

  it("shows the header counts, the quick filter and the category and tags of each mod", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    expect(screen.getByText("of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText("essencial")).toBeInTheDocument();
    expect(screen.getAllByText("Interface").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("radio", { name: /Disabled/ }));
    expect(screen.queryByText("SkyUI")).not.toBeInTheDocument();
    expect(screen.getByText("Textures")).toBeInTheDocument();
  });

  it("switches the view, saves it for the game and lists the categories as tabs", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    await user.click(screen.getByRole("radio", { name: "Tabs" }));
    await waitFor(() => expect(state.settings).toContain("mods.view=tabs"));
    const tabs = screen.getByRole("tablist", { name: "Categories" });
    await user.click(within(tabs).getByRole("tab", { name: /Interface/ }));
    expect(screen.getByText("SkyUI")).toBeInTheDocument();
    expect(screen.queryByText("Textures")).not.toBeInTheDocument();
    await user.click(within(tabs).getByRole("tab", { name: /No category/ }));
    expect(screen.getByText("Textures")).toBeInTheDocument();
  });

  it("invites to create a category when a game has none (generic game)", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    state.categories = [];
    state.mods = state.mods.map((m) => ({ ...m, category: "", categoryPath: [], categoryColor: undefined, categoryIcon: undefined }));
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    await user.click(screen.getByRole("radio", { name: "Tabs" }));
    expect(await screen.findByText("No categories yet. Create one to see the mods by category.")).toBeInTheDocument();
  });

  it("installs every imported mod from the queue in one go (D124)", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    await user.click(screen.getByRole("button", { name: "Install queue, 1 item" }));
    const queue = await screen.findByRole("dialog", { name: "Install queue" });
    expect(within(queue).getByText("Pending")).toBeInTheDocument();
    await user.click(within(queue).getByRole("button", { name: "Install 1" }));
    await waitFor(() => expect(state.calls).toContain("installAll:m3"));
  });

  it("creates a category with a palette color and an icon in the Organization dialog (D123)", async () => {
    const user = userEvent.setup();
    const { state, backend } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Categories and tags" }));
    const dialog = await screen.findByRole("dialog", { name: "Mod organization" });
    await user.click(within(dialog).getByRole("button", { name: "New category" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Category name" }), "Textures");
    await user.click(within(dialog).getByRole("radio", { name: "Green" }));
    await user.click(within(dialog).getByRole("radio", { name: "Image" }));
    await user.click(within(dialog).getByRole("button", { name: "Save category" }));
    await waitFor(() => expect(state.calls).toContain("category:Textures::green:image"));
  });

  it("opens the mod detail with its numbers, files by type, installer choices and Next (D121)", async () => {
    const user = userEvent.setup();
    const { backend } = world();
    render(<App backend={backend} />);
    await openMods(user);
    await screen.findByText("SkyUI");
    screen.getByRole("grid").focus();
    await user.keyboard("{Enter}");
    const detail = await screen.findByRole("dialog", { name: "SkyUI" });
    expect(await within(detail).findByText("1/2")).toBeInTheDocument();
    expect(within(detail).getByText("essencial")).toBeInTheDocument();
    expect(within(detail).getByText("Mod 1 of 3 · Esc closes")).toBeInTheDocument();

    await user.click(within(detail).getByRole("tab", { name: /Files/ }));
    expect(await within(detail).findByRole("img", { name: /Files by type/ })).toBeInTheDocument();

    await user.click(within(detail).getByRole("tab", { name: "Installation" }));
    expect(await within(detail).findByText("Choices in the mod installer")).toBeInTheDocument();
    expect(within(detail).getByText("2K")).toBeInTheDocument();

    await user.click(within(detail).getByRole("button", { name: "Next" }));
    const next = await screen.findByRole("dialog", { name: "Textures" });
    await user.click(within(next).getByRole("tab", { name: "Installation" }));
    // Without a wizard there are no recorded choices (generic installer).
    await waitFor(() => expect(within(next).queryByText("Choices in the mod installer")).not.toBeInTheDocument());
  });
});
