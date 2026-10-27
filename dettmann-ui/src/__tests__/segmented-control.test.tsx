import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { SegmentedControl } from "../components/segmented-control";

const options = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid", disabled: true },
  { value: "tree", label: "Tree" },
] as const;

describe("SegmentedControl", () => {
  it("is a radiogroup driven by arrows, skipping disabled options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="View" options={options} defaultValue="list" onChange={onChange} />);
    screen.getByRole("radio", { name: "List" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("tree");
    expect(screen.getByRole("radio", { name: "Tree" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("list");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("tree");
  });

  it("controlled does not change until the parent updates", async () => {
    const user = userEvent.setup();
    render(<SegmentedControl aria-label="View" options={options} value="list" onChange={() => {}} />);
    await user.click(screen.getByRole("radio", { name: "Tree" }));
    expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
  });

  it("sizes come from control primitives", () => {
    const { rerender } = render(<SegmentedControl aria-label="View" options={options} size="sm" />);
    expect(screen.getByRole("radio", { name: "List" })).toHaveClass("h-control-sm");
    rerender(<SegmentedControl aria-label="View" options={options} />);
    expect(screen.getByRole("radio", { name: "List" })).toHaveClass("h-control-md");
    rerender(<SegmentedControl aria-label="View" options={options} size="lg" />);
    const radio = screen.getByRole("radio", { name: "List" });
    expect(radio).toHaveClass("h-control-lg");
    expect(radio.className).not.toMatch(/\bh-(8|9|11)\b/);
  });

  it("selected segment is a bordered surface without shadow", () => {
    render(<SegmentedControl aria-label="View" options={options} defaultValue="tree" />);
    const indicator = screen.getByRole("radio", { name: "Tree" }).querySelector("[data-slot=indicator]")!;
    expect(indicator).toHaveClass("bg-surface", "border", "border-border", "rounded-chip");
    expect(indicator.className).not.toMatch(/shadow-/);
  });

  it("disabled option uses tokens, not opacity", () => {
    render(<SegmentedControl aria-label="View" options={options} />);
    const radio = screen.getByRole("radio", { name: "Grid" });
    expect(radio).toBeDisabled();
    expect(radio).toHaveClass("text-fg-subtle");
    expect(radio.className).not.toMatch(/opacity-/);
  });

  it("keeps at most one indicator when options change at runtime", () => {
    const { container, rerender } = render(<SegmentedControl aria-label="View" options={options} value="tree" />);
    expect(container.querySelectorAll("[data-slot=indicator]")).toHaveLength(1);
    rerender(<SegmentedControl aria-label="View" options={options.slice(0, 2)} value="tree" />);
    expect(container.querySelectorAll("[data-slot=indicator]")).toHaveLength(0);
    rerender(<SegmentedControl aria-label="View" options={options} value="list" />);
    expect(container.querySelectorAll("[data-slot=indicator]")).toHaveLength(1);
  });

  it("a disabled selected option still shows the indicator", () => {
    const { container } = render(<SegmentedControl aria-label="View" options={options} value="grid" />);
    expect(screen.getByRole("radio", { name: "Grid" })).toBeChecked();
    expect(container.querySelectorAll("[data-slot=indicator]")).toHaveLength(1);
  });

  it("declares the structural layer and the shared focus ring", () => {
    render(<SegmentedControl aria-label="View" options={options} />);
    expect(screen.getByRole("radiogroup", { name: "View" })).toHaveAttribute("data-layer", "medium");
    expect(screen.getByRole("radiogroup", { name: "View" })).toHaveClass("bg-structure");
    expect(screen.getByRole("radio", { name: "List" })).toHaveClass("focus-ring");
  });
});
