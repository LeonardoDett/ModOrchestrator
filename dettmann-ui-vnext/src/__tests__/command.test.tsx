import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Command } from "../components/command";

const items = [
  { id: "a", label: "Open settings", value: "settings", description: "Preferences of the app" },
  { id: "b", label: "Disabled thing", value: "x", disabled: true },
  { id: "c", label: "Go to dashboard", value: "dashboard" },
];

const activeText = () => {
  const id = screen.getByRole("textbox").getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)!.textContent : null;
};

describe("Command (D-033)", () => {
  it("options are compact rows in a spaced list; the field keeps the focus", async () => {
    const user = userEvent.setup();
    render(<Command items={items} />);
    await user.click(screen.getByRole("textbox"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("flex", "flex-col", "gap-0.5");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-controls", listbox.id);
    const plain = screen.getByRole("option", { name: "Go to dashboard" });
    expect(plain).toHaveClass("h-control-sm", "rounded-chip");
    expect(screen.getByRole("option", { name: /Open settings/ })).toHaveClass("min-h-control-sm");
    const disabled = screen.getByRole("option", { name: "Disabled thing" });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled).toHaveClass("text-fg-subtle");
    expect(disabled.className).not.toMatch(/opacity-/);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("arrows, Home and End move the active descendant, skipping disabled items", async () => {
    const user = userEvent.setup();
    render(<Command items={items} />);
    await user.click(screen.getByRole("textbox"));
    expect(activeText()).toContain("Open settings");
    await user.keyboard("{ArrowDown}");
    expect(activeText()).toBe("Go to dashboard");
    await user.keyboard("{ArrowDown}");
    expect(activeText()).toContain("Open settings");
    await user.keyboard("{ArrowUp}");
    expect(activeText()).toBe("Go to dashboard");
    await user.keyboard("{Home}");
    expect(activeText()).toContain("Open settings");
    await user.keyboard("{End}");
    expect(activeText()).toBe("Go to dashboard");
    expect(screen.getByRole("option", { name: "Go to dashboard" })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking a disabled item does nothing", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Command items={items} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("option", { name: "Disabled thing" }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: "Go to dashboard" }));
    expect(onValueChange).toHaveBeenCalledWith(items[2]);
  });

  it("with every item disabled nothing is active and Enter is harmless", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Command items={items.map((i) => ({ ...i, disabled: true }))} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{ArrowDown}{ArrowUp}{Home}{End}{Enter}");
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-activedescendant");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("an empty list announces the empty message and survives the keyboard", async () => {
    const user = userEvent.setup();
    render(<Command items={[]} emptyMessage="Nothing here" />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Nothing here");
  });

  it("loading replaces the list with a labelled loader and ignores the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Command items={items} loading loadingLabel="Carregando comandos" onValueChange={onValueChange} />);
    expect(screen.getByRole("status", { name: "Carregando comandos" })).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("typing resets the active item to the first enabled match", async () => {
    const user = userEvent.setup();
    render(<Command items={items} />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{End}");
    await user.keyboard("o");
    expect(activeText()).toContain("Open settings");
  });
});
