import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Slider } from "../components/slider";

describe("Slider", () => {
  it("exposes role=slider with aria-valuenow/min/max", () => {
    render(
      <Slider.Root defaultValue={40} min={0} max={100}>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumb />
      </Slider.Root>
    );

    const thumb = screen.getByRole("slider");
    expect(thumb).toHaveAttribute("aria-valuenow", "40");
    expect(thumb).toHaveAttribute("aria-valuemin", "0");
    expect(thumb).toHaveAttribute("aria-valuemax", "100");
    expect(thumb).toHaveClass("bg-surface", "border-border-strong", "shadow-xs");
  });

  it("moves with arrow keys", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Slider.Root defaultValue={40} step={1} onValueChange={onValueChange}>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumb />
      </Slider.Root>
    );

    const thumb = screen.getByRole("slider");
    thumb.focus();
    await user.keyboard("{ArrowRight}");

    expect(onValueChange).toHaveBeenCalledWith(41);
    expect(thumb).toHaveAttribute("aria-valuenow", "41");
  });

  it("supports a two-thumb range", async () => {
    const user = userEvent.setup();

    render(
      <Slider.Root defaultValue={[20, 80]} min={0} max={100}>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumb index={0} />
        <Slider.Thumb index={1} />
      </Slider.Root>
    );

    const thumbs = screen.getAllByRole("slider");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute("aria-valuenow", "20");
    expect(thumbs[1]).toHaveAttribute("aria-valuenow", "80");

    thumbs[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(thumbs[0]).toHaveAttribute("aria-valuenow", "21");
  });

  it("jumps to min/max with Home and End", async () => {
    const user = userEvent.setup();

    render(
      <Slider.Root defaultValue={40} min={0} max={100}>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumb />
      </Slider.Root>
    );

    const thumb = screen.getByRole("slider");
    thumb.focus();
    await user.keyboard("{End}");
    expect(thumb).toHaveAttribute("aria-valuenow", "100");
    await user.keyboard("{Home}");
    expect(thumb).toHaveAttribute("aria-valuenow", "0");
  });
});
