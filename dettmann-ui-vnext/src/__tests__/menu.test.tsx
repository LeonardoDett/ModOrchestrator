import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Menu } from "../components/menu";

describe("Menu", () => {
  it("opens on trigger click and closes on Escape", async () => {
    const user = userEvent.setup();

    render(
      <Menu.Root>
        <Menu.Trigger>
          <button type="button">Actions</button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item>Edit</Menu.Item>
          <Menu.Item>Delete</Menu.Item>
        </Menu.Content>
      </Menu.Root>
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("navigates items with arrow keys and Home/End", async () => {
    const user = userEvent.setup();

    render(
      <Menu.Root>
        <Menu.Trigger>
          <button type="button">Actions</button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item>Edit</Menu.Item>
          <Menu.Item>Copy</Menu.Item>
          <Menu.Item>Delete</Menu.Item>
        </Menu.Content>
      </Menu.Root>
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    const edit = screen.getByRole("menuitem", { name: "Edit" });
    const copy = screen.getByRole("menuitem", { name: "Copy" });
    const del = screen.getByRole("menuitem", { name: "Delete" });

    edit.focus();
    await user.keyboard("{ArrowDown}");
    expect(copy).toHaveFocus();

    await user.keyboard("{End}");
    expect(del).toHaveFocus();

    await user.keyboard("{Home}");
    expect(edit).toHaveFocus();
  });

  it("selects an item with typeahead and closes on select", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <Menu.Root>
        <Menu.Trigger>
          <button type="button">Actions</button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item onSelect={onSelect}>Edit</Menu.Item>
          <Menu.Item>Delete</Menu.Item>
        </Menu.Content>
      </Menu.Root>
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.keyboard("d");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <button type="button">Outside</button>
        <Menu.Root>
          <Menu.Trigger>
            <button type="button">Actions</button>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item>Edit</Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("D-040: separators, icons, checkable items that stay open and a submenu that closes everything", async () => {
    const user = userEvent.setup();
    const onSize = vi.fn();
    const onGame = vi.fn();
    render(
      <Menu.Root>
        <Menu.Trigger>
          <button type="button">More</button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item checked onSelect={onSize}>
            Size
          </Menu.Item>
          <Menu.Separator />
          <Menu.Sub label="Open folder">
            <Menu.Item onSelect={onGame}>Game</Menu.Item>
          </Menu.Sub>
        </Menu.Content>
      </Menu.Root>,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const size = screen.getByRole("menuitemcheckbox", { name: "Size" });
    expect(size).toHaveAttribute("aria-checked", "true");
    await user.click(size);
    expect(onSize).toHaveBeenCalled();
    expect(screen.getByRole("menuitemcheckbox", { name: "Size" })).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    const sub = screen.getByRole("menuitem", { name: "Open folder" });
    expect(sub).toHaveAttribute("aria-haspopup", "menu");
    await user.click(sub);
    await user.click(await screen.findByRole("menuitem", { name: "Game" }));
    expect(onGame).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
