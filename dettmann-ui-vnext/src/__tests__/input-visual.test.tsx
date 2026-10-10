import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { Input } from "../components/input";
import { rowRecipe } from "../core/styles/row";

const OPTIONS = [
  { value: "dev", label: "Developer" },
  { value: "design", label: "Designer" },
  { value: "docs", label: "Documentation", disabled: true },
];

function Root({
  children,
  initial = "",
  disabled,
  error,
}: {
  children: ReactNode;
  initial?: string | string[];
  disabled?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState<string | string[]>(initial);
  return (
    <Input.Root
      name="field"
      disabled={disabled}
      error={error}
      {...({ value, onChange: setValue } as { value: string; onChange: (v: string) => void })}
    >
      <Input.Label>Field</Input.Label>
      <Input.Box data-testid="box">{children}</Input.Box>
    </Input.Root>
  );
}

describe("Input.Box (D-033)", () => {
  it("is flat: border carries rest, focus, error and disabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Root>
        <Input.Field />
      </Root>,
    );
    const box = screen.getByTestId("box");
    expect(box.className).not.toMatch(/shadow-/);
    expect(box).toHaveClass("border", "border-border-strong");
    await user.click(screen.getByRole("textbox"));
    expect(box).toHaveClass("border-focus");
    rerender(
      <Root error="Required">
        <Input.Field />
      </Root>,
    );
    expect(screen.getByTestId("box")).toHaveClass("border-danger-border");
    rerender(
      <Root disabled>
        <Input.Field />
      </Root>,
    );
    expect(screen.getByTestId("box")).toHaveClass("bg-sunken", "text-fg-subtle");
  });

  it("the field leaves the focus indication to the box", () => {
    render(
      <Root>
        <Input.Field />
      </Root>,
    );
    expect(screen.getByRole("textbox")).toHaveClass("focus-bare");
  });
});

describe("option rows (D-033)", () => {
  it("row recipe supports multi-line options", () => {
    expect(rowRecipe({ multiline: true })).toContain("min-h-control-sm");
    expect(rowRecipe({ multiline: true })).not.toMatch(/(^|\s)h-control-sm/);
  });

  it("Select options are compact rows inside the only elevated part", async () => {
    const user = userEvent.setup();
    render(
      <Root initial="design">
        <Input.Select options={OPTIONS} />
      </Root>,
    );
    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("shadow-overlay", "rounded-card", "border");
    expect(screen.getByRole("option", { name: "Developer" })).toHaveClass("h-control-sm");
    expect(screen.getByRole("option", { name: "Designer" })).toHaveClass("bg-selected");
    const disabled = screen.getByRole("option", { name: "Documentation" });
    expect(disabled).toHaveClass("text-fg-subtle");
    expect(disabled.className).not.toMatch(/opacity-/);
  });

  it("Combobox options are compact rows and the empty message is announced", async () => {
    const user = userEvent.setup();
    render(
      <Root>
        <Input.Combobox options={OPTIONS} emptyMessage="Nada encontrado" />
      </Root>,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    expect(screen.getByRole("listbox")).toHaveClass("shadow-overlay");
    expect(screen.getByRole("option", { name: "Developer" })).toHaveClass("h-control-sm");
    await user.keyboard("zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Nada encontrado");
  });

  it("MultiSelect options are compact rows and the empty message is announced", async () => {
    const user = userEvent.setup();
    render(
      <Root initial={["dev"]}>
        <Input.MultiSelect options={OPTIONS} emptyMessage="Nada encontrado" />
      </Root>,
    );
    const input = screen.getByRole("textbox");
    await user.click(input);
    expect(screen.getByRole("listbox")).toHaveClass("shadow-overlay");
    expect(screen.getByRole("option", { name: "Developer" })).toHaveClass("h-control-sm", "bg-selected");
    await user.keyboard("zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Nada encontrado");
  });
});

describe("Input.Number steppers (D-033)", () => {
  it("disable at the limit with tokens, not opacity", () => {
    render(
      <Root initial="10">
        <Input.Number min={0} max={10} incrementLabel="Mais" decrementLabel="Menos" />
      </Root>,
    );
    const more = screen.getByRole("button", { name: "Mais" });
    expect(more).toBeDisabled();
    expect(more).toHaveClass("disabled:text-fg-subtle");
    expect(more.className).not.toMatch(/opacity-/);
    expect(screen.getByRole("button", { name: "Menos" })).toHaveClass("focus-ring-inset");
  });
});
