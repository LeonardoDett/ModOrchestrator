import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { List } from "../components/list";

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

describe("List", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("selects a single item on click", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();

    render(
      <List.Root
        items={items}
        selectionMode="single"
        onSelectedChange={onSelectedChange}
        renderItem={(item) => <List.Item>{item.label}</List.Item>}
      />
    );

    await user.click(screen.getByRole("option", { name: "Beta" }));
    expect(onSelectedChange).toHaveBeenCalledWith(["b"]);
  });

  it("supports multiple selection", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();

    render(
      <List.Root
        items={items}
        selectionMode="multiple"
        onSelectedChange={onSelectedChange}
        renderItem={(item) => <List.Item>{item.label}</List.Item>}
      />
    );

    await user.click(screen.getByRole("option", { name: "Alpha" }));
    expect(onSelectedChange).toHaveBeenCalledWith(["a"]);
  });

  it("navigates with arrow keys", async () => {
    const user = userEvent.setup();

    render(
      <List.Root
        items={items}
        renderItem={(item) => <List.Item>{item.label}</List.Item>}
      />
    );

    const listbox = screen.getByRole("listbox");
    listbox.focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(screen.getByRole("option", { name: "Beta" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("virtualized list does not mount every item", async () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 320;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return 400;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return 320;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 400;
      },
    });

    const many = Array.from({ length: 10_000 }, (_, i) => ({
      id: String(i),
      label: `Item ${i}`,
    }));
    const renderItem = vi.fn((item: { id: string; label: string }) => (
      <List.Item>{item.label}</List.Item>
    ));

    render(
      <List.Root
        items={many}
        virtualized
        itemHeight={40}
        maxHeight={320}
        renderItem={renderItem}
      />
    );

    await waitFor(() => {
      expect(renderItem.mock.calls.length).toBeGreaterThan(0);
    });
    expect(renderItem.mock.calls.length).toBeLessThan(100);
  });
});
