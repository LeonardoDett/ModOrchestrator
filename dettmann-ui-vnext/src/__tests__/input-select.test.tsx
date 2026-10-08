import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Input, type SelectItem } from "../components/input";
import { ThemeScope } from "../theme";

const OPTIONS: SelectItem[] = [
  { value: "dev", label: "Developer" },
  { value: "design", label: "Designer", description: "UI e UX" },
  { value: "docs", label: "Documentation", disabled: true },
  { value: "data", label: "Data" },
];

function Harness({
  initial = "",
  options = OPTIONS,
  onChange,
  disabled,
  placeholder,
}: {
  initial?: string;
  options?: SelectItem[];
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form aria-label="form">
      <Input.Root
        name="role"
        value={value}
        disabled={disabled}
        onChange={(v: string | string[]) => {
          setValue(v as string);
          onChange?.(v as string);
        }}
      >
        <Input.Label>Função</Input.Label>
        <Input.Box>
          <Input.Select options={options} placeholder={placeholder} />
        </Input.Box>
      </Input.Root>
    </form>
  );
}

const trigger = () => screen.getByRole("combobox", { name: "Função" });

describe("Input.Select (custom)", () => {
  it("is a labelled combobox showing the selected label and submitting through a hidden input", () => {
    const { container } = render(<Harness initial="design" />);
    expect(trigger()).toHaveTextContent("Designer");
    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    const hidden = container.querySelector('input[type="hidden"][name="role"]') as HTMLInputElement;
    expect(hidden.value).toBe("design");
  });

  it("shows the placeholder when there is no value", () => {
    render(<Harness placeholder="Escolha…" />);
    expect(trigger()).toHaveTextContent("Escolha…");
  });

  it("opens on click, marks the selected option and selects with a plain string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="dev" onChange={onChange} />);
    await user.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Developer/ })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: /Data/ }));
    expect(onChange).toHaveBeenCalledWith("data");
    expect(onChange.mock.calls[0]?.[0]).not.toHaveProperty("target");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).toHaveFocus();
  });

  it("does not select disabled options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(trigger());
    const docs = screen.getByRole("option", { name: /Documentation/ });
    expect(docs).toHaveAttribute("aria-disabled", "true");
    await user.click(docs);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("navigates with the keyboard, skipping disabled options, and commits with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="design" onChange={onChange} />);
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const active = () => document.getElementById(trigger().getAttribute("aria-activedescendant") ?? "");
    expect(active()).toHaveTextContent("Designer");
    await user.keyboard("{ArrowDown}");
    expect(active()).toHaveTextContent("Data");
    await user.keyboard("{Home}");
    expect(active()).toHaveTextContent("Developer");
    await user.keyboard("{End}");
    expect(active()).toHaveTextContent("Data");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("data");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape and Tab close without changing the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="dev" onChange={onChange} />);
    trigger().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    await user.keyboard(" {ArrowDown}");
    await user.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("typeahead on the closed trigger selects without opening, like a native select", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="dev" onChange={onChange} />);
    trigger().focus();
    await user.keyboard("da");
    expect(onChange).toHaveBeenLastCalledWith("data");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("typeahead while open moves the active option", async () => {
    const user = userEvent.setup();
    render(<Harness initial="dev" />);
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("des");
    const activeId = trigger().getAttribute("aria-activedescendant") ?? "";
    expect(document.getElementById(activeId)).toHaveTextContent("Designer");
  });

  it("renders groups with accessible names, descriptions and icons", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        options={[
          { value: "tex", label: "Texturas", icon: <svg data-testid="icon-tex" />, description: "Retexturas" },
          { label: "Gameplay", options: [{ value: "combat", label: "Combate" }] },
        ]}
      />,
    );
    await user.click(trigger());
    expect(screen.getByRole("group", { name: "Gameplay" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Texturas/ })).toHaveTextContent("Retexturas");
    expect(screen.getByTestId("icon-tex")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Combate/ }));
    expect(trigger()).toHaveTextContent("Combate");
  });

  it("disabled Root disables the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    expect(trigger()).toBeDisabled();
    await user.click(trigger());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("the menu inherits the ThemeScope and runs at the responsive motion level", async () => {
    const user = userEvent.setup();
    render(
      <ThemeScope theme="graphite" mode="dark">
        <Harness />
      </ThemeScope>,
    );
    await user.click(trigger());
    const listbox = screen.getByRole("listbox");
    expect(listbox.closest('[data-theme="graphite"][data-ui-mode="dark"]')).not.toBeNull();
    expect(listbox.closest('[data-motion="responsive"]')).not.toBeNull();
  });

  it("positions the menu with left/top so the entrance transform can't displace it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    expect(screen.getByRole("listbox").style.transform).toBe("");
  });

  it("animates the menu entrance through WAAPI when available", async () => {
    const user = userEvent.setup();
    const spy = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }) as unknown as Animation);
    const original = Element.prototype.animate;
    (Element.prototype as { animate: unknown }).animate = spy;
    try {
      render(<Harness />);
      await user.click(trigger());
      expect(spy).toHaveBeenCalled();
    } finally {
      (Element.prototype as { animate: unknown }).animate = original;
    }
  });
});
