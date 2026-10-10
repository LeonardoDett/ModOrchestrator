import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Checkbox } from "../components/checkbox";
import { Radio } from "../components/radio";
import { Switch } from "../components/switch";
import { StatusToggle } from "../components/status-toggle";

const svg = Element.prototype as unknown as { animate?: unknown };

afterEach(() => {
  vi.restoreAllMocks();
  delete svg.animate;
});

const stateLabels = { on: "Enabled", off: "Disabled", unavailable: "Unavailable", busy: "Working" };

describe("Checkbox", () => {
  it("toggles uncontrolled with Space, starting from defaultChecked", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Agree" defaultChecked onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "Agree" });
    expect(box).toBeChecked();
    box.focus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(box).not.toBeChecked();
    await user.keyboard(" ");
    expect(box).toBeChecked();
  });

  it("controlled does not change until the parent updates", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Agree" checked={false} onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Agree" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("checkbox", { name: "Agree" })).not.toBeChecked();
  });

  it("disabled does not toggle and uses tokens, not opacity", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Agree" disabled onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "Agree" });
    await user.click(box);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(box.className).toContain("disabled:bg-sunken");
    expect(box.className).not.toMatch(/opacity-/);
  });

  it("is a chip-shaped box with the shared focus ring and brand intent", () => {
    render(<Checkbox label="Agree" defaultChecked />);
    const box = screen.getByRole("checkbox", { name: "Agree" });
    expect(box).toHaveClass("rounded-chip", "focus-ring");
    expect(box).toHaveAttribute("data-intent", "brand");
  });

  it("mark replays on check, not on uncheck", async () => {
    const animate = vi.fn(() => ({ cancel() {}, finished: Promise.resolve() }));
    svg.animate = animate;
    const user = userEvent.setup();
    render(<Checkbox label="Agree" />);
    const box = screen.getByRole("checkbox", { name: "Agree" });
    await user.click(box);
    const afterCheck = animate.mock.calls.length;
    expect(afterCheck).toBeGreaterThan(0);
    await user.click(box);
    expect(animate.mock.calls.length).toBe(afterCheck);
  });
});

describe("Switch", () => {
  it("toggles uncontrolled with Space", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Dark mode" onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "Dark mode" });
    sw.focus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    expect(sw).toBeChecked();
  });

  it("controlled does not change until the parent updates", async () => {
    const user = userEvent.setup();
    render(<Switch label="Dark mode" checked={false} onCheckedChange={() => {}} />);
    await user.click(screen.getByRole("switch", { name: "Dark mode" }));
    expect(screen.getByRole("switch", { name: "Dark mode" })).not.toBeChecked();
  });

  it("disabled does not toggle and uses tokens", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Dark mode" disabled onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "Dark mode" });
    await user.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(sw.className).toContain("disabled:bg-sunken");
    expect(sw.className).not.toMatch(/opacity-/);
  });

  it("is a pill whose thumb has a border, not a shadow", () => {
    render(<Switch label="Dark mode" defaultChecked />);
    const sw = screen.getByRole("switch", { name: "Dark mode" });
    expect(sw).toHaveClass("rounded-pill", "focus-ring");
    expect(sw).toHaveAttribute("data-intent", "brand");
    const thumb = sw.firstElementChild!;
    expect(thumb).toHaveClass("rounded-pill", "border");
    expect(thumb.className).not.toMatch(/shadow-/);
  });
});

describe("Radio", () => {
  const group = (props: Partial<Parameters<typeof Radio.Group>[0]> = {}) => (
    <Radio.Group name="size" aria-label="Size" {...props}>
      <Radio.Item value="s" label="Small" />
      <Radio.Item value="m" label="Medium" />
    </Radio.Group>
  );

  it("selects uncontrolled and reports the value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(group({ defaultValue: "s", onValueChange }));
    await user.click(screen.getByRole("radio", { name: "Medium" }));
    expect(onValueChange).toHaveBeenCalledWith("m");
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
  });

  it("controlled does not change until the parent updates", async () => {
    const user = userEvent.setup();
    render(group({ value: "s", onValueChange: () => {} }));
    await user.click(screen.getByRole("radio", { name: "Medium" }));
    expect(screen.getByRole("radio", { name: "Small" })).toBeChecked();
  });

  it("disabled group does not select and uses tokens", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(group({ disabled: true, onValueChange }));
    const radio = screen.getByRole("radio", { name: "Small" });
    await user.click(radio);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(radio.className).not.toMatch(/opacity-/);
  });

  it("is a pill with the shared focus ring and brand intent", () => {
    render(group({ defaultValue: "s" }));
    const radio = screen.getByRole("radio", { name: "Small" });
    expect(radio).toHaveClass("rounded-pill", "focus-ring");
    expect(radio.closest("[data-intent]")).toHaveAttribute("data-intent", "brand");
  });

  it("card variant is flat", () => {
    render(
      <Radio.Group name="plan" aria-label="Plan">
        <Radio.Item value="a" variant="card">
          Plan A
        </Radio.Item>
      </Radio.Group>,
    );
    expect(screen.getByRole("radio").className).not.toMatch(/shadow-/);
  });
});

describe("StatusToggle", () => {
  it("Space requests the opposite state", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<StatusToggle state="off" label="SkyUI" stateLabels={stateLabels} onCheckedChange={onCheckedChange} />);
    screen.getByRole("switch", { name: "SkyUI" }).focus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("unavailable and busy never toggle", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { rerender } = render(<StatusToggle state="unavailable" label="SkyUI" stateLabels={stateLabels} onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("switch", { name: "SkyUI" }));
    rerender(<StatusToggle state="busy" label="SkyUI" stateLabels={stateLabels} onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("switch", { name: "SkyUI" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("is a pill whose thumb has a border, not a shadow", () => {
    render(<StatusToggle state="on" label="SkyUI" stateLabels={stateLabels} />);
    const sw = screen.getByRole("switch", { name: "SkyUI" });
    expect(sw).toHaveClass("rounded-pill", "focus-ring");
    expect(sw).toHaveAttribute("data-intent", "brand");
    expect(sw.firstElementChild).toHaveClass("rounded-pill", "border");
    expect(sw.className + sw.firstElementChild!.className).not.toMatch(/shadow-|opacity-/);
  });
});
