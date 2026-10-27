import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertTriangle } from "lucide-react";
import { StatusToggle, type StatusToggleState } from "../components/status-toggle";
import { Indicator } from "../components/indicator";
import { FileDropzone } from "../templates/file-dropzone";
import { Tag } from "../components/tag";
import { Badge } from "../components/badge";
import { Kbd } from "../primitives/kbd";

const labels: Record<StatusToggleState, string> = {
  on: "Enabled",
  off: "Disabled",
  unavailable: "Not installed",
  busy: "Installing",
};

describe("StatusToggle (L3)", () => {
  it("is a named switch that reports the requested state", async () => {
    const onCheckedChange = vi.fn();
    render(<StatusToggle state="off" label="SkyUI" stateLabels={labels} onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "SkyUI" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAccessibleDescription("Disabled");
    await userEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles off from on with the keyboard", async () => {
    const onCheckedChange = vi.fn();
    render(<StatusToggle state="on" label="SkyUI" stateLabels={labels} onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "SkyUI" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.focus();
    await userEvent.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it.each(["unavailable", "busy"] as const)("does not toggle while %s and says why", (state) => {
    const onCheckedChange = vi.fn();
    render(<StatusToggle state={state} label="SkyUI" stateLabels={labels} onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "SkyUI" });
    fireEvent.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(sw).toHaveAttribute("aria-disabled", "true");
    expect(sw).toHaveAccessibleDescription(labels[state]);
    if (state === "busy") expect(sw).toHaveAttribute("aria-busy", "true");
  });
});

describe("Indicator (L4)", () => {
  it("is an image named by its label, with the count visible", () => {
    render(<Indicator icon={AlertTriangle} intent="warning" count={3} label="3 problems" />);
    const img = screen.getByRole("img", { name: "3 problems" });
    expect(img).toHaveAttribute("data-intent", "warning");
    expect(img).toHaveTextContent("3");
    expect(img).toHaveAttribute("title", "3 problems");
  });

  it("uses foreground roles for the neutral intent", () => {
    render(<Indicator icon={AlertTriangle} label="None" />);
    expect(screen.getByRole("img", { name: "None" })).not.toHaveAttribute("data-intent");
  });
});

describe("FileDropzone host picker", () => {
  it("calls onBrowse instead of the file input and renders extra actions", async () => {
    const onBrowse = vi.fn();
    render(
      <FileDropzone onBrowse={onBrowse} browseLabel="Import file" actions={<button type="button">Import folder</button>} showSelection={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Import file" }));
    expect(onBrowse).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Import folder" })).toBeInTheDocument();
  });
});

describe("regressions found in F4", () => {
  it("a high button without intent paints with the brand intent", async () => {
    const { Button } = await import("../components/button");
    render(<Button emphasis="high">Install</Button>);
    expect(screen.getByRole("button", { name: "Install" })).toHaveAttribute("data-intent", "brand");
  });

});

describe("Tag, Badge and Kbd follow the visual language (D-033)", () => {
  it("Tag resolves color through the emphasis table", () => {
    render(<Tag intent="success">Ok</Tag>);
    const tag = screen.getByText("Ok");
    expect(tag).toHaveAttribute("data-layer", "medium");
    expect(tag).toHaveAttribute("data-intent", "success");
    expect(tag).toHaveClass("bg-intent-subtle", "text-intent-text", "border-intent-border");
    expect(tag.className).not.toMatch(/hover:/);
  });

  it("Tag defaults to neutral and low is an outline", () => {
    render(
      <>
        <Tag>Plain</Tag>
        <Tag emphasis="low" intent="danger">
          Off
        </Tag>
      </>,
    );
    expect(screen.getByText("Plain")).toHaveAttribute("data-intent", "neutral");
    expect(screen.getByText("Plain")).toHaveClass("bg-fill-neutral");
    const off = screen.getByText("Off");
    expect(off).toHaveAttribute("data-layer", "low");
    expect(off).toHaveClass("bg-transparent", "border", "text-intent-text");
  });

  it("Tag remove button is keyboard reachable and labelled", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Tag value="design" onRemove={onRemove} removeLabel="Remover design">
        Design
      </Tag>,
    );
    await user.tab();
    const remove = screen.getByRole("button", { name: "Remover design" });
    expect(remove).toHaveFocus();
    expect(remove).toHaveClass("focus-ring");
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledWith("design");
  });

  it("Badge and Tag use the pill primitive", () => {
    render(
      <>
        <Badge>New</Badge>
        <Tag onRemove={() => {}}>Design</Tag>
      </>,
    );
    expect(screen.getByText("New")).toHaveClass("rounded-pill");
    expect(screen.getByText("Design")).toHaveClass("rounded-pill");
    expect(screen.getByText("Design").innerHTML).not.toContain("rounded-full");
  });

  it("Kbd is flat", () => {
    render(<Kbd>Ctrl</Kbd>);
    const kbd = screen.getByText("Ctrl");
    expect(kbd).toHaveClass("rounded-chip", "border");
    expect(kbd.className).not.toMatch(/shadow-/);
  });
});
