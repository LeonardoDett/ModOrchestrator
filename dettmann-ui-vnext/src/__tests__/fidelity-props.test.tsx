import { forwardRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "../components/data-table";
import { ResourcePage } from "../components/resource-page";
import { Switch } from "../components/switch";
import { SwatchPicker } from "../components/swatch-picker";
import { Alert } from "../components/alert";
import { Button } from "../components/button";
import { Checkbox } from "../components/checkbox";
import { Indicator } from "../components/indicator";
import { List } from "../components/list";
import { Modal } from "../components/modal";
import { Radio } from "../components/radio";
import { ModalFooter } from "../components/modal/modal.footer";
import { ModalBody } from "../components/modal/modal.body";
import { ModalHeader } from "../components/modal/modal.header";
import { Stepper } from "../components/stepper";
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

  it("Modal.Header bar is one 76 px line and Modal.Footer lg a 64 px bar", () => {
    render(
      <>
        <ModalHeader layout="bar">h</ModalHeader>
        <ModalFooter size="lg">f</ModalFooter>
      </>,
    );
    expect(screen.getByText("h").className).toContain("h-19");
    expect(screen.getByText("f").className).toContain("h-16");
  });

  it("Alert band runs edge to edge with only the bottom line", () => {
    render(
      <Alert.Root band intent="info">
        <Alert.Description>Escolhas anteriores carregadas.</Alert.Description>
      </Alert.Root>,
    );
    const band = screen.getByRole("alert");
    expect(band.className).toContain("border-b");
    expect(band.className).not.toContain("rounded-card");
    expect(band).toHaveAttribute("data-intent", "info");
  });

  it("Radio and Checkbox rows are 44 px bordered options with an end slot", () => {
    render(
      <>
        <Radio.Group name="g" value="b" onValueChange={() => {}}>
          <Radio.Item variant="row" value="a" label="Leves" />
          <Radio.Item variant="row" value="b" label="Fortes" action={<span>Recomendado</span>} />
        </Radio.Group>
        <Checkbox variant="row" label="Auroras" checked action={<span>Anterior</span>} />
      </>,
    );
    const strong = screen.getByRole("radio", { name: /Fortes/ });
    expect(strong.className).toContain("min-h-11");
    expect(strong).toHaveAttribute("data-state", "checked");
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: "Auroras" });
    expect(box.parentElement!.className).toContain("min-h-11");
    expect(screen.getByText("Anterior")).toBeInTheDocument();
  });

  it("Stepper list draws rows without connectors and a green check on done steps", () => {
    const { container } = render(
      <Stepper.Root variant="list" orientation="vertical" value={1}>
        <Stepper.Step index={0}>
          <Stepper.StepIndicator data-testid="done" />
          <Stepper.StepLabel>Base</Stepper.StepLabel>
        </Stepper.Step>
        <Stepper.Step index={1}>
          <Stepper.StepIndicator />
          <Stepper.StepLabel>Clima</Stepper.StepLabel>
        </Stepper.Step>
      </Stepper.Root>,
    );
    expect(screen.getByTestId("done")).toHaveAttribute("data-intent", "success");
    const current = container.querySelector("[aria-current=step]") as HTMLElement;
    expect(current.className).toContain("bg-selected");
    expect(container.querySelector("[role=separator], hr")).toBeNull();
  });

  it("StatTile inline puts the icon square beside the number", () => {
    const Doc = forwardRef<SVGSVGElement>((props, ref) => <svg ref={ref} data-testid="doc" {...props} />);
    render(<StatTile layout="inline" icon={Doc} label="arquivos" value="386" />);
    const root = screen.getByText("386").closest("[data-intent]") as HTMLElement;
    expect(root.className).toContain("flex-row");
    expect(screen.getByTestId("doc").closest("span.size-8")).not.toBeNull();
  });

  it("Modal.Body padding none leaves layout and scroll to the screen", () => {
    render(
      <Modal.Root open onOpenChange={() => {}}>
        <Modal.Content aria-describedby={undefined}>
          <ModalBody padding="none">corpo</ModalBody>
        </Modal.Content>
      </Modal.Root>,
    );
    const body = screen.getByText("corpo");
    expect(body.className).toContain("overflow-hidden");
    expect(body.className).not.toContain("px-6");
  });

  it("ResourcePage workspace bleed runs the content edge to edge under a line", () => {
    render(
      <ResourcePage layout="workspace" bleed title="Conflitos">
        <div>painéis</div>
      </ResourcePage>,
    );
    const main = screen.getByRole("main");
    expect(main.className).not.toContain("px-7");
    expect(screen.getByText("painéis").parentElement!.className).toContain("border-t");
  });

  it("Indicator chip with a status intent is tinted as a whole", () => {
    const Swords = ({ className }: { className?: string }) => <svg className={className} />;
    render(<Indicator variant="chip" intent="warning" icon={Swords} value="12" label="pares a decidir" />);
    const chip = screen.getByText("pares a decidir").parentElement as HTMLElement;
    expect(chip).toHaveAttribute("data-intent", "warning");
    expect(chip.className).toContain("bg-intent-subtle");
  });

  it("List pane has 56 px rows edge to edge with the selection bar", () => {
    render(
      <List.Root
        density="pane"
        aria-label="Mods com conflito"
        items={[{ id: "a", name: "Rochas A" }, { id: "b", name: "Rochas B" }]}
        selectedKeys={["a"]}
        renderItem={(m) => <List.Item title={m.name} description="contra 2 mods" meta="1" />}
      />,
    );
    const list = screen.getByRole("listbox");
    expect(list.className).not.toContain("rounded-control");
    const row = screen.getByRole("option", { name: /Rochas A/ });
    expect(row.className).toContain("h-14");
    expect(row.className).toContain("bg-selected");
  });

  it("Button inline is a link inside text, with no box height", () => {
    render(<Button size="inline" emphasis="low" intent="brand">2 arquivos</Button>);
    const link = screen.getByRole("button", { name: "2 arquivos" });
    expect(link.className).toContain("h-auto");
    expect(link.className).not.toContain("h-control");
  });

  it("Indicator chip takes a lead text and a limit meter", () => {
    render(<Indicator variant="chip" lead="Completos" value="198" label="de 254" meter={0.78} meterIntent="warning" />);
    expect(screen.getByText("Completos")).toBeInTheDocument();
    const meter = screen.getByRole("img", { name: "78%" });
    expect((meter.firstElementChild as HTMLElement).style.width).toBe("78%");
    expect(meter.firstElementChild).toHaveAttribute("data-intent", "warning");
  });
});
