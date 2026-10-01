import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { FileList } from "../components/file-list";
import { ReorderableList } from "../components/reorderable-list";
import { SplitPane } from "../components/split-pane";
import { Tree, toggleTreeCheck, treeCheckState } from "../components/tree";

describe("FileList", () => {
  it("opens an item with Enter", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<FileList items={[{ id: "1", name: "armor.dds" }]} onOpen={onOpen} selection="none" />);
    const item = screen.getByRole("button", { name: /armor\.dds/i });
    await user.click(item);
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith({ id: "1", name: "armor.dds" });
  });
});

describe("ReorderableList", () => {
  it("provides keyboard move controls", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <ReorderableList
        items={[
          { id: "a", data: "A" },
          { id: "b", data: "B" },
        ]}
        onReorder={onReorder}
        renderItem={(item) => <span>{item.data}</span>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Move item down" }));
    expect(onReorder.mock.calls[0]?.[0].map((item: { id: string }) => item.id)).toEqual(["b", "a"]);
  });
});

describe("SplitPane", () => {
  it("resizes through the accessible separator", async () => {
    const user = userEvent.setup();
    render(<SplitPane sidebar={<div>Sidebar</div>} main={<div>Main</div>} initialSize={300} />);
    const separator = screen.getByRole("separator");
    await user.click(separator);
    await user.keyboard("{ArrowRight}");
    expect(separator).toHaveAttribute("aria-valuenow", "316");
  });
});

describe("Tree", () => {
  it("moves through visible nodes with arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <Tree
        nodes={[
          { id: "root", label: "Root", children: [{ id: "child", label: "Child" }] },
          { id: "other", label: "Other" },
        ]}
      />,
    );
    const root = screen.getByRole("button", { name: "Root" });
    await user.click(root);
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(screen.getByRole("button", { name: "Child" })).toHaveFocus();
  });
});

describe("Tree batch selection (L5)", () => {
  const nodes = [
    {
      id: "textures",
      label: "textures",
      children: [
        { id: "textures/a.dds", label: "a.dds" },
        { id: "textures/b.dds", label: "b.dds" },
      ],
    },
    { id: "x.esp", label: "x.esp" },
  ];

  it("checks every leaf of a branch and reports partial state", async () => {
    const user = userEvent.setup();
    const changes: string[][] = [];
    const { rerender } = render(
      <Tree nodes={nodes} defaultExpanded={new Set(["textures"])} checkedIds={new Set(["textures/a.dds"])} onCheckedIdsChange={(next) => changes.push([...next].sort())} />,
    );
    const branch = screen.getByRole("checkbox", { name: "textures" });
    expect(branch).toHaveAttribute("aria-checked", "mixed");
    await user.click(branch);
    expect(changes.at(-1)).toEqual(["textures/a.dds", "textures/b.dds"]);
    rerender(
      <Tree nodes={nodes} defaultExpanded={new Set(["textures"])} checkedIds={new Set(["textures/a.dds", "textures/b.dds"])} onCheckedIdsChange={(next) => changes.push([...next].sort())} />,
    );
    expect(screen.getByRole("checkbox", { name: "textures" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("checkbox", { name: "textures" }));
    expect(changes.at(-1)).toEqual([]);
  });

  it("toggles the focused node with Space and renders the end column", async () => {
    const user = userEvent.setup();
    const changes: string[][] = [];
    render(
      <Tree
        nodes={nodes}
        checkedIds={new Set()}
        onCheckedIdsChange={(next) => changes.push([...next])}
        renderEnd={(node) => <span>end:{node.id}</span>}
      />,
    );
    expect(screen.getByText("end:x.esp")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "x.esp" }));
    await user.keyboard(" ");
    expect(changes.at(-1)).toEqual(["x.esp"]);
  });
});

describe("tree.model", () => {
  it("ignores disabled leaves when toggling a branch", () => {
    const node = { id: "d", children: [{ id: "a" }, { id: "b", disabled: true }] };
    expect([...toggleTreeCheck(node, new Set())]).toEqual(["a"]);
    expect(treeCheckState(node, new Set(["a"]))).toBe("indeterminate");
  });
});
