import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "../components/data-table";
import { ResourcePage } from "../components/resource-page";
import { Switch } from "../components/switch";
import { SwatchPicker } from "../components/swatch-picker";
import { Tag } from "../components/tag";

// D-040: props that the approved screen boards need (dense switch, tag with
// a dot, two-line table rows, workspace page header).
describe("board fidelity props (D-040)", () => {
  it("Tag xs draws the color dot before the text", () => {
    const { container } = render(
      <Tag size="xs" color="amber" dot>
        essencial
      </Tag>,
    );
    const tag = container.firstElementChild as HTMLElement;
    expect(tag).toHaveAttribute("data-category", "amber");
    expect(tag.className).toContain("h-4.5");
    expect(tag.querySelector("span[aria-hidden='true']")).not.toBeNull();
  });

  it("Switch xs keeps its accessible name", () => {
    render(<Switch size="xs" aria-label="Ativar SkyUI" />);
    expect(screen.getByRole("switch", { name: "Ativar SkyUI" })).toBeInTheDocument();
  });

  it("DataTable relaxed rows are 54 px and groups 42 px", () => {
    const rows = [
      { id: "a", name: "A", g: "One" },
      { id: "b", name: "B", g: "One" },
    ];
    render(
      <DataTable
        aria-label="Mods"
        density="relaxed"
        columns={[{ id: "name", label: "Name", cell: (r) => r.name }]}
        rows={rows}
        getRowId={(r) => r.id}
        getGroup={(r) => r.g}
      />,
    );
    const all = screen.getAllByRole("row");
    const heights = all.map((r) => (r as HTMLElement).style.height).filter(Boolean);
    expect(heights).toContain("54px");
    expect(heights).toContain("42px");
  });

  it("ResourcePage workspace puts the title, meta and actions on one line", () => {
    render(
      <ResourcePage layout="workspace" title="Mods" meta={<span>142 de 380 ativos</span>} primaryActions={<button type="button">Adicionar mods</button>}>
        <p>conteúdo</p>
      </ResourcePage>,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Mods" });
    const line = heading.parentElement!;
    expect(line).toHaveTextContent("142 de 380 ativos");
    expect(line).toHaveTextContent("Adicionar mods");
    expect(screen.getByRole("main")).toHaveTextContent("conteúdo");
  });

  it("SwatchPicker md fills equal columns and tints every color swatch by its own value", () => {
    render(
      <SwatchPicker
        aria-label="Cor"
        size="md"
        tint="self"
        value="green"
        options={[
          { value: "blue", label: "Azul" },
          { value: "green", label: "Verde" },
        ]}
        renderSwatch={(o) => o.label}
      />,
    );
    const blue = screen.getByRole("radio", { name: "Azul" });
    const green = screen.getByRole("radio", { name: "Verde" });
    expect(blue).toHaveAttribute("data-category", "blue");
    expect(green).toHaveAttribute("data-category", "green");
    expect(green.className).toContain("border-intent-fill");
    expect(screen.getByRole("radiogroup").style.gridTemplateColumns).toContain("minmax(0, 1fr)");
  });

  it("SwatchPicker with a fixed tint colors only the checked swatch", () => {
    render(
      <SwatchPicker aria-label="Ícone" size="sm" tint="green" value="b" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} renderSwatch={(o) => o.label} />,
    );
    expect(screen.getByRole("radio", { name: "A" })).not.toHaveAttribute("data-category");
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("data-category", "green");
  });
});
