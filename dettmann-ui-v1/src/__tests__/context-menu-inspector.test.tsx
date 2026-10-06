import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ContextMenu } from "../components/context-menu";
import { Inspector } from "../components/inspector";

describe("ContextMenu keyboard", () => {
  const items = [
    { id: "off", label: "Unavailable", disabled: true },
    { id: "edit", label: "Edit", onSelect: vi.fn() },
    { id: "copy", label: "Copy" },
    { id: "remove", label: "Remove", destructive: true },
  ];

  it("opens with Shift+F10, focuses the first enabled item and moves with Home/End", async () => {
    const user = userEvent.setup();
    render(
      <ContextMenu items={items}>
        <button type="button">Row</button>
      </ContextMenu>,
    );
    screen.getByRole("button", { name: "Row" }).focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Remove" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("opens with the ContextMenu key and returns the focus on Escape and after choosing", async () => {
    const user = userEvent.setup();
    render(
      <ContextMenu items={items}>
        <button type="button">Row</button>
      </ContextMenu>,
    );
    const row = screen.getByRole("button", { name: "Row" });
    row.focus();
    await user.keyboard("{ContextMenu}");
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(row).toHaveFocus();

    await user.keyboard("{ContextMenu}");
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(items[1]!.onSelect).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("closes on Tab", async () => {
    const user = userEvent.setup();
    render(
      <ContextMenu items={items}>
        <button type="button">Row</button>
      </ContextMenu>,
    );
    screen.getByRole("button", { name: "Row" }).focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Inspector close", () => {
  it("has a named close button and closes on Escape from the page", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <button type="button">List</button>
        <Inspector title="Details" onClose={onClose} closeLabel="Fechar">
          body
        </Inspector>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "List" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("leaves Escape to a field being edited and to an open dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <Inspector title="Details" onClose={onClose}>
        <textarea aria-label="Notes" />
      </Inspector>,
    );
    await user.click(screen.getByRole("textbox", { name: "Notes" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <>
        <button type="button">List</button>
        <div role="dialog" aria-modal="true" />
        <Inspector title="Details" onClose={onClose}>
          body
        </Inspector>
      </>,
    );
    screen.getByRole("button", { name: "List" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing on Escape without onClose", async () => {
    const user = userEvent.setup();
    render(<Inspector title="Details">body</Inspector>);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
