import { forwardRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "../components/data-table";
import { ResourcePage } from "../components/resource-page";
import { Switch } from "../components/switch";
import { SwatchPicker } from "../components/swatch-picker";
import { Modal } from "../components/modal";
import { ModalFooter } from "../components/modal/modal.footer";
import { ModalHeader } from "../components/modal/modal.header";
import { StatTile } from "../components/stat-tile";
import { Table } from "../components/table";
import { Tabs } from "../components/tabs";
import { Tag, TagAdd } from "../components/tag";
import { Tree } from "../components/tree";

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

  it("Tree rows variant draws edge-to-edge 34 px rows with the end columns", () => {
    render(
      <Tree
        aria-label="Arquivos"
        variant="rows"
        indent={18}
        defaultExpanded={new Set(["meshes"])}
        nodes={[{ id: "meshes", label: "meshes", children: [{ id: "a.nif", label: "a.nif" }] }]}
        renderEnd={(n) => <span>{n.id === "a.nif" ? "No jogo" : ""}</span>}
      />,
    );
    const leaf = screen.getAllByRole("treeitem")[1]!.firstElementChild as HTMLElement;
    expect(leaf.className).toContain("h-8.5");
    expect(leaf.className).toContain("border-b");
    expect(leaf.className).not.toContain("rounded-chip");
    expect(leaf.style.paddingLeft).toBe("42px");
    expect(screen.getByText("No jogo")).toBeInTheDocument();
  });

  it("StatTile lg tints only the icon square and outlined paints the border", () => {
    const Arrow = forwardRef<SVGSVGElement>((props, ref) => <svg ref={ref} data-testid="arrow" {...props} />);
    render(<StatTile size="lg" outlined intent="danger" icon={Arrow} label="Perde" value="25" unit="arquivos" />);
    const root = screen.getByText("Perde").closest("[data-intent]") as HTMLElement;
    expect(root).toHaveAttribute("data-intent", "danger");
    expect(root.className).toContain("border-intent-border");
    expect(root.className).not.toContain("border-border");
    expect(screen.getByText("25").className).not.toContain("text-intent-text");
    expect(screen.getByTestId("arrow").closest("span.size-6")?.className).toContain("bg-intent-subtle");
  });

  it("StatTile outlined without an intent keeps the neutral border", () => {
    render(<StatTile size="lg" outlined label="Mods" value="7" />);
    const root = screen.getByText("Mods").parentElement as HTMLElement;
    expect(root.className).toContain("border-border");
  });

  it("Modal.Header stacked lays rows in a column with no bottom padding", () => {
    render(<ModalHeader layout="stacked">x</ModalHeader>);
    const header = screen.getByText("x");
    expect(header.className).toContain("flex-col");
    expect(header.className).not.toContain("pb-4");
    expect(header).toHaveAttribute("data-layer", "medium");
  });

  it("Modal.Footer sm is a 48 px status line", () => {
    render(<ModalFooter size="sm">y</ModalFooter>);
    const footer = screen.getByText("y");
    expect(footer.className).toContain("h-12");
    expect(footer.className).toContain("justify-between");
    expect(footer.className).not.toContain("min-h-15");
  });

  it("Tabs sm are 38 px tabs with no line of their own", () => {
    render(
      <Tabs.Root size="sm" defaultValue="a">
        <Tabs.List aria-label="Seções">
          <Tabs.Trigger value="a">Resumo</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>,
    );
    expect(screen.getByRole("tab", { name: "Resumo" }).className).toContain("h-9.5");
    expect(screen.getByRole("tablist").className).not.toContain("border-b");
  });

  it("Tag shape rounded and outline off; TagAdd is a dashed pill button", () => {
    render(
      <>
        <Tag shape="rounded" color="green">Gráficos</Tag>
        <Tag size="sm" outline={false} dot color="violet">pesado</Tag>
        <TagAdd onClick={() => {}}>+ tag</TagAdd>
      </>,
    );
    const cat = screen.getByText("Gráficos");
    expect(cat.className).toContain("rounded-control");
    expect(cat.className).not.toContain("rounded-pill");
    expect(screen.getByText("pesado").className).toContain("border-transparent");
    expect(screen.getByText("pesado").className).not.toContain("border-intent-border");
    const add = screen.getByRole("button", { name: "+ tag" });
    expect(add.className).toContain("border-dashed");
    expect(add.className).toContain("h-5.5");
  });

  it("Modal.Title lg is the 20 px name of a detail header", () => {
    render(
      <Modal.Root open onOpenChange={() => {}}>
        <Modal.Content aria-describedby={undefined}>
          <Modal.Title size="lg">Malhas</Modal.Title>
        </Modal.Content>
      </Modal.Root>,
    );
    expect(screen.getByRole("heading", { name: "Malhas" }).className).toContain("text-xl");
  });

  it("Table relaxed has 48 px rows, a 36 px header and 16 px cell padding", () => {
    render(
      <Table.Root density="relaxed">
        <Table.Header>
          <Table.Row>
            <Table.Head>Mod</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Neve</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>,
    );
    const head = screen.getByRole("columnheader", { name: "Mod" });
    expect(head.className).toContain("h-9");
    expect(head.className).not.toContain("h-control-sm");
    const cell = screen.getByRole("cell", { name: "Neve" });
    expect(cell.className).toContain("px-4");
    expect(cell.parentElement!.className).toContain("h-12");
  });
});
