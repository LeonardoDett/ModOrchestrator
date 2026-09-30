import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Gallery } from "../components/gallery";

describe("Gallery", () => {
  it("defaults to three columns and regular spacing", () => {
    render(
      <Gallery.Root>
        <Gallery.List>
          <div>cell</div>
        </Gallery.List>
      </Gallery.Root>
    );

    const grid = screen.getByText("cell").parentElement?.parentElement;
    expect(grid).toHaveClass(
      "grid",
      "w-full",
      "items-start",
      "justify-start",
      "gap-4",
      "[grid-template-columns:repeat(auto-fill,minmax(16rem,18rem))]"
    );
  });

  it("maps columns, breakpoints, and density presets onto the grid", () => {
    const { rerender } = render(
      <Gallery.Root columns={4} sm={2} gap="compact">
        <div>cell</div>
      </Gallery.Root>
    );

    const grid = screen.getByText("cell").parentElement;
    expect(grid).toHaveClass(
      "[grid-template-columns:repeat(4,minmax(16rem,18rem))]",
      "sm:[grid-template-columns:repeat(2,minmax(16rem,18rem))]",
      "gap-2",
      "items-start",
      "justify-start"
    );

    rerender(
      <Gallery.Root gap="comfort">
        <div>cell</div>
      </Gallery.Root>
    );
    expect(screen.getByText("cell").parentElement).toHaveClass("gap-6");
  });

  it("lets list children join the root grid", () => {
    render(
      <Gallery.Root columns={4}>
        <Gallery.List>
          <div>one</div>
          <div>two</div>
        </Gallery.List>
        <Gallery.Add />
      </Gallery.Root>
    );

    const list = screen.getByText("one").parentElement;
    expect(list).toHaveClass("contents");
    expect(list).toContainElement(screen.getByText("two"));
    expect(list?.parentElement).toContainElement(screen.getByRole("button", { name: "Adicionar" }));
  });

  it("renders a dashed add action with the default label", () => {
    render(<Gallery.Add />);

    const add = screen.getByRole("button", { name: "Adicionar" });
    expect(add).toHaveAttribute("type", "button");
    expect(add).toHaveClass(
      "aspect-square",
      "border-dashed",
      "border-border-strong",
      "bg-transparent",
      "text-fg-subtle"
    );
  });

  it("replaces the default label and calls onClick", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Gallery.Add label="Nova foto" onClick={onAdd} />);

    await user.click(screen.getByRole("button", { name: "Nova foto" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("replaces the default content when children are passed", () => {
    render(<Gallery.Add>Enviar</Gallery.Add>);

    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
    expect(screen.queryByText("Adicionar")).not.toBeInTheDocument();
  });
});
