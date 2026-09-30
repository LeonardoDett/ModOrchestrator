import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { FileList } from "../components/file-list";
import { ReorderableList } from "../components/reorderable-list";
import { SplitPane } from "../components/split-pane";
import { Tree } from "../components/tree";

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
