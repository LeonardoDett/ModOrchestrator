import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Accordion } from "../components/accordion";
import { Checkbox } from "../components/checkbox";
import { Modal } from "../components/modal";
import { Drawer } from "../components/drawer";
import { ToastProvider, useToast } from "../components/toast";
import { Input } from "../components/input";
import { enUS } from "date-fns/locale";
import { Tag } from "../components/tag";
import { Inspector } from "../components/inspector";
import { Lightbox } from "../components/lightbox";
import { Pagination } from "../components/pagination";
import { Command } from "../components/command";
import { FilterBar } from "../components/filter-bar";
import { Gallery } from "../components/gallery";
import { Stepper } from "../components/stepper";
import { LogViewer } from "../components/log-viewer";
import { FeaturedIcon } from "../components/featured-icon";
import { ReorderableList } from "../components/reorderable-list";
import { Tree } from "../components/tree";
import { FileList } from "../components/file-list";
import { StatusToggle, type StatusToggleState } from "../components/status-toggle";
import { DataTable, type DataTableColumn } from "../components/data-table";
import { ConfirmDialog } from "../templates/confirm-dialog";
import { FileDropzone } from "../templates/file-dropzone";
import { Sidebar } from "../templates/sidebar";
import { Calendar, calendarLabelsEn } from "../templates/calendar";
import { CATALOG } from "../icons/catalog";
import { CircleCheckIcon } from "../icons/glyphs/circle-check";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = Element.prototype as unknown as { animate?: AnimateFn };
let spy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  spy = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation);
  proto.animate = spy as unknown as AnimateFn;
});
afterEach(() => {
  delete proto.animate;
});

function Notify() {
  const { addToast } = useToast();
  return (
    <button type="button" onClick={() => addToast({ description: "Saved", duration: 0 })}>
      Notify
    </button>
  );
}

const fixtures: Array<[string, () => React.ReactElement, string]> = [
  [
    "Accordion trigger",
    () => (
      <Accordion.Root>
        <Accordion.Item value="a">
          <Accordion.Trigger value="a">A</Accordion.Trigger>
          <Accordion.Content value="a">Body</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    ),
    "chevron-down",
  ],
  [
    "Modal close",
    () => (
      <Modal.Root open onOpenChange={() => {}}>
        <Modal.Content>
          <Modal.CloseButton />
        </Modal.Content>
      </Modal.Root>
    ),
    "x",
  ],
  [
    "Drawer close",
    () => (
      <Drawer.Root open onOpenChange={() => {}}>
        <Drawer.Content>
          <Drawer.CloseButton />
        </Drawer.Content>
      </Drawer.Root>
    ),
    "x",
  ],
  ["Checkbox", () => <Checkbox defaultChecked aria-label="c" />, "check"],
  ["Checkbox indeterminate", () => <Checkbox indeterminate aria-label="c" />, "minus"],
];

test.each(fixtures)("%s renders the catalog icon", (_, ui, name) => {
  render(ui());
  expect(document.querySelector(`[data-animated-icon="${name}"]`)).not.toBeNull();
});

test("Toast close renders the catalog icon", () => {
  render(
    <ToastProvider>
      <Notify />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("Notify"));
  expect(document.querySelector('[data-animated-icon="x"]')).not.toBeNull();
});

test("Combobox arrow renders the catalog icon", () => {
  const { container } = render(
    <Input.Root>
      <Input.Combobox options={[{ value: "a", label: "A" }]} aria-label="c" />
    </Input.Root>,
  );
  expect(container.querySelector('[data-animated-icon="chevron-down"]')).not.toBeNull();
});

test("Checkbox draws the check when it becomes checked, not on mount nor on uncheck", () => {
  function Controlled() {
    const [c, setC] = useState(false);
    return <Checkbox checked={c} onCheckedChange={setC} aria-label="c" />;
  }
  render(<Controlled />);
  expect(spy).toHaveBeenCalledTimes(0);
  act(() => {
    fireEvent.click(screen.getByRole("checkbox"));
  });
  expect(spy).toHaveBeenCalledTimes(1);
  const target = spy.mock.contexts[0] as Element;
  expect(target.getAttribute("data-part")).toBe("check");
  const frames = spy.mock.calls[0]![0] as Keyframe[];
  expect(frames.every((f) => "strokeDashoffset" in f)).toBe(true);
  act(() => {
    fireEvent.click(screen.getByRole("checkbox"));
  });
  expect(spy).toHaveBeenCalledTimes(1);
});

// Sem @types/node no projeto: especificador não literal, tipado localmente.
const NODE_FS: string = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
  readdirSync(path: URL, options: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
  readFileSync(path: URL, encoding: "utf8"): string;
};

const stateLabels: Record<StatusToggleState, string> = { on: "On", off: "Off", unavailable: "N/A", busy: "Busy" };
const dtColumns: DataTableColumn<{ id: string; name: string }>[] = [
  { id: "name", label: "Name", cell: (i) => i.name, sortable: true },
];
const dtRows = [{ id: "a", name: "Alpha" }];
const calProps = { locale: enUS, labels: calendarLabelsEn, defaultCursorDate: new Date(2026, 0, 15), defaultItems: [] };
const twoItems = [
  { id: "a", data: "A" },
  { id: "b", data: "B" },
];
const reorderable = () => <ReorderableList items={twoItems} onReorder={() => {}} renderItem={(i) => <span>{i.data}</span>} />;
const treeWithChild = () => <Tree nodes={[{ id: "r", label: "R", children: [{ id: "c", label: "C" }] }]} />;
const lightbox2 = () => <Lightbox open items={[{ id: "1", src: "a.png" }, { id: "2", src: "b.png" }]} onClose={() => {}} />;
const logOf = (level: "info" | "success" | "warning" | "error") => () => (
  <LogViewer entries={[{ id: "1", level, message: "m" }]} />
);
const pagination = () => <Pagination currentPage={2} totalPages={5} onPageChange={() => {}} />;
const sidebar = () => <Sidebar.Root items={[{ id: "a", label: "Alpha" }]} />;
const confirm = (type: "danger" | "warning" | "info" | "success") => () => (
  <ConfirmDialog open onOpenChange={() => {}} type={type} title="T" />
);

const adoption: Array<[string, () => React.ReactElement, string]> = [
  ["Tag remove", () => <Tag onRemove={() => {}}>t</Tag>, "x"],
  ["Inspector close", () => <Inspector title="T" onClose={() => {}}>b</Inspector>, "x"],
  ["Lightbox close", () => <Lightbox open items={[{ id: "1", src: "a.png" }]} onClose={() => {}} />, "x"],
  ["Lightbox prev", lightbox2, "chevron-left"],
  ["Lightbox next", lightbox2, "chevron-right"],
  ["Pagination first", pagination, "chevron-first"],
  ["Pagination last", pagination, "chevron-last"],
  ["Pagination prev", pagination, "chevron-left"],
  ["Pagination next", pagination, "chevron-right"],
  ["Command search", () => <Command items={[{ id: "a", label: "A", value: "a" }]} />, "search"],
  ["FilterBar search", () => <FilterBar />, "search"],
  ["FilterBar filter", () => <FilterBar onFiltersClick={() => {}} />, "filter"],
  ["Gallery.Add", () => <Gallery.Add />, "plus"],
  [
    "Stepper completed",
    () => (
      <Stepper.Root value={1}>
        <Stepper.Step index={0}>
          <Stepper.StepIndicator />
        </Stepper.Step>
      </Stepper.Root>
    ),
    "check",
  ],
  ["LogViewer info", logOf("info"), "info"],
  ["LogViewer success", logOf("success"), "circle-check"],
  ["LogViewer warning", logOf("warning"), "triangle-alert"],
  ["LogViewer error", logOf("error"), "circle-alert"],
  ["LogViewer search", () => <LogViewer entries={[]} />, "search"],
  ["FeaturedIcon accepts a catalog icon", () => <FeaturedIcon icon={CircleCheckIcon} intent="success" />, "circle-check"],
  ["ReorderableList up", reorderable, "chevron-up"],
  ["ReorderableList down", reorderable, "chevron-down"],
  ["Tree chevron", treeWithChild, "chevron-right"],
  ["Tree folder", treeWithChild, "folder"],
  ["Tree file", () => <Tree nodes={[{ id: "r", label: "R" }]} />, "file"],
  ["FileList folder", () => <FileList items={[{ id: "1", name: "a", kind: "folder" }]} />, "folder"],
  ["FileList file", () => <FileList items={[{ id: "1", name: "a" }]} />, "file"],
  ["StatusToggle on", () => <StatusToggle state="on" label="x" stateLabels={stateLabels} />, "check"],
  ["StatusToggle off", () => <StatusToggle state="off" label="x" stateLabels={stateLabels} />, "minus"],
  ["StatusToggle unavailable", () => <StatusToggle state="unavailable" label="x" stateLabels={stateLabels} />, "ban"],
  [
    "Input.Number decrement",
    () => (
      <Input.Root>
        <Input.Box>
          <Input.Number />
        </Input.Box>
      </Input.Root>
    ),
    "minus",
  ],
  [
    "Input.Number increment",
    () => (
      <Input.Root>
        <Input.Box>
          <Input.Number />
        </Input.Box>
      </Input.Root>
    ),
    "plus",
  ],
  [
    "Input.Select arrow",
    () => (
      <Input.Root>
        <Input.Box>
          <Input.Select options={[{ value: "a", label: "A" }]} aria-label="s" />
        </Input.Box>
      </Input.Root>
    ),
    "chevron-down",
  ],
  [
    "DataTable sort",
    () => <DataTable aria-label="t" columns={dtColumns} rows={dtRows} getRowId={(i) => i.id} />,
    "arrow-up-down",
  ],
  ["ConfirmDialog danger", confirm("danger"), "trash"],
  ["ConfirmDialog warning", confirm("warning"), "triangle-alert"],
  ["ConfirmDialog info", confirm("info"), "info"],
  ["ConfirmDialog success", confirm("success"), "check"],
  ["FileDropzone", () => <FileDropzone title="Upload" />, "upload"],
  ["Sidebar collapse", sidebar, "panel-left-close"],
  ["Sidebar mobile menu", sidebar, "menu"],
  ["Calendar header prev", () => <Calendar {...calProps} />, "chevron-left"],
  ["Calendar header next", () => <Calendar {...calProps} />, "chevron-right"],
  ["Calendar search", () => <Calendar {...calProps} onSearchClick={() => {}} />, "search"],
  ["Calendar add event", () => <Calendar {...calProps} onAddEvent={() => {}} />, "plus"],
];

test.each(adoption)("%s renders the catalog icon", (_, ui, name) => {
  render(ui());
  expect(document.querySelector(`[data-animated-icon="${name}"]`)).not.toBeNull();
});

function sourceFiles(dir: URL): URL[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(new URL(`${entry.name}/`, dir));
    return /\.tsx?$/.test(entry.name) ? [new URL(entry.name, dir)] : [];
  });
}

/** Renomes lucide -> catálogo; o resto vira kebab direto do PascalCase. */
const LUCIDE_TO_CATALOG: Record<string, string> = {
  Trash2: "trash",
  AlertTriangle: "triangle-alert",
  AlertCircle: "circle-alert",
  CheckCircle: "circle-check",
  CheckCircle2: "circle-check",
};

function kebab(name: string): string {
  return LUCIDE_TO_CATALOG[name] ?? name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

test("no component imports a lucide glyph that exists in the catalog", () => {
  const catalog = new Set(CATALOG.map((c) => c.definition.name));
  const offenders: string[] = [];
  for (const dir of ["../components/", "../templates/"]) {
    for (const file of sourceFiles(new URL(dir, import.meta.url))) {
      const code = fs.readFileSync(file, "utf8");
      for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
        for (const raw of m[1]!.split(",")) {
          const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!;
          if (name && catalog.has(kebab(name))) offenders.push(`${file.pathname}: ${name}`);
        }
      }
    }
  }
  expect(offenders).toEqual([]);
});

test("Sidebar items and sections accept a catalog icon", () => {
  render(
    <Sidebar.Root
      sections={[{ id: "s", items: [{ id: "h", label: "Home", icon: CircleCheckIcon }] }]}
    />,
  );
  expect(document.querySelector('[data-animated-icon="circle-check"]')).not.toBeNull();
});
