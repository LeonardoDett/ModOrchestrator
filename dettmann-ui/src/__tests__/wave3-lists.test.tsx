import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Tree, type TreeNode } from "../components/tree";
import { ReorderableList, type ReorderableListItem } from "../components/reorderable-list";
import { LogViewer } from "../components/log-viewer";

const tokens = (el: Element) => el.className.split(/\s+/);

const nodes: TreeNode[] = [
  {
    id: "data",
    label: "Data",
    children: [
      { id: "a", label: "a.esp" },
      { id: "b", label: "b.esp", disabled: true },
    ],
  },
];

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = HTMLElement.prototype as unknown as { animate?: AnimateFn };

afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});

describe("Tree (D-033)", () => {
  const row = (name: string) => screen.getByRole("button", { name }).parentElement!;

  it("rows are compact; the selected one is tinted with the brand bar and a single text color", () => {
    render(<Tree aria-label="Files" nodes={nodes} defaultExpanded={new Set(["data"])} selectedId="a" />);
    const selected = row("a.esp");
    expect(selected).toHaveClass("min-h-control-sm", "bg-selected");
    expect(selected.className).toMatch(/before:bg-brand-fill/);
    expect(selected.className).not.toMatch(/emphasis-/);
    expect(tokens(selected).filter((c) => /^text-/.test(c))).toEqual(["text-fg"]);
    expect(tokens(row("Data")).filter((c) => /^(hover:)?bg-/.test(c))).toEqual(["hover:bg-state-hover"]);
  });

  it("a disabled node uses tokens, also when selected", () => {
    render(<Tree aria-label="Files" nodes={nodes} defaultExpanded={new Set(["data"])} selectedId="b" />);
    const disabled = row("b.esp");
    expect(disabled.className).not.toMatch(/opacity-/);
    expect(tokens(disabled).filter((c) => /^text-/.test(c))).toEqual(["text-fg-subtle"]);
    expect(screen.getByRole("button", { name: "b.esp" })).toBeDisabled();
  });

  it("node and toggle buttons use the inset focus ring; arrows still move the focus", async () => {
    const user = userEvent.setup();
    render(<Tree aria-label="Files" nodes={nodes} defaultExpanded={new Set(["data"])} />);
    expect(screen.getByRole("button", { name: "Data" })).toHaveClass("focus-ring-inset");
    expect(screen.getByRole("button", { name: "Collapse" })).toHaveClass("focus-ring-inset");
    screen.getByRole("button", { name: "Data" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "a.esp" })).toHaveFocus();
  });
});

describe("ReorderableList (D-033)", () => {
  const initial: ReorderableListItem<string>[] = [
    { id: "1", data: "One" },
    { id: "2", data: "Two" },
    { id: "3", data: "Three" },
  ];

  function Harness({ onReorder }: { onReorder?: (ids: string[]) => void }) {
    const [items, setItems] = useState(initial);
    return (
      <ReorderableList
        aria-label="Dashlets"
        items={items}
        onReorder={(next) => {
          setItems(next);
          onReorder?.(next.map((i) => i.id));
        }}
        renderItem={(item) => <span>{item.data}</span>}
        labels={{ dragHandle: "Arrastar", moveUp: "Subir", moveDown: "Descer" }}
      />
    );
  }

  it("labels are overridable and the move buttons use the inset focus ring", () => {
    render(<Harness />);
    expect(screen.getAllByLabelText("Arrastar")).toHaveLength(3);
    const down = screen.getAllByRole("button", { name: "Descer" })[0]!;
    expect(down).toHaveClass("focus-ring-inset", "rounded-chip");
    expect(screen.getAllByRole("button", { name: "Subir" }).length).toBeGreaterThan(0);
  });

  it("keeps the English defaults", () => {
    render(<ReorderableList items={initial} renderItem={(item) => <span>{item.data}</span>} />);
    expect(screen.getAllByRole("button", { name: "Move item down" }).length).toBeGreaterThan(0);
  });

  it("moving an item reorders and animates the items that changed place", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const siblings = this.parentElement ? [...this.parentElement.children] : [];
      const top = siblings.indexOf(this) * 48;
      return { left: 0, top, right: 0, bottom: top, x: 0, y: top, width: 0, height: 0, toJSON() {} } as DOMRect;
    });
    const animate = vi.fn<AnimateFn>(() => ({ cancel() {}, finished: new Promise(() => {}) }) as unknown as Animation);
    proto.animate = animate;
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    animate.mockClear();
    await user.click(screen.getAllByRole("button", { name: "Descer" })[0]!);
    expect(onReorder).toHaveBeenCalledWith(["2", "1", "3"]);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("the dragged item uses tokens, not opacity", () => {
    const { container } = render(<Harness />);
    expect(container.innerHTML).not.toMatch(/opacity-/);
  });
});

describe("LogViewer (D-033)", () => {
  it("selectable entries use the inset focus ring", () => {
    render(<LogViewer entries={[{ id: "1", level: "info", message: "Started" }]} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Started/ })).toHaveClass("focus-ring-inset");
  });
});
