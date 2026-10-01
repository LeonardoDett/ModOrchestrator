import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DataTable,
  isDropTarget,
  keyboardMove,
  movingRows,
  type DataTableColumn,
  type DataTableRowMove,
} from "../components/data-table";

interface Item {
  id: string;
  name: string;
}

const items: Item[] = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));
const columns: DataTableColumn<Item>[] = [{ id: "name", label: "Name", cell: (i) => i.name, grow: true }];
const rowNamed = (name: string) => screen.getByText(name).closest('[role="row"]') as HTMLElement;

describe("DataTable reorder model (L2)", () => {
  const order = ["a", "b", "c", "d"];

  it("drags the selection when the dragged row is selected, else only that row", () => {
    expect(movingRows(order, new Set(["c", "a"]), "c")).toEqual(["a", "c"]);
    expect(movingRows(order, new Set(["c", "a"]), "b")).toEqual(["b"]);
  });

  it("never drops rows onto themselves", () => {
    expect(isDropTarget(["a", "b"], "b")).toBe(false);
    expect(isDropTarget(["a"], "c")).toBe(true);
  });

  it("moves by one step around the moved block, and stops at the edges", () => {
    expect(keyboardMove(order, ["b", "c"], -1)).toEqual({ ids: ["b", "c"], targetId: "a", position: "before" });
    expect(keyboardMove(order, ["b", "c"], 1)).toEqual({ ids: ["b", "c"], targetId: "d", position: "after" });
    expect(keyboardMove(order, ["a"], -1)).toBeNull();
    expect(keyboardMove(order, ["d"], 1)).toBeNull();
  });
});

describe("DataTable reorder (L2)", () => {
  it("shows a drag handle only for reorderable rows", () => {
    render(
      <DataTable
        aria-label="Items"
        columns={columns}
        rows={items}
        getRowId={(i) => i.id}
        reorderable={(row) => row.id !== "d"}
        onRowsMove={() => {}}
        labels={{ dragHandle: "Drag" }}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Drag" })).toHaveLength(3);
  });

  it("reports Alt+Arrow moves and is busy until the consumer settles", async () => {
    let settle: () => void = () => {};
    const onRowsMove = vi.fn((_: DataTableRowMove) => new Promise<void>((resolve) => (settle = resolve)));
    render(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} reorderable onRowsMove={onRowsMove} />);
    const grid = screen.getByRole("grid");
    fireEvent.focus(grid);
    fireEvent.click(rowNamed("B"));
    fireEvent.keyDown(grid, { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(onRowsMove).toHaveBeenCalledWith({ ids: ["b"], targetId: "c", position: "after" }));
    await waitFor(() => expect(grid).toHaveAttribute("aria-busy", "true"));
    fireEvent.keyDown(grid, { key: "ArrowUp", altKey: true });
    expect(onRowsMove).toHaveBeenCalledTimes(1); // no second move while pending
    settle();
    await waitFor(() => expect(grid).not.toHaveAttribute("aria-busy"));
  });

  it("drags the selected rows with the pointer and drops next to the target", async () => {
    const onRowsMove = vi.fn();
    render(
      <DataTable
        aria-label="Items"
        columns={columns}
        rows={items}
        getRowId={(i) => i.id}
        reorderable
        onRowsMove={onRowsMove}
        rowHeight={40}
        defaultSelectedIds={new Set(["a", "b"])}
        labels={{ dragHandle: "Drag" }}
      />,
    );
    const handle = screen.getAllByRole("button", { name: "Drag" })[0]!;
    fireEvent.pointerDown(handle, { button: 0, clientY: 10, pointerId: 1 });
    // Row index 3 ("D"), lower half: after D.
    fireEvent.pointerMove(handle, { clientY: 3 * 40 + 30, pointerId: 1 });
    await waitFor(() => expect(rowNamed("D")).toHaveAttribute("data-drop", "after"));
    fireEvent.pointerUp(handle, { pointerId: 1 });
    await waitFor(() => expect(onRowsMove).toHaveBeenCalledWith({ ids: ["a", "b"], targetId: "d", position: "after" }));
  });

  it("cancels a drag with Escape", () => {
    const onRowsMove = vi.fn();
    render(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} reorderable onRowsMove={onRowsMove} rowHeight={40} labels={{ dragHandle: "Drag" }} />);
    const handle = screen.getAllByRole("button", { name: "Drag" })[0]!;
    fireEvent.pointerDown(handle, { button: 0, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 130, pointerId: 1 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onRowsMove).not.toHaveBeenCalled();
  });
});
