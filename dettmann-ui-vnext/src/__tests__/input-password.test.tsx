import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { Input } from "../components/input";

type PasswordProps = Partial<ComponentProps<typeof Input.Password>>;

function Harness({
  initial = "",
  onChange,
  disabled,
  onSubmit,
  ...password
}: { initial?: string; onChange?: (v: string) => void; disabled?: boolean; onSubmit?: () => void } & PasswordProps) {
  const [value, setValue] = useState(initial);
  return (
    <form
      aria-label="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <Input.Root
        name="secret"
        value={value}
        disabled={disabled}
        onChange={(v: string) => {
          setValue(v);
          onChange?.(v);
        }}
      >
        <Input.Label>Chave</Input.Label>
        <Input.Box>
          <Input.Password {...password} />
        </Input.Box>
      </Input.Root>
      <button type="button">outside</button>
    </form>
  );
}

const field = () => screen.getByLabelText("Chave") as HTMLInputElement;
const toggle = () => screen.getByRole("button", { name: /show value|hide value/i });

describe("Input.Password", () => {
  it("masks by default and reveals on toggle", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hunter2" />);
    expect(field()).toHaveAttribute("type", "password");
    expect(toggle()).toHaveAccessibleName("Show value");
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle());
    expect(field()).toHaveAttribute("type", "text");
    expect(toggle()).toHaveAccessibleName("Hide value");
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle());
    expect(field()).toHaveAttribute("type", "password");
  });

  it("labels are overridable", () => {
    render(<Harness revealLabel="Mostrar" hideLabel="Ocultar" />);
    expect(screen.getByRole("button", { name: "Mostrar" })).toBeInTheDocument();
  });

  it("is controlled when `revealed` is given", async () => {
    const user = userEvent.setup();
    const onRevealedChange = vi.fn();
    render(<Harness revealed={false} onRevealedChange={onRevealedChange} />);
    await user.click(toggle());
    expect(onRevealedChange).toHaveBeenCalledWith(true);
    expect(field()).toHaveAttribute("type", "password");
  });

  it("hides again when focus leaves field and button", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hunter2" />);
    await user.click(field());
    await user.click(toggle());
    expect(field()).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(field()).toHaveAttribute("type", "password");
  });

  it("clicking the eye from the focused field reveals exactly once", async () => {
    const user = userEvent.setup();
    const onRevealedChange = vi.fn();
    render(<Harness initial="hunter2" onRevealedChange={onRevealedChange} />);
    await user.click(field());
    await user.click(toggle());
    expect(field()).toHaveAttribute("type", "text");
    expect(onRevealedChange).toHaveBeenCalledTimes(1);
    expect(onRevealedChange).toHaveBeenCalledWith(true);
  });

  it("keyboard: Tab to the eye, Enter reveals and focus returns to the field", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hunter2" />);
    await user.click(field());
    await user.tab();
    expect(toggle()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(field()).toHaveAttribute("type", "text");
    expect(field()).toHaveFocus();
  });

  it("hideOnBlur={false} keeps it revealed", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hunter2" hideOnBlur={false} />);
    await user.click(toggle());
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(field()).toHaveAttribute("type", "text");
  });

  it("keeps the caret when toggling", async () => {
    const user = userEvent.setup();
    render(<Harness initial="hunter2" />);
    await user.click(field());
    field().setSelectionRange(3, 3);
    await user.click(toggle());
    expect(field()).toHaveFocus();
    expect(field().selectionStart).toBe(3);
  });

  it("revealable={false} renders no button", () => {
    render(<Harness revealable={false} />);
    expect(screen.queryByRole("button", { name: /show value/i })).not.toBeInTheDocument();
    expect(field()).toHaveAttribute("type", "password");
  });

  it("toggle is type=button and does not submit the form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    expect(toggle()).toHaveAttribute("type", "button");
    await user.click(toggle());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("has safe defaults that the consumer can override", () => {
    const { rerender } = render(<Harness />);
    expect(field()).toHaveAttribute("autocomplete", "current-password");
    expect(field()).toHaveAttribute("spellcheck", "false");
    expect(field()).toHaveAttribute("autocapitalize", "off");
    rerender(<Harness autoComplete="off" />);
    expect(field()).toHaveAttribute("autocomplete", "off");
  });

  it("disabled Root disables field and toggle", async () => {
    const user = userEvent.setup();
    render(<Harness disabled initial="hunter2" />);
    expect(field()).toBeDisabled();
    expect(toggle()).toBeDisabled();
    await user.click(toggle());
    expect(field()).toHaveAttribute("type", "password");
  });

  it("forwards value changes as plain strings to Root", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(field(), "ab");
    expect(onChange).toHaveBeenLastCalledWith("ab");
  });

  it("the toggle follows the visual language", () => {
    render(<Harness />);
    expect(toggle()).toHaveClass("focus-ring-inset", "rounded-chip");
    expect(toggle()).toHaveAttribute("data-layer", "low");
  });
});
