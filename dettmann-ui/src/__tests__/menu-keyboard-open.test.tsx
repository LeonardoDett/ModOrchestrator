import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Menu } from "../components/menu";

const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe("Menu opened from the keyboard", () => {
  it("Enter on the trigger puts the focus in the menu and arrows move it", async () => {
    const user = userEvent.setup();
    render(
      <Menu.Root>
        <Menu.Trigger>
          <button type="button">Actions</button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item>Edit</Menu.Item>
          <Menu.Item>Copy</Menu.Item>
        </Menu.Content>
      </Menu.Root>,
    );
    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
  });
});
