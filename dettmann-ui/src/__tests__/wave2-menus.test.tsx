import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Menu } from "../components/menu";
import { ContextMenu } from "../components/context-menu";
import { Popover } from "../components/popover";
import { rowRecipe } from "../core/styles/row";

const tokens = (el: Element) => el.className.split(/\s+/);
const textColors = (el: Element) => tokens(el).filter((c) => /^text-(fg|danger|intent)/.test(c));

describe("rowRecipe tone", () => {
  it("danger swaps the text color and the hover layer instead of adding a second one", () => {
    const cls = rowRecipe({ tone: "danger" }).split(/\s+/);
    expect(cls).toContain("text-danger-text");
    expect(cls).not.toContain("text-fg");
    expect(cls).toContain("hover:bg-danger-subtle");
    expect(cls).not.toContain("hover:bg-state-hover");
  });

  it("a disabled danger row is just disabled", () => {
    const cls = rowRecipe({ tone: "danger", disabled: true }).split(/\s+/);
    expect(cls).toContain("text-fg-subtle");
    expect(cls).not.toContain("text-danger-text");
  });
});

describe("Menu (D-033)", () => {
  function Harness({ onSelect = () => {} }: { onSelect?: () => void }) {
    return (
      <Menu.Root>
        <Menu.Trigger>
          <button type="button">Actions</button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item onSelect={onSelect}>Edit</Menu.Item>
          <Menu.Item disabled>Archive</Menu.Item>
          <Menu.Item>Delete</Menu.Item>
        </Menu.Content>
      </Menu.Root>
    );
  }

  it("panel is the elevated part and separates its rows", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("shadow-overlay", "rounded-card", "border", "flex", "flex-col", "gap-0.5", "focus-bare");
    expect(menu).not.toHaveClass("shadow-modal");
  });

  it("items are compact rows; disabled uses tokens", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const edit = screen.getByRole("menuitem", { name: "Edit" });
    expect(edit).toHaveClass("h-control-sm", "rounded-chip", "w-full", "focus-ring-inset");
    const archive = screen.getByRole("menuitem", { name: "Archive" });
    expect(archive).toBeDisabled();
    expect(textColors(archive)).toEqual(["text-fg-subtle"]);
    expect(archive.className).not.toMatch(/opacity-/);
  });

  it("keeps keyboard selection working", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("ContextMenu (D-033)", () => {
  const items = [
    { id: "open", label: "Open", shortcut: "Enter" },
    { id: "rename", label: "Rename", disabled: true },
    { id: "remove", label: "Remove", destructive: true },
  ];

  function open() {
    render(
      <ContextMenu items={items}>
        <div>target</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText("target"), { clientX: 10, clientY: 10 });
    return screen.getByRole("menu");
  }

  it("panel and rows follow the menu language", () => {
    const menu = open();
    expect(menu).toHaveClass("shadow-overlay", "rounded-card", "flex", "flex-col", "gap-0.5");
    expect(screen.getByRole("menuitem", { name: /Open/ })).toHaveClass("h-control-sm", "rounded-chip", "focus-ring-inset");
  });

  it("destructive and disabled rows carry a single text color and no opacity", () => {
    open();
    const remove = screen.getByRole("menuitem", { name: "Remove" });
    expect(textColors(remove)).toEqual(["text-danger-text"]);
    const rename = screen.getByRole("menuitem", { name: "Rename" });
    expect(textColors(rename)).toEqual(["text-fg-subtle"]);
    expect(rename.className).not.toMatch(/opacity-/);
  });

  it("reopening elsewhere keeps a single menu", () => {
    open();
    fireEvent.contextMenu(screen.getByText("target"), { clientX: 200, clientY: 120 });
    const menus = screen.getAllByRole("menu");
    expect(menus).toHaveLength(1);
    expect(menus[0]!.style.left).toBe("200px");
  });
});

describe("ContextMenu stays inside the window", () => {
  it("shifts back when it would overflow the right or bottom edge", () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const menu = this.getAttribute("role") === "menu";
      return { left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, width: menu ? 200 : 0, height: menu ? 120 : 0, toJSON() {} } as DOMRect;
    });
    render(
      <ContextMenu items={[{ id: "a", label: "A" }]}>
        <div>target</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText("target"), { clientX: window.innerWidth - 10, clientY: window.innerHeight - 10 });
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe(`${window.innerWidth - 200 - 8}px`);
    expect(menu.style.top).toBe(`${window.innerHeight - 120 - 8}px`);
    rect.mockRestore();
  });
});

describe("Popover (D-033)", () => {
  it("panel uses the overlay shadow and the bare focus", async () => {
    const user = userEvent.setup();
    render(
      <Popover.Root>
        <Popover.Trigger>
          <button type="button">More</button>
        </Popover.Trigger>
        <Popover.Content data-testid="panel">Body</Popover.Content>
      </Popover.Root>,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const panel = screen.getByTestId("panel");
    expect(panel).toHaveClass("shadow-overlay", "rounded-card", "border", "focus-bare");
    expect(panel).not.toHaveClass("shadow-modal");
  });
});
