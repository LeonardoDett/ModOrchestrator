import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Checkbox } from "../components/checkbox";
import { Radio } from "../components/radio";
import { Switch } from "../components/switch";
import { SegmentedControl } from "../components/segmented-control";
import { StatusToggle } from "../components/status-toggle";
import { Input } from "../components/input";
import { rowRecipe } from "../core/styles/row";

/**
 * Achados da revisão independente da onda 1. O `cn` não resolve conflito de classes e o
 * jsdom não aplica CSS: os testes afirmam que as classes concorrentes não coexistem.
 */

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Charlie" },
  { value: "d", label: "Delta", disabled: true },
];

function Multi({ initial, maxSelected }: { initial: string[]; maxSelected?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <Input.Root name="tags" value={value} onChange={setValue}>
      <Input.Label>Tags</Input.Label>
      <Input.Box>
        <Input.Select multiple options={OPTIONS} maxSelected={maxSelected} />
      </Input.Box>
    </Input.Root>
  );
}

describe("disabled option does not close the menu", () => {
  it("disabled rows keep pointer events so the option can hold the focus on the trigger", () => {
    expect(rowRecipe({ disabled: true })).not.toContain("pointer-events-none");
    expect(rowRecipe({ disabled: true })).toContain("cursor-not-allowed");
  });

  it("a mousedown anywhere in the panel never blurs the trigger", async () => {
    const user = userEvent.setup();
    render(<Multi initial={["a", "b"]} maxSelected={2} />);
    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(fireEvent.mouseDown(listbox)).toBe(false);
    await user.click(screen.getByRole("option", { name: "Charlie" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("keyboard skips options disabled by maxSelected", async () => {
    const user = userEvent.setup();
    render(<Multi initial={["a", "b"]} maxSelected={2} />);
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await user.keyboard("{ArrowDown}{End}");
    const active = document.getElementById(trigger.getAttribute("aria-activedescendant")!)!;
    expect(active).toHaveTextContent("Beta");
  });
});

describe("SegmentedControl keeps one tab stop", () => {
  const options = [
    { value: "list", label: "List" },
    { value: "grid", label: "Grid", disabled: true },
    { value: "tree", label: "Tree" },
  ];
  const stops = () => screen.getAllByRole("radio").filter((r) => r.getAttribute("tabindex") === "0");

  it("when the selected option is disabled", () => {
    render(<SegmentedControl aria-label="View" options={options} value="grid" />);
    expect(stops().map((r) => r.textContent)).toEqual(["List"]);
  });

  it("when the value is no longer among the options", () => {
    render(<SegmentedControl aria-label="View" options={options.slice(0, 2)} value="tree" />);
    expect(stops().map((r) => r.textContent)).toEqual(["List"]);
  });

  it("on the selected option otherwise", () => {
    render(<SegmentedControl aria-label="View" options={options} value="tree" />);
    expect(stops().map((r) => r.textContent)).toEqual(["Tree"]);
  });
});

describe("disabled and checked controls look disabled", () => {
  it("Checkbox only fills while enabled", () => {
    render(<Checkbox label="Agree" checked disabled />);
    const cls = screen.getByRole("checkbox", { name: "Agree" }).className.split(/\s+/);
    expect(cls).toContain("enabled:data-[state=checked]:bg-intent-fill");
    expect(cls).not.toContain("data-[state=checked]:bg-intent-fill");
    expect(cls).not.toContain("data-[state=indeterminate]:bg-intent-fill");
  });

  it("Switch only fills while enabled", () => {
    render(<Switch label="Auto" checked disabled />);
    const cls = screen.getByRole("switch", { name: "Auto" }).className.split(/\s+/);
    expect(cls).toContain("enabled:data-[state=checked]:bg-intent-fill");
    expect(cls).not.toContain("data-[state=checked]:bg-intent-fill");
  });

  it("Radio mutes border and dot when disabled", () => {
    render(
      <Radio.Group name="size" aria-label="Size" value="s" disabled>
        <Radio.Item value="s" label="Small" />
      </Radio.Group>,
    );
    const radio = screen.getByRole("radio", { name: "Small" });
    const dot = radio.querySelector("[data-state]")!;
    expect(radio.className.split(/\s+/)).not.toContain("data-[state=checked]:border-intent-fill");
    expect(dot.className).toContain("bg-fg-subtle");
    expect(dot.className).not.toContain("bg-intent-fill");
  });

  it("StatusToggle unavailable thumb has a single background and border", () => {
    render(<StatusToggle state="unavailable" label="SKSE" stateLabels={{ on: "On", off: "Off", unavailable: "N/A", busy: "Busy" }} />);
    const thumb = screen.getByRole("switch", { name: "SKSE" }).firstElementChild!;
    const cls = thumb.className.split(/\s+/);
    expect(cls.filter((c) => /^bg-/.test(c))).toEqual(["bg-sunken"]);
    expect(cls.filter((c) => /^border-/.test(c))).toEqual(["border-transparent"]);
  });
});

describe("Input.Box and Input.Label state classes do not compete", () => {
  function Field({ error }: { error?: string }) {
    const [value, setValue] = useState("");
    return (
      <Input.Root name="f" value={value} onChange={setValue} error={error}>
        <Input.Label data-testid="label">Field</Input.Label>
        <Input.Box data-testid="box">
          <Input.Field />
        </Input.Box>
      </Input.Root>
    );
  }
  const borders = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^(hover:)?border-(?!$)/.test(c) && c !== "border");

  it("rest: neutral border with hover", () => {
    render(<Field />);
    expect(borders(screen.getByTestId("box"))).toEqual(["border-border-strong", "hover:border-fg-muted"]);
  });

  it("error: only the danger border, no hover override", () => {
    render(<Field error="Required" />);
    expect(borders(screen.getByTestId("box"))).toEqual(["border-danger-border"]);
  });

  it("focus: only the focus border, no hover override", async () => {
    const user = userEvent.setup();
    render(<Field />);
    await user.click(screen.getByRole("textbox"));
    expect(borders(screen.getByTestId("box"))).toEqual(["border-focus"]);
  });

  it("disabled box has a single background and the field text is muted", () => {
    function Disabled() {
      return (
        <Input.Root name="d" value="x" onChange={() => {}} disabled>
          <Input.Box data-testid="dbox">
            <Input.Field aria-label="D" />
          </Input.Box>
        </Input.Root>
      );
    }
    render(<Disabled />);
    const bgs = screen.getByTestId("dbox").className.split(/\s+/).filter((c) => /^bg-/.test(c));
    expect(bgs).toEqual(["bg-sunken"]);
    expect(screen.getByLabelText("D")).toHaveClass("disabled:text-fg-subtle");
  });

  it("label carries exactly one text color per state", () => {
    const { rerender } = render(<Field />);
    const colors = () => screen.getByTestId("label").className.split(/\s+/).filter((c) => /^text-(fg|danger)/.test(c));
    expect(colors()).toEqual(["text-fg"]);
    rerender(<Field error="Required" />);
    expect(colors()).toEqual(["text-danger-text"]);
  });
});

describe("Input.Password never stays revealed while disabled", () => {
  it("masks when the Root becomes disabled", async () => {
    const user = userEvent.setup();
    function Harness({ disabled }: { disabled?: boolean }) {
      const [value, setValue] = useState("hunter2");
      return (
        <Input.Root name="s" value={value} onChange={setValue} disabled={disabled}>
          <Input.Label>Chave</Input.Label>
          <Input.Box>
            <Input.Password />
          </Input.Box>
        </Input.Root>
      );
    }
    const { rerender } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Show value" }));
    expect(screen.getByLabelText("Chave")).toHaveAttribute("type", "text");
    rerender(<Harness disabled />);
    expect(screen.getByLabelText("Chave")).toHaveAttribute("type", "password");
  });
});
