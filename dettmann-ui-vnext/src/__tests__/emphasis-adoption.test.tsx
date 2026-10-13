import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../components/badge";
import { Tag } from "../components/tag";
import { Alert } from "../components/alert";
import { Checkbox } from "../components/checkbox";
import { Radio } from "../components/radio";
import { Toolbar } from "../components/toolbar";
import { ActionBar } from "../components/action-bar";
import { Modal } from "../components/modal";
import { Tabs } from "../components/tabs";
import { Table } from "../components/table";
import { Navbar } from "../templates/navbar";
import { ResourcePage } from "../templates/resource-page";

describe("Badge adopts emphasis × intent", () => {
  it("defaults to medium neutral without interactive states", () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText("New");
    expect(badge).toHaveAttribute("data-layer", "medium");
    expect(badge).toHaveAttribute("data-intent", "neutral");
    expect(badge.className).not.toMatch(/\bhover:/);
  });

  it("high badge is a brand fill; low is an outline", () => {
    render(
      <>
        <Badge emphasis="high">Hot</Badge>
        <Badge emphasis="low" intent="danger">
          Off
        </Badge>
      </>,
    );
    expect(screen.getByText("Hot")).toHaveAttribute("data-intent", "brand");
    expect(screen.getByText("Hot")).toHaveClass("bg-intent-fill", "text-on-intent");
    expect(screen.getByText("Off")).toHaveClass("bg-transparent", "text-intent-text", "border");
  });
});

describe("intent replaces tone", () => {
  it("Tag and Alert scope data-intent", () => {
    render(
      <>
        <Tag intent="success">Ok</Tag>
        <Alert.Root variant="warning">Careful</Alert.Root>
        <Alert.Root>Plain</Alert.Root>
      </>,
    );
    expect(screen.getByText("Ok")).toHaveAttribute("data-intent", "success");
    expect(screen.getByText("Careful").closest("[role=alert]")).toHaveAttribute("data-intent", "warning");
    expect(screen.getByText("Plain").closest("[role=alert]")).toHaveAttribute("data-intent", "neutral");
  });

  it("checked fills default to the brand intent", () => {
    render(<Checkbox aria-label="Agree" defaultChecked />);
    expect(screen.getByRole("checkbox", { name: "Agree" })).toHaveAttribute("data-intent", "brand");
  });
});

describe("structural layers and budget regions", () => {
  it("structural chrome declares the medium layer", () => {
    const { container } = render(
      <>
        <Navbar.Root brand="App" />
        <Toolbar start="Tools" />
        <Tabs.Root defaultValue="a">
          <Tabs.List>
            <Tabs.Trigger value="a">A</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        <Table.Root>
          <Table.Header>
            <tr>
              <th>Col</th>
            </tr>
          </Table.Header>
        </Table.Root>
      </>,
    );
    expect(container.querySelector("header")).toHaveAttribute("data-layer", "medium");
    expect(screen.getByRole("tablist")).toHaveAttribute("data-layer", "medium");
    expect(container.querySelector("thead")).toHaveAttribute("data-layer", "medium");
    expect(screen.getByText("Tools").parentElement).toHaveAttribute("data-layer", "medium");
  });

  it("action regions are budget regions", () => {
    render(
      <>
        <Toolbar start="Tools" />
        <ActionBar>Bar</ActionBar>
        <Modal.Footer>Foot</Modal.Footer>
        <ResourcePage title="Mods" primaryActions={<span>Act</span>}>
          body
        </ResourcePage>
      </>,
    );
    expect(screen.getByText("Tools").parentElement).toHaveAttribute("data-budget-region", "toolbar");
    expect(screen.getByText("Bar")).toHaveAttribute("data-budget-region", "action-bar");
    expect(screen.getByText("Foot")).toHaveAttribute("data-budget-region", "modal-footer");
    expect(screen.getByText("Act").parentElement).toHaveAttribute("data-budget-region", "page-actions");
  });
});

describe("Radio.Group intent", () => {
  it("items inherit the group intent (only the group defaults to brand)", () => {
    render(
      <Radio.Group name="g" intent="danger" defaultValue="a">
        <Radio.Item value="a" label="A" />
        <Radio.Item value="b" label="B" variant="card" />
      </Radio.Group>,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.closest("[data-intent]")?.getAttribute("data-intent")).toBe("danger");
    }
  });

  it("group without intent defaults to brand; an item intent still wins", () => {
    render(
      <Radio.Group name="h" defaultValue="a">
        <Radio.Item value="a" label="A" />
        <Radio.Item value="b" label="B" intent="success" />
      </Radio.Group>,
    );
    const [a, b] = screen.getAllByRole("radio");
    expect(a!.closest("[data-intent]")?.getAttribute("data-intent")).toBe("brand");
    expect(b!.getAttribute("data-intent")).toBe("success");
  });
});
