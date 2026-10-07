import { describe, it, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../components/button";

describe("Button", () => {
  it("renders startIcon and endIcon as siblings of the label", () => {
    render(
      <Button startIcon={<span>start</span>} endIcon={<span>end</span>}>
        Label
      </Button>
    );

    const button = screen.getByRole("button", { name: /label/i });
    expect(button).toHaveTextContent("start");
    expect(button).toHaveTextContent("Label");
    expect(button).toHaveTextContent("end");
    expect(button).toHaveClass("gap-2");
    expect(button).toHaveClass("rounded-control");
    expect(button).toHaveClass("font-semibold");
  });

  it("hides startIcon and endIcon while loading", () => {
    render(
      <Button loading startIcon={<span>start</span>} endIcon={<span>end</span>}>
        Save
      </Button>
    );

    expect(screen.queryByText("start")).not.toBeInTheDocument();
    expect(screen.queryByText("end")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Save");
  });

  test("high button carries brand intent, high layer and expressive motion", () => {
    render(<Button emphasis="high">Implantar</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("data-intent", "brand");
    expect(b).toHaveAttribute("data-layer", "high");
    expect(b).toHaveAttribute("data-motion", "expressive");
    expect(b).toHaveClass("bg-intent-fill", "text-on-intent");
  });

  test("default button is medium neutral responsive", () => {
    render(<Button>Salvar</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("data-layer", "medium");
    expect(b).toHaveAttribute("data-intent", "neutral");
    expect(b).toHaveAttribute("data-motion", "responsive");
  });

  test("low danger button uses intent text classes", () => {
    render(
      <Button emphasis="low" intent="danger">
        Excluir
      </Button>
    );
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("data-intent", "danger");
    expect(b.className).toContain("text-intent-text");
  });

  test("motion prop overrides", () => {
    render(<Button motion="calm">Abrir</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-motion", "calm");
  });

  test("root carries motion, press, radius and control height by size", () => {
    const { rerender } = render(<Button size="sm">A</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveClass("motion-transition", "motion-press", "rounded-control", "h-control-sm");
    rerender(<Button>A</Button>);
    expect(b).toHaveClass("h-control-md");
    rerender(<Button size="lg">A</Button>);
    expect(b).toHaveClass("h-control-lg");
    rerender(<Button size="icon-sm" aria-label="x" />);
    expect(b).toHaveClass("size-control-sm");
  });
});
