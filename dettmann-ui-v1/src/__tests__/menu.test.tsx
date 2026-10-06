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
});
