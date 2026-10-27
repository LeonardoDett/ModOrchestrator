import { useState } from "react";
import { act, render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  applySelection,
  buildDisplayItems,
  DataTable,
  DataTableColumnPicker,
  nextSort,
  selectionIntent,
  type DataTableColumn,
} from "../components/data-table";
import { clampWidth } from "../components/data-table/data-table.model";

interface Item {
  id: string;
  name: string;
  size: number;
  kind: string;
}

const items: Item[] = [
  { id: "a", name: "Alpha", size: 3, kind: "x" },
  { id: "b", name: "Beta", size: 1, kind: "y" },
  { id: "c", name: "Gamma", size: 2, kind: "x" },
  { id: "d", name: "Delta", size: 4, kind: "y" },
];

const columns: DataTableColumn<Item>[] = [
  { id: "name", label: "Name", cell: (i) => i.name, sortable: true, grow: true },
  { id: "size", label: "Size", cell: (i) => i.size, numeric: true, width: 80 },
  { id: "kind", label: "Kind", cell: (i) => i.kind, hideable: false },
];

const rowNamed = (name: string) => screen.getByText(name).closest('[role="row"]') as HTMLElement;
const selectedNames = () =>
  screen
    .getAllByRole("row")
    .filter((row) => row.getAttribute("aria-selected") === "true")
    .map((row) => within(row).getAllByRole("gridcell")[0]!.textContent);

describe("DataTable model", () => {
  const order = ["a", "b", "c", "d"];

  it("maps modifiers to intents and ignores them outside multiple mode", () => {
    expect(selectionIntent({}, "multiple")).toBe("replace");
    expect(selectionIntent({ ctrlKey: true }, "multiple")).toBe("toggle");
    expect(selectionIntent({ metaKey: true }, "multiple")).toBe("toggle");
    expect(selectionIntent({ shiftKey: true }, "multiple")).toBe("range");
    expect(selectionIntent({ shiftKey: true, ctrlKey: true }, "multiple")).toBe("range-add");
    expect(selectionIntent({ shiftKey: true, ctrlKey: true }, "single")).toBe("replace");
  });

  it("applies replace, toggle, range and additive range", () => {
    let state = applySelection({ selected: new Set(), anchor: null }, order, "b", "replace");
    expect([...state.selected]).toEqual(["b"]);
    state = applySelection(state, order, "d", "range");
    expect([...state.selected]).toEqual(["b", "c", "d"]);
    expect(state.anchor).toBe("b");
    state = applySelection(state, order, "a", "range");
    expect([...state.selected]).toEqual(["a", "b"]);
    state = applySelection(state, order, "c", "toggle");
    expect([...state.selected].sort()).toEqual(["a", "b", "c"]);
    expect(state.anchor).toBe("c");
    state = applySelection(state, order, "c", "toggle");
    expect([...state.selected].sort()).toEqual(["a", "b"]);
    state = applySelection({ selected: new Set(["a"]), anchor: "c" }, order, "d", "range-add");
    expect([...state.selected].sort()).toEqual(["a", "c", "d"]);
  });

  it("groups rows by first appearance and hides collapsed groups", () => {
    const flat = buildDisplayItems(items, (i) => i.id);
    expect(flat.map((i) => i.key)).toEqual(["a", "b", "c", "d"]);

    const grouped = buildDisplayItems(items, (i) => i.id, (i) => i.kind);
    expect(grouped.map((i) => (i.kind === "group" ? `[${i.group}:${i.count}]` : i.key))).toEqual([
      "[x:2]",
      "a",
      "c",
      "[y:2]",
      "b",
      "d",
    ]);

    const collapsed = buildDisplayItems(items, (i) => i.id, (i) => i.kind, new Set(["x"]));
    expect(collapsed.map((i) => (i.kind === "group" ? `[${i.group}]` : i.key))).toEqual(["[x]", "[y]", "b", "d"]);
  });

  it("cycles sort asc -> desc -> none and clamps widths", () => {
    expect(nextSort(null, "name")).toEqual({ columnId: "name", direction: "asc" });
    expect(nextSort({ columnId: "name", direction: "asc" }, "name")).toEqual({ columnId: "name", direction: "desc" });
    expect(nextSort({ columnId: "name", direction: "desc" }, "name")).toBeNull();
    expect(nextSort({ columnId: "name", direction: "desc" }, "size")).toEqual({ columnId: "size", direction: "asc" });
    expect(clampWidth(10)).toBe(48);
    expect(clampWidth(5000, 48, 400)).toBe(400);
  });
});

describe("DataTable", () => {
  it("renders an accessible grid with headers and rows", () => {
    render(<DataTable aria-label="Files" columns={columns} rows={items} getRowId={(i) => i.id} />);
    const grid = screen.getByRole("grid", { name: "Files" });
    expect(grid).toHaveAttribute("aria-multiselectable", "true");
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Size", "Kind"]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "none");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("selects with click, Ctrl+click and Shift+click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DataTable aria-label="Files" columns={columns} rows={items} getRowId={(i) => i.id} onSelectedIdsChange={onChange} />,
    );
    await user.click(screen.getByText("Beta"));
    expect(selectedNames()).toEqual(["Beta"]);
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("Delta"));
    await user.keyboard("{/Control}");
    expect(selectedNames()).toEqual(["Beta", "Delta"]);
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("Alpha"));
    await user.keyboard("{/Shift}");
    // Range from the anchor (Delta, last toggled) to Alpha.
    expect(selectedNames()).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(onChange).toHaveBeenLastCalledWith(new Set(["d", "c", "b", "a"]));
    expect(rowNamed("Alpha")).toHaveAttribute("data-selected", "true");
  });

  it("drives the cursor and selection from the keyboard", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onRowKeyDown = vi.fn();
    render(
      <DataTable
        aria-label="Files"
        columns={columns}
        rows={items}
        getRowId={(i) => i.id}
        onRowActivate={onActivate}
        onRowKeyDown={(event, row) => event.key === " " && onRowKeyDown(row.id)}
      />,
    );
    const grid = screen.getByRole("grid");
    act(() => grid.focus());
    expect(grid).toHaveAttribute("aria-activedescendant", rowNamed("Alpha").id);

    await user.keyboard("{ArrowDown}");
    expect(selectedNames()).toEqual(["Beta"]);
    await user.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    expect(selectedNames()).toEqual(["Beta", "Gamma", "Delta"]);
    await user.keyboard("{Home}");
    expect(selectedNames()).toEqual(["Alpha"]);
    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(selectedNames()).toEqual(["Alpha"]);
    expect(grid).toHaveAttribute("aria-activedescendant", rowNamed("Beta").id);
    await user.keyboard("{Control>} {/Control}");
    expect(selectedNames()).toEqual(["Alpha", "Beta"]);
    await user.keyboard("{Control>}a{/Control}");
    expect(selectedNames()).toHaveLength(4);

    await user.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledWith(items[1]);
    await user.keyboard(" ");
    expect(onRowKeyDown).toHaveBeenCalledWith("b");
  });

  it("supports controlled selection and single mode", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [ids, setIds] = useState<ReadonlySet<string>>(new Set(["c"]));
      return (
        <DataTable
          aria-label="Files"
          columns={columns}
          rows={items}
          getRowId={(i) => i.id}
          selectionMode="single"
          selectedIds={ids}
          onSelectedIdsChange={setIds}
        />
      );
    }
    render(<Controlled />);
    expect(selectedNames()).toEqual(["Gamma"]);
    expect(screen.getByRole("grid")).not.toHaveAttribute("aria-multiselectable");
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("Alpha"));
    await user.keyboard("{/Control}");
    expect(selectedNames()).toEqual(["Alpha"]);
  });

  it("requests sorting without reordering rows itself", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<DataTable aria-label="Files" columns={columns} rows={items} getRowId={(i) => i.id} onSortChange={onSort} />);
    const header = screen.getByRole("columnheader", { name: /Name/ });
    await user.click(within(header).getByRole("button"));
    expect(onSort).toHaveBeenLastCalledWith({ columnId: "name", direction: "asc" });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(screen.getAllByRole("row").slice(1).map((r) => r.textContent?.slice(0, 5))).toEqual([
      "Alpha",
      "Beta1",
      "Gamma",
      "Delta",
    ]);
  });

  it("resizes columns from the keyboard", async () => {
    const user = userEvent.setup();
    const onWidths = vi.fn();
    render(
      <DataTable aria-label="Files" columns={columns} rows={items} getRowId={(i) => i.id} onColumnWidthsChange={onWidths} labels={{ resizeColumn: "Resize" }} />,
    );
    const handle = screen.getByRole("separator", { name: "Resize Size" });
    expect(handle).toHaveAttribute("aria-valuenow", "80");
    act(() => handle.focus());
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "112");
    expect(onWidths).toHaveBeenLastCalledWith({ size: 112 });
    await user.keyboard("{ArrowLeft}");
    expect(handle).toHaveAttribute("aria-valuenow", "96");
  });

  it("hides columns through the column picker and keeps locked ones", async () => {
    const user = userEvent.setup();
    function WithPicker() {
      const [hidden, setHidden] = useState<string[]>([]);
      return (
        <>
          <DataTableColumnPicker label="Columns" columns={columns} hiddenColumns={hidden} onHiddenColumnsChange={setHidden} />
          <DataTable aria-label="Files" columns={columns} rows={items} getRowId={(i) => i.id} hiddenColumns={hidden} />
        </>
      );
    }
    render(<WithPicker />);
    await user.click(screen.getByRole("button", { name: "Columns" }));
    const group = screen.getByRole("group", { name: "Columns" });
    await user.click(within(group).getByRole("checkbox", { name: "Size" }));
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Kind"]);
    expect(within(group).getByRole("checkbox", { name: "Kind" })).toBeDisabled();
    await user.click(within(group).getByRole("checkbox", { name: "Name" }));
    // Kind is not hideable and is now the last visible column.
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Kind"]);
  });

  it("groups rows with collapsible headers", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        aria-label="Files"
        columns={columns}
        rows={items}
        getRowId={(i) => i.id}
        getGroup={(i) => i.kind}
        renderGroupHeader={(g) => `Kind ${g.group} · ${g.count}`}
      />,
    );
    const header = screen.getByText("Kind x · 2").closest('[role="row"]') as HTMLElement;
    expect(header).toHaveAttribute("aria-expanded", "true");
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    // Keyboard: cursor is on the collapsed header; Right expands.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("shows empty, loading and filter-row states", () => {
    const { rerender } = render(
      <DataTable aria-label="Files" columns={columns} rows={[]} getRowId={(i: Item) => i.id} empty="Nothing here" />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();

    rerender(<DataTable aria-label="Files" columns={columns} rows={[]} getRowId={(i: Item) => i.id} loading labels={{ loading: "Loading files" }} />);
    expect(screen.getByRole("grid")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("row", { name: "Loading files" })).toBeInTheDocument();

    const withFilter = columns.map((c) => (c.id === "name" ? { ...c, filter: <input aria-label="Filter name" /> } : c));
    rerender(<DataTable aria-label="Files" columns={withFilter} rows={items} getRowId={(i) => i.id} />);
    const filter = screen.getByRole("textbox", { name: "Filter name" });
    fireEvent.keyDown(filter, { key: "ArrowDown" });
    // Keys typed in a filter never move the grid cursor.
    expect(selectedNames()).toEqual([]);
  });

  it("virtualizes large collections", async () => {
    const size = (name: string, value: number) =>
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value });
    size("offsetHeight", 400);
    size("offsetWidth", 800);
    size("clientHeight", 400);
    size("clientWidth", 800);

    const many = Array.from({ length: 20_000 }, (_, i) => ({ id: String(i), name: `Row ${i}`, size: i, kind: "x" }));
    const cell = vi.fn((i: Item) => i.name);
    render(
      <DataTable
        aria-label="Many"
        columns={[{ id: "name", label: "Name", cell }]}
        rows={many}
        getRowId={(i) => i.id}
        className="h-96"
      />,
    );
    await waitFor(() => expect(cell).toHaveBeenCalled());
    expect(cell.mock.calls.length).toBeLessThan(200);
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", String(20_001));
  });
});
