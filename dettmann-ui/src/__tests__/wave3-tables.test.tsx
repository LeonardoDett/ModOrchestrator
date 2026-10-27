import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type DataTableColumn } from "../components/data-table";
import { Table } from "../components/table";

interface Item {
  id: string;
  name: string;
  size: number;
}

const items: Item[] = [
  { id: "a", name: "Alpha", size: 3 },
  { id: "b", name: "Beta", size: 1 },
  { id: "c", name: "Gamma", size: 2 },
];

const columns: DataTableColumn<Item>[] = [
  { id: "name", label: "Name", cell: (i) => i.name, sortable: true, grow: true },
  { id: "size", label: "Size", cell: (i) => i.size, numeric: true, width: 80 },
];

const rowNamed = (name: string) => screen.getByText(name).closest('[role="row"]') as HTMLElement;
const tokens = (el: Element) => el.className.split(/\s+/);
const backgrounds = (el: Element) => tokens(el).filter((c) => /^(hover:)?bg-/.test(c));

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = HTMLElement.prototype as unknown as { animate?: AnimateFn };

afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});

describe("DataTable density (D-033)", () => {
  it("rows are 32 px by default and 28 px when compact", () => {
    const { rerender } = render(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} />);
    expect(rowNamed("Alpha").style.height).toBe("32px");
    rerender(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} density="compact" />);
    expect(rowNamed("Alpha").style.height).toBe("28px");
  });

  it("an explicit rowHeight wins", () => {
    render(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} rowHeight={44} />);
    expect(rowNamed("Alpha").style.height).toBe("44px");
  });

  it("header cells follow the density and declare the structural layer", () => {
    render(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} />);
    const header = screen.getByRole("columnheader", { name: /Name/ });
    expect(header).toHaveClass("h-8");
    expect(header.closest("[data-layer]")).toHaveAttribute("data-layer", "medium");
  });
});

describe("DataTable row states (D-033)", () => {
  it("a selected row is tinted with the brand bar; an idle row only has the hover layer", async () => {
    const user = userEvent.setup();
    render(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} selectionMode="multiple" />);
    expect(backgrounds(rowNamed("Beta"))).toEqual(["hover:bg-state-hover"]);
    await user.click(rowNamed("Beta"));
    const row = rowNamed("Beta");
    expect(backgrounds(row)).toEqual(["bg-selected"]);
    expect(row.className).toMatch(/before:bg-brand-fill/);
    expect(row.className).not.toMatch(/emphasis-/);
  });

  it("sort and resize controls use the inset focus ring; the idle sort icon uses a token, not opacity", () => {
    render(<DataTable aria-label="Items" columns={columns} rows={items} getRowId={(i) => i.id} />);
    const sort = screen.getByRole("button", { name: /Name/ });
    expect(sort).toHaveClass("focus-ring-inset");
    expect(sort.innerHTML).not.toMatch(/opacity-/);
    const handle = screen.getAllByRole("separator")[0]!;
    expect(handle).toHaveClass("focus-ring-inset", "rounded-pill");
    expect(screen.getByRole("grid")).toHaveClass("focus-bare");
  });
});

describe("DataTable reorder motion (D-033)", () => {
  it("animates the rows that changed place when the order changes, not on a plain re-render", () => {
    // Posição = ordem real no DOM: a medida "antes" vê a ordem antiga e a "depois", a nova.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const siblings = this.parentElement ? [...this.parentElement.children] : [];
      const top = siblings.indexOf(this) * 32;
      return { left: 0, top, right: 0, bottom: top, x: 0, y: top, width: 0, height: 0, toJSON() {} } as DOMRect;
    });
    const animate = vi.fn<AnimateFn>(() => ({ cancel() {}, finished: new Promise(() => {}) }) as unknown as Animation);
    proto.animate = animate;

    const props = { "aria-label": "Items", columns, getRowId: (i: Item) => i.id } as const;
    const { rerender } = render(<DataTable {...props} rows={items} />);
    animate.mockClear();

    rerender(<DataTable {...props} rows={[...items]} />);
    expect(animate).not.toHaveBeenCalled();

    const moved = [items[1]!, items[0]!, items[2]!];
    rerender(<DataTable {...props} rows={moved} />);
    expect(animate).toHaveBeenCalledTimes(2);
  });
});

describe("Table (D-033)", () => {
  it("is compact, flat, with a structural header", () => {
    render(
      <Table.Root aria-label="Files">
        <Table.Header>
          <Table.Row>
            <Table.Head>Name</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row selected>
            <Table.Cell>Alpha</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>,
    );
    const head = screen.getByRole("columnheader", { name: "Name" });
    expect(head).toHaveClass("h-control-sm", "px-3");
    const header = head.closest("thead")!;
    expect(header).toHaveAttribute("data-layer", "medium");
    expect(header).toHaveClass("bg-structure");
    expect(header).not.toHaveClass("bg-selected");
    const cell = screen.getByRole("cell", { name: "Alpha" });
    expect(cell).toHaveClass("h-control-sm", "px-3");
    expect(cell.closest("tr")).toHaveClass("bg-selected");
    expect(document.querySelector("table")!.parentElement!.className + document.querySelector("table")!.className).not.toMatch(/shadow-/);
  });
});
