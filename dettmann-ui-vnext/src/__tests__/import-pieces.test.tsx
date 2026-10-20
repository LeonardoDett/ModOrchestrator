import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Checkbox } from "../components/checkbox";
import { Progress } from "../components/progress";
import { Radio } from "../components/radio";

// D-040: pieces the import boards (ImportarOferta, ImportarEscolha) asked for.
describe("import board pieces", () => {
  it("Checkbox band shows its media, mutes the unchecked label and toggles", () => {
    render(<Checkbox variant="band" label="Regras" description="27 regras" media={<span data-testid="icon" />} />);
    const box = screen.getByRole("checkbox", { name: "Regras" });
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Regras")).toHaveClass("text-fg-muted");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Regras")).not.toHaveClass("text-fg-muted");
  });

  it("Checkbox band-sm is a 52 px row with its action", () => {
    render(<Checkbox variant="band-sm" label="Principal" defaultChecked action={<span>ontem</span>} />);
    const row = screen.getByRole("checkbox", { name: "Principal" }).parentElement;
    expect(row).toHaveClass("min-h-13", "bg-sunken");
    expect(screen.getByText("ontem")).toBeInTheDocument();
  });

  it("Radio card with media centers its content", () => {
    render(
      <Radio.Group name="src" defaultValue="a" aria-label="Fonte">
        <Radio.Item value="a" variant="card" media={<span>VX</span>}>
          Vortex
        </Radio.Item>
        <Radio.Item value="b" variant="card">
          MO2
        </Radio.Item>
      </Radio.Group>,
    );
    const [a, b] = screen.getAllByRole("radio");
    expect(a).toHaveClass("items-center");
    expect(screen.getByText("VX")).toBeInTheDocument();
    expect(b).toHaveClass("items-start");
  });

  it("Progress strong track stays visible on a sunken panel", () => {
    render(<Progress.Root value={20} track="strong" aria-label="Disco" />);
    expect(screen.getByRole("progressbar", { name: "Disco" })).toHaveClass("bg-border");
    render(<Progress.Root value={20} aria-label="Outro" />);
    expect(screen.getByRole("progressbar", { name: "Outro" })).toHaveClass("bg-sunken");
  });
});
