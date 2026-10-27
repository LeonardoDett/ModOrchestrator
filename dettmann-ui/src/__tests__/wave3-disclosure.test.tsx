import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Tabs } from "../components/tabs";
import { Accordion } from "../components/accordion";
import { Inspector } from "../components/inspector";
import { FilterBar } from "../components/filter-bar";

const tokens = (el: Element) => el.className.split(/\s+/);

function tabs(variant?: "underline" | "segmented") {
  return (
    <Tabs.Root defaultValue="a" variant={variant}>
      <Tabs.List aria-label="Sections">
        <Tabs.Trigger value="a">Alpha</Tabs.Trigger>
        <Tabs.Trigger value="b">Beta</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Panel value="a">Panel A</Tabs.Panel>
      <Tabs.Panel value="b">Panel B</Tabs.Panel>
    </Tabs.Root>
  );
}

describe("Tabs (D-033)", () => {
  it("the active underline tab carries the brand indicator and a single border color", () => {
    render(tabs());
    const active = screen.getByRole("tab", { name: "Alpha" });
    const idle = screen.getByRole("tab", { name: "Beta" });
    const borders = (el: Element) => tokens(el).filter((c) => /^border-(?!b-|r-)/.test(c));
    expect(borders(active)).toEqual(["border-brand-fill"]);
    expect(borders(idle)).toEqual(["border-transparent"]);
    expect(active).toHaveClass("focus-ring-inset", "text-fg");
  });

  it("the active segmented tab is tinted, not elevated", () => {
    render(tabs("segmented"));
    const active = screen.getByRole("tab", { name: "Alpha" });
    expect(active).toHaveClass("bg-selected", "text-fg");
    expect(active.className).not.toMatch(/shadow-/);
  });

  it("switching tabs leaves a single panel", async () => {
    const user = userEvent.setup();
    render(tabs());
    await user.click(screen.getByRole("tab", { name: "Beta" }));
    await user.click(screen.getByRole("tab", { name: "Alpha" }));
    await user.click(screen.getByRole("tab", { name: "Beta" }));
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel B");
  });

  it("the panel enters through the motion layer", async () => {
    const animate = vi.fn(() => ({ cancel() {}, finished: new Promise(() => {}) }));
    (HTMLElement.prototype as unknown as { animate?: unknown }).animate = animate;
    try {
      const user = userEvent.setup();
      render(tabs());
      animate.mockClear();
      await user.click(screen.getByRole("tab", { name: "Beta" }));
      expect(animate).toHaveBeenCalled();
      expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    } finally {
      delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    }
  });
});

describe("Accordion (D-033)", () => {
  it("trigger uses the inset focus ring and the content still toggles", async () => {
    const user = userEvent.setup();
    render(
      <Accordion.Root>
        <Accordion.Item value="a">
          <Accordion.Trigger value="a">Details</Accordion.Trigger>
          <Accordion.Content value="a">Body</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>,
    );
    const trigger = screen.getByRole("button", { name: "Details" });
    expect(trigger).toHaveClass("focus-ring-inset");
    expect(screen.queryByText("Body")).toBeNull();
    await user.click(trigger);
    expect(screen.getByRole("region")).toHaveTextContent("Body");
    await user.click(trigger);
    expect(screen.queryByText("Body")).toBeNull();
  });
});

describe("Inspector and FilterBar declare the structural layer", () => {
  it("Inspector header is medium structure", () => {
    render(
      <Inspector title="SkyUI" description="5.2">
        Body
      </Inspector>,
    );
    const header = screen.getByRole("heading", { name: "SkyUI" }).closest("[data-layer]")!;
    expect(header).toHaveAttribute("data-layer", "medium");
    expect(header).toHaveClass("bg-structure");
  });

  it("FilterBar is a medium region with an overridable filters label", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    const onFiltersClick = vi.fn();
    render(
      <FilterBar
        data-testid="bar"
        query=""
        onQueryChange={onQueryChange}
        queryPlaceholder="Buscar mods"
        filtersLabel="Filtros"
        activeFilterCount={2}
        onFiltersClick={onFiltersClick}
      />,
    );
    const bar = screen.getByTestId("bar");
    expect(bar).toHaveAttribute("data-layer", "medium");
    expect(bar).toHaveAttribute("data-budget-region", "filter-bar");
    expect(bar).toHaveClass("bg-structure");
    const filters = screen.getByRole("button", { name: /Filtros/ });
    expect(filters).toHaveTextContent("2");
    await user.click(filters);
    expect(onFiltersClick).toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Buscar mods" }), "s");
    expect(onQueryChange).toHaveBeenLastCalledWith("s");
  });

  it("FilterBar keeps the default English label", () => {
    render(<FilterBar onFiltersClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });
});
