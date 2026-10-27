import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Input } from "../components/input";

function Harness({ initial = "10", onCommit }: { initial?: string; onCommit?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Input.Root
      name="n"
      value={value}
      onChange={(v: string) => {
        setValue(v);
        onCommit?.(v);
      }}
    >
      <Input.Label>Days</Input.Label>
      <Input.Box>
        <Input.Number min={7} max={20} decrementLabel="Less" incrementLabel="More" />
      </Input.Box>
    </Input.Root>
  );
}

describe("Input.Number", () => {
  it("is a labelled spinbutton with named step buttons", () => {
    render(<Harness />);
    expect(screen.getByRole("spinbutton", { name: "Days" })).toHaveValue(10);
    expect(screen.getByRole("button", { name: "Less" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "More" })).toBeEnabled();
  });

  it("commits typing only on blur or Enter, clamped", async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<Harness onCommit={commit} />);
    const field = screen.getByRole("spinbutton");
    await user.clear(field);
    await user.type(field, "12");
    expect(commit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(commit).toHaveBeenLastCalledWith("12");
    await user.clear(field);
    await user.type(field, "99");
    await user.tab();
    expect(commit).toHaveBeenLastCalledWith("20");
    expect(field).toHaveValue(20);
  });

  it("steps with buttons and arrows and disables at the bounds", async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<Harness initial="8" onCommit={commit} />);
    await user.click(screen.getByRole("button", { name: "Less" }));
    expect(commit).toHaveBeenLastCalledWith("7");
    expect(screen.getByRole("button", { name: "Less" })).toBeDisabled();
    screen.getByRole("spinbutton").focus();
    await user.keyboard("{ArrowUp}");
    expect(commit).toHaveBeenLastCalledWith("8");
  });

  it("returns to the value when the draft is empty", async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<Harness onCommit={commit} />);
    const field = screen.getByRole("spinbutton");
    await user.clear(field);
    await user.tab();
    expect(commit).not.toHaveBeenCalled();
    expect(field).toHaveValue(10);
  });
});
