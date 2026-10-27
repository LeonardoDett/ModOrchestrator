import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "../components/progress";
import { Stepper } from "../components/stepper";
import { Skeleton } from "../primitives/skeleton";
import { Backdrop } from "../primitives/backdrop";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = HTMLElement.prototype as unknown as { animate?: AnimateFn };

afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
  delete document.documentElement.dataset.reduceMotion;
});

function stubAnimate() {
  const cancel = vi.fn();
  const animate = vi.fn<AnimateFn>(() => ({ cancel }) as unknown as Animation);
  proto.animate = animate;
  return { animate, cancel };
}

describe("Progress (D-033)", () => {
  it("is a pill whose fill animates its width through the motion tokens", () => {
    render(<Progress.Root value={40} aria-label="Deploy" />);
    const bar = screen.getByRole("progressbar", { name: "Deploy" });
    expect(bar).toHaveClass("rounded-pill");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill).toHaveClass("rounded-pill", "bg-intent-fill", "transition-[width]", "duration-(--motion-duration)");
    expect(fill.style.width).toBe("40%");
    expect(bar).toHaveAttribute("data-intent", "brand");
  });
});

describe("Stepper (D-033)", () => {
  it("indicators are pills and interactive steps use the shared focus ring without opacity", () => {
    const { container } = render(
      <Stepper.Root value={0} interactive onValueChange={() => {}}>
        <Stepper.Step index={0}>
          <Stepper.StepIndicator />
          <Stepper.StepLabel>One</Stepper.StepLabel>
        </Stepper.Step>
        <Stepper.Step index={1} disabled>
          <Stepper.StepIndicator />
          <Stepper.StepLabel>Two</Stepper.StepLabel>
        </Stepper.Step>
      </Stepper.Root>,
    );
    const html = container.innerHTML;
    expect(html).toContain("rounded-pill");
    expect(html).not.toMatch(/rounded-full|opacity-60|focus-visible:ring-/);
    expect(html).toContain("focus-ring");
  });
});

describe("Skeleton (D-033)", () => {
  it("pulses through the motion layer, not a CSS keyframe class", () => {
    const { animate, cancel } = stubAnimate();
    const { container, unmount } = render(<Skeleton className="h-4 w-48" />);
    const el = container.firstElementChild!;
    expect(el.className).not.toMatch(/animate-/);
    expect(el).toHaveClass("rounded-control", "bg-sunken");
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, timing] = animate.mock.calls[0]!;
    expect(frames.map((f) => f.opacity)).toEqual([1, 0.5, 1]);
    expect(timing).toMatchObject({ iterations: Infinity, duration: 1600 });
    unmount();
    expect(cancel).toHaveBeenCalled();
  });

  it("stays perceptible under reduced motion without transforms", () => {
    document.documentElement.dataset.reduceMotion = "true";
    const { animate } = stubAnimate();
    render(<Skeleton />);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames] = animate.mock.calls[0]!;
    expect(frames.some((f) => "transform" in f)).toBe(false);
    expect(frames.some((f) => f.opacity !== undefined && Number(f.opacity) < 1)).toBe(true);
  });

  it("renders without WAAPI", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Backdrop (D-033)", () => {
  it("carries no dead animation classes; exited hides it", () => {
    const { container, rerender } = render(<Backdrop state="entering" />);
    expect(container.firstElementChild!.className).not.toMatch(/animate-|fade-/);
    rerender(<Backdrop state="exited" />);
    expect(container.firstElementChild).toHaveClass("hidden");
  });
});
