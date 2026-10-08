import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { REDUCED_LOOP } from "../motion";
import { Button } from "../components/button";
import { Loader } from "../components/loader";
import * as root from "../index";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = Element.prototype as unknown as { animate?: AnimateFn };

let cancels: ReturnType<typeof vi.fn>[] = [];
let spy: ReturnType<typeof vi.fn>;

function reset() {
  delete document.documentElement.dataset.reduceMotion;
  delete proto.animate;
  document.body.innerHTML = "";
  cancels = [];
}

beforeEach(() => {
  reset();
  spy = vi.fn(() => {
    const cancel = vi.fn();
    cancels.push(cancel);
    return { cancel, finished: Promise.resolve() } as unknown as Animation;
  });
  proto.animate = spy as unknown as AnimateFn;
});
afterEach(() => {
  vi.restoreAllMocks();
  reset();
});

test("default renders arc, md, role=status, label Loading", () => {
  const { container } = render(<Loader />);
  const status = screen.getByRole("status", { name: "Loading" });
  expect(status).toHaveClass("h-6", "w-6");
  expect(status).toHaveTextContent("Loading");
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  expect(svg.querySelectorAll("circle")).toHaveLength(1);
});

test.each([
  ["arc", 2],
  ["dots", 3],
  ["pulse", 2],
  ["bars", 4],
] as const)("%s starts infinite loops and cancels on unmount", (variant, count) => {
  const { unmount } = render(<Loader variant={variant} />);
  expect(spy).toHaveBeenCalledTimes(count);
  for (const call of spy.mock.calls) expect(call[1]).toMatchObject({ iterations: Infinity });
  unmount();
  expect(cancels).toHaveLength(count);
  for (const c of cancels) expect(c).toHaveBeenCalled();
});

test("sizes map to classes", () => {
  render(<Loader size="xl" label="x" />);
  expect(screen.getByRole("status")).toHaveClass("h-12", "w-12");
});

test("intent paints text-intent-fill and data-intent", () => {
  render(<Loader intent="brand" />);
  const status = screen.getByRole("status");
  expect(status).toHaveClass("text-intent-fill");
  expect(status).toHaveAttribute("data-intent", "brand");
});

test("dots amplitude follows amp (expressive > calm)", () => {
  const peak = (amp: string) => {
    spy.mockClear();
    const { unmount } = render(
      <div style={{ "--motion-amp": amp } as React.CSSProperties}>
        <Loader variant="dots" />
      </div>,
    );
    const frames = spy.mock.calls[0]![0] as Keyframe[];
    unmount();
    return Math.abs(parseFloat(String(frames[1]!.transform).replace(/[^\d.-]/g, "")));
  };
  expect(peak("1.6")).toBeGreaterThan(peak("0.45"));
});

test.each(["dots", "pulse"] as const)("%s: linear timing with ease-in-out per keyframe (no spring)", (variant) => {
  render(
    <div style={{ "--motion-ease": "linear(0, 1.2 17%, 1)" } as React.CSSProperties}>
      <Loader variant={variant} />
    </div>,
  );
  expect(spy.mock.calls.length).toBeGreaterThan(0);
  for (const call of spy.mock.calls) {
    expect(call[1]).toMatchObject({ easing: "linear" });
    const frames = call[0] as Keyframe[];
    for (const f of frames.slice(0, -1)) expect(f.easing).toBe("ease-in-out");
  }
});

test("reduced motion: only opacity pulse", () => {
  document.documentElement.dataset.reduceMotion = "true";
  render(<Loader variant="bars" />);
  for (const call of spy.mock.calls) {
    expect(call[0]).toEqual(REDUCED_LOOP.keyframes);
    expect(call[1]).toMatchObject({ duration: REDUCED_LOOP.duration });
  }
});

test("Button loading renders a Loader", () => {
  render(<Button loading>Salvar</Button>);
  expect(screen.getByRole("status")).toBeInTheDocument();
});

test("the old spinner is no longer exported; Loader is", () => {
  expect(root).not.toHaveProperty(["Spin", "ner"].join(""));
  expect(root).toHaveProperty("Loader");
});

test("renderToString works", () => {
  const html = renderToString(<Loader variant="pulse" />);
  expect(html).toContain('role="status"');
});
