import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertTriangle } from "lucide-react";
import { StatusToggle, type StatusToggleState } from "../components/status-toggle";
import { Indicator } from "../components/indicator";
import { FileDropzone } from "../templates/file-dropzone";

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
    render(<Indicator icon={AlertTriangle} tone="warning" count={3} label="3 problems" />);
    const img = screen.getByRole("img", { name: "3 problems" });
    expect(img).toHaveAttribute("data-tone", "warning");
    expect(img).toHaveTextContent("3");
    expect(img).toHaveAttribute("title", "3 problems");
  });

  it("uses foreground roles for neutral tones", () => {
    render(<Indicator icon={AlertTriangle} label="None" />);
    expect(screen.getByRole("img", { name: "None" })).not.toHaveAttribute("data-tone");
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
  it("a solid button without tone paints with the primary tone", async () => {
    const { Button } = await import("../components/button");
    render(<Button>Install</Button>);
    expect(screen.getByRole("button", { name: "Install" })).toHaveAttribute("data-tone", "primary");
  });

});
