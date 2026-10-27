import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { Input, type SelectItem } from "../components/input";

const OPTIONS: SelectItem[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Charlie" },
  { value: "d", label: "Delta", disabled: true },
];

type SelectProps = Partial<ComponentProps<typeof Input.Select>>;

function Harness({
  initial = [],
  onChange,
  disabled,
  ...select
}: { initial?: string[] | string; onChange?: (v: string[]) => void; disabled?: boolean } & SelectProps) {
  const [value, setValue] = useState<string[] | string>(initial);
  const handle = (next: string[]) => {
    setValue(next);
    onChange?.(next);
  };
  return (
    <form aria-label="form">
      <Input.Root name="tags" disabled={disabled} {...({ value, onChange: handle } as { value: string[]; onChange: (v: string[]) => void })}>
        <Input.Label>Tags</Input.Label>
        <Input.Box>
          <Input.Select multiple options={OPTIONS} placeholder="Escolha" {...select} />
        </Input.Box>
      </Input.Root>
    </form>
  );
}

const trigger = () => screen.getByRole("combobox");
const option = (name: string) => screen.getByRole("option", { name });

const proto = HTMLElement.prototype;
const original = {
  offsetWidth: Object.getOwnPropertyDescriptor(proto, "offsetWidth"),
  clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth"),
};

afterEach(() => {
  if (original.offsetWidth) Object.defineProperty(proto, "offsetWidth", original.offsetWidth);
  if (original.clientWidth) Object.defineProperty(Element.prototype, "clientWidth", original.clientWidth);
});

describe("Input.Select multiple", () => {
  it("toggles options without closing the menu", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(trigger());
    await user.click(option("Alpha"));
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
    await user.click(option("Beta"));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(option("Alpha"));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("emits values in option order", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(trigger());
    await user.click(option("Charlie"));
    await user.click(option("Alpha"));
    expect(onChange).toHaveBeenLastCalledWith(["a", "c"]);
  });

  it("listbox is multiselectable and options reflect aria-selected", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["b"]} />);
    await user.click(trigger());
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
    expect(option("Beta")).toHaveAttribute("aria-selected", "true");
    expect(option("Alpha")).toHaveAttribute("aria-selected", "false");
    expect(option("Beta").querySelector("[data-slot=check]")).toHaveAttribute("data-state", "checked");
  });

  it("Enter and Space toggle the active option; Esc closes keeping the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
    await user.keyboard("{ArrowDown} ");
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(trigger()).toHaveFocus();
  });

  it("typeahead while closed does not change the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await user.keyboard("b");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("maxSelected disables the unchecked options but still lets checked ones go", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["a", "b"]} maxSelected={2} onChange={onChange} />);
    await user.click(trigger());
    expect(option("Charlie")).toHaveAttribute("aria-disabled", "true");
    await user.click(option("Charlie"));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(option("Alpha"));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("renders one hidden input per value for native forms", () => {
    const { container } = render(<Harness initial={["a", "c"]} />);
    const hidden = [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="tags"]')];
    expect(hidden.map((i) => i.value)).toEqual(["a", "c"]);
  });

  it("shows the selection as tags, or the placeholder when empty", () => {
    const { rerender } = render(<Harness />);
    expect(trigger()).toHaveTextContent("Escolha");
    rerender(<Harness key="2" initial={["c", "a"]} />);
    const tags = within(trigger()).getAllByText(/Alpha|Charlie/);
    expect(tags.map((t) => t.textContent)).toEqual(["Alpha", "Charlie"]);
  });

  it("selectedText replaces the tags", () => {
    render(<Harness initial={["a", "b"]} selectedText={(n) => `${n} selecionados`} />);
    expect(trigger()).toHaveTextContent("2 selecionados");
    expect(within(trigger()).queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("a string value from Root is treated as empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="a" onChange={onChange} />);
    expect(trigger()).toHaveTextContent("Escolha");
    await user.click(trigger());
    await user.click(option("Beta"));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("ignores orphan values in the trigger but keeps them on change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["zzz", "a"]} onChange={onChange} />);
    expect(trigger()).not.toHaveTextContent("zzz");
    await user.click(trigger());
    await user.click(option("Beta"));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "zzz"]);
  });

  it("disabled Root never opens", async () => {
    const user = userEvent.setup();
    render(<Harness disabled initial={["a"]} />);
    expect(trigger()).toBeDisabled();
    await user.click(trigger());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("collapses overflowing tags into +N with an accessible name", () => {
    Object.defineProperty(proto, "offsetWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.slot === "tag" ? 60 : 0;
      },
    });
    Object.defineProperty(Element.prototype, "clientWidth", {
      configurable: true,
      get(this: Element) {
        return (this as HTMLElement).dataset?.slot === "tags" ? 150 : 0;
      },
    });
    render(<Harness initial={["a", "b", "c"]} moreLabel={(n) => `mais ${n}`} />);
    expect(within(trigger()).getByText("Alpha")).toBeInTheDocument();
    expect(within(trigger()).queryByText("Beta")).not.toBeInTheDocument();
    const more = within(trigger()).getByLabelText("mais 2");
    expect(more).toHaveTextContent("+2");
  });

  it("never wraps the trigger content", () => {
    render(<Harness initial={["a", "b"]} />);
    const tags = trigger().querySelector("[data-slot=tags]")!;
    expect(tags).toHaveClass("flex-nowrap", "overflow-hidden");
  });

  it("single select keeps closing on choice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Input.Root name="one" value="" onChange={onChange}>
        <Input.Box>
          <Input.Select aria-label="One" options={OPTIONS} />
        </Input.Box>
      </Input.Root>,
    );
    await user.click(screen.getByRole("combobox", { name: "One" }));
    await user.click(option("Beta"));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
