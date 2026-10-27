import { describe, it, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../components/button";
import { ButtonGroup } from "../components/button-group";

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

describe("Button visual language (D-033)", () => {
  it("has no shadow at any emphasis", () => {
    render(
      <>
        <Button emphasis="low">Low</Button>
        <Button>Medium</Button>
        <Button emphasis="high">High</Button>
      </>,
    );
    for (const name of ["Low", "Medium", "High"]) {
      expect(screen.getByRole("button", { name }).className).not.toMatch(/shadow-/);
    }
  });

  it("medium is outlined by a border; low and high keep the box with a transparent one", () => {
    render(
      <>
        <Button emphasis="low">Low</Button>
        <Button>Save</Button>
        <Button emphasis="high">High</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("border", "border-border");
    expect(screen.getByRole("button", { name: "Low" })).toHaveClass("border", "border-transparent");
    expect(screen.getByRole("button", { name: "High" })).toHaveClass("border", "border-transparent");
  });

  it("tile shows the description under the label, muted unless high (D-040)", () => {
    render(
      <>
        <Button size="tile-lg" emphasis="high" description="318 mods">Import all</Button>
        <Button size="tile" description="Some profiles">Choose</Button>
      </>,
    );
    const main = screen.getByRole("button", { name: /Import all/ });
    expect(main).toHaveClass("h-16", "text-left");
    expect(main.querySelector('[data-slot="description"]')).toHaveTextContent("318 mods");
    expect(main.querySelector('[data-slot="description"]')).not.toHaveClass("text-fg-muted");
    const other = screen.getByRole("button", { name: /Choose/ });
    expect(other).toHaveClass("h-14");
    expect(other.querySelector('[data-slot="description"]')).toHaveClass("text-fg-muted");
  });

  it("uses the shared focus ring", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("focus-ring");
  });

  it("loading sets aria-busy and keeps the accessible name", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: /Save/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });

  it("group joins radii with the control primitive", () => {
    render(
      <ButtonGroup aria-label="Actions">
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>,
    );
    const cls = screen.getByRole("group", { name: "Actions" }).className;
    expect(cls).toContain("rounded-l-control");
    expect(cls).toContain("rounded-r-control");
    expect(cls).not.toContain("rounded-l-lg");
  });

  test("badge true is a dot with the badge intent, hidden from screen readers (D-043)", () => {
    render(
      <Button size="icon" aria-label="Ferramentas, uma em execução" badge badgeIntent="success">
        x
      </Button>
    );
    const b = screen.getByRole("button", { name: "Ferramentas, uma em execução" });
    const dot = b.querySelector('[data-slot="badge"]');
    expect(dot).toHaveAttribute("data-dot");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveAttribute("data-intent", "success");
    expect(dot).toBeEmptyDOMElement();
    expect(b).toHaveClass("relative");
  });

  test("badge false draws nothing", () => {
    render(<Button size="icon" aria-label="Ferramentas" badge={false}>x</Button>);
    expect(screen.getByRole("button").querySelector('[data-slot="badge"]')).toBeNull();
  });
});
