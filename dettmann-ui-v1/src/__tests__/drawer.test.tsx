import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Drawer } from "../components/drawer";

describe("Drawer", () => {
  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <Drawer.Root open={true} onOpenChange={onOpenChange}>
        <Drawer.Content side="right">
          <Drawer.Body>Drawer content</Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>
    );

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders a dialog from the given side", () => {
    render(
      <Drawer.Root open={true} onOpenChange={() => {}}>
        <Drawer.Content side="left">
          <Drawer.Header>
            <Drawer.Title>Filters</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body>Body</Drawer.Body>
          <Drawer.Footer>Footer</Drawer.Footer>
        </Drawer.Content>
      </Drawer.Root>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("left-0");
    expect(dialog).toHaveClass("rounded-xl");
    expect(dialog).toHaveClass("shadow-xl");
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toHaveClass(
      "flex",
      "items-center",
      "justify-end",
      "gap-2"
    );
  });

  it("does not close on Escape when closeOnEscape is false", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <Drawer.Root open={true} onOpenChange={onOpenChange} closeOnEscape={false}>
        <Drawer.Content>
          <Drawer.Body>Locked</Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>
    );

    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
