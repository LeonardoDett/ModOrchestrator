import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { StrictMode, createRef } from "react";
import { renderToString } from "react-dom/server";
import { REDUCED_LOOP } from "../motion";
import { Icon } from "../primitives/icon";
import { defineIcon, draw, nudge, spin, squash } from "../icons";
import { getIconHandle } from "../icons/registry";
import * as root from "../index";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = Element.prototype as unknown as { animate?: AnimateFn };

interface Fake {
  finished: Promise<unknown>;
  cancel: ReturnType<typeof vi.fn>;
  resolve: () => void;
}

let fakes: Fake[] = [];
let spy: ReturnType<typeof vi.fn>;

function fakeAnimation(): Animation {
  let resolve!: () => void;
  const finished = new Promise<void>((r) => {
    resolve = r;
  });
  const fake: Fake = { finished, cancel: vi.fn(), resolve };
  fakes.push(fake);
  return fake as unknown as Animation;
}

function reset() {
  delete document.documentElement.dataset.reduceMotion;
  delete proto.animate;
  document.body.innerHTML = "";
  fakes = [];
}

beforeEach(() => {
  reset();
  spy = vi.fn(function (this: Element) {
    return fakeAnimation();
  });
  proto.animate = spy as unknown as AnimateFn;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  reset();
});

const Demo = defineIcon({
  name: "demo",
  parts: { a: <path d="M4 12h16" />, b: <circle cx="12" cy="12" r="4" /> },
  origin: { a: "100% 100%" },
  action: { a: nudge({ x: 2 }), b: draw() },
  loop: { root: spin() },
});

const part = (svg: Element, name: string) => svg.querySelector(`[data-part="${name}"]`)!;
const targets = () => spy.mock.contexts.map((el) => (el as Element).getAttribute("data-part"));

test("renders svg contract", () => {
  const { container } = render(<Demo />);
  const svg = container.querySelector("svg")!;
  expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  expect(svg.getAttribute("fill")).toBe("none");
  expect(svg.getAttribute("stroke")).toBe("currentColor");
  expect(svg.getAttribute("stroke-linecap")).toBe("round");
  expect(svg.getAttribute("stroke-linejoin")).toBe("round");
  expect(svg.getAttribute("overflow")).toBe("visible");
  expect(svg.getAttribute("data-animated-icon")).toBe("demo");
  expect(svg.getAttribute("data-trigger")).toBe("auto");
  const rootG = svg.querySelector(":scope > g[data-part=root]")!;
  expect(rootG).not.toBeNull();
  expect([...rootG.children].map((c) => c.getAttribute("data-part"))).toEqual(["a", "b"]);
  expect((part(svg, "a") as SVGGElement).style.transformOrigin).toBe("100% 100%");
  expect((part(svg, "b") as SVGGElement).style.transformOrigin).toBe("50% 50%");
  expect(Demo.definition.name).toBe("demo");
  expect(Demo.displayName).toBe("DemoIcon");
});

test("trigger none is rendered and ref reaches the svg", () => {
  const ref = createRef<SVGSVGElement>();
  render(<Demo trigger="none" ref={ref} data-testid="x" />);
  expect(ref.current?.tagName.toLowerCase()).toBe("svg");
  expect(ref.current?.getAttribute("data-trigger")).toBe("none");
  expect(ref.current?.getAttribute("data-testid")).toBe("x");
});

test("parts used by draw get pathLength=1", () => {
  const { container } = render(<Demo />);
  expect(container.querySelector("circle")!.getAttribute("pathLength")).toBe("1");
  expect(container.querySelector("path")!.getAttribute("pathLength")).toBeNull();
});

test("pathLength reaches drawable children nested in fragments and groups", () => {
  const Nested = defineIcon({
    name: "nested-draw",
    parts: {
      a: (
        <>
          <path d="M1 1h2" />
          <g>
            <line x1="1" y1="1" x2="2" y2="2" />
            <polygon points="1,1 2,1 2,2" />
          </g>
        </>
      ),
    },
    loop: { a: draw() },
  });
  const { container } = render(<Nested />);
  expect(container.querySelector("path")!.getAttribute("pathLength")).toBe("1");
  expect(container.querySelector("line")!.getAttribute("pathLength")).toBe("1");
  expect(container.querySelector("polygon")!.getAttribute("pathLength")).toBe("1");
});

test("size/intent/label mirror Icon", () => {
  const { container, rerender } = render(<Demo size="lg" intent="danger" className="extra" />);
  let svg = container.querySelector("svg")!;
  expect(svg).toHaveClass("shrink-0", "h-6", "w-6", "text-intent-fill", "extra");
  expect(svg.getAttribute("stroke-width")).toBe("2");
  expect(svg.getAttribute("data-intent")).toBe("danger");
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.getAttribute("role")).toBeNull();
  rerender(<Demo size="xl" label="Demo" strokeWidth={3} />);
  svg = container.querySelector("svg")!;
  expect(svg).toHaveClass("h-8", "w-8");
  expect(svg.getAttribute("stroke-width")).toBe("3");
  expect(svg.getAttribute("role")).toBe("img");
  expect(svg.getAttribute("aria-label")).toBe("Demo");
  expect(svg.getAttribute("aria-hidden")).toBeNull();
  rerender(<Demo size="xl" />);
  expect(container.querySelector("svg")!.getAttribute("stroke-width")).toBe("1.75");
});

test("playKey change plays action once and not on mount", () => {
  const { rerender } = render(<Demo playKey={1} />);
  expect(spy).not.toHaveBeenCalled();
  rerender(<Demo playKey={1} />);
  expect(spy).not.toHaveBeenCalled();
  rerender(<Demo playKey={2} />);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(targets()).toEqual(["a", "b"]);
  // draw: strokeDashoffset; nudge: translate. Delay vem da técnica (0 aqui).
  expect(spy.mock.calls[0]![1]).toMatchObject({ delay: 0 });
  expect(spy.mock.calls[1]![0]).toEqual([
    { strokeDasharray: "1", strokeDashoffset: 1, easing: "ease-out" },
    { strokeDasharray: "1", strokeDashoffset: 0 },
  ]);
  // keyframeEasing chega ao animate(): timing linear, curva nos keyframes.
  expect(spy.mock.calls[0]![1]).toMatchObject({ easing: "linear" });
  expect(spy.mock.calls[1]![1]).toMatchObject({ easing: "linear" });
});

test("StrictMode: no play on mount and a single live loop", () => {
  const { rerender } = render(
    <StrictMode>
      <Demo playKey={1} />
    </StrictMode>,
  );
  expect(spy).not.toHaveBeenCalled();
  rerender(
    <StrictMode>
      <Demo playKey={1} loop />
    </StrictMode>,
  );
  expect(fakes.filter((f) => f.cancel.mock.calls.length === 0)).toHaveLength(1);
});

test("playKey change cancels running animations", () => {
  const { rerender } = render(<Demo playKey={1} />);
  rerender(<Demo playKey={2} />);
  const first = [...fakes];
  rerender(<Demo playKey={3} />);
  for (const f of first) expect(f.cancel).toHaveBeenCalled();
  expect(spy).toHaveBeenCalledTimes(4);
});

test("stagger adds index * m.stagger to the delay", () => {
  const Staggered = defineIcon({
    name: "staggered",
    parts: { a: <path d="M1 1h2" />, b: <path d="M1 3h2" /> },
    action: { a: { ...squash({ delay: 10 }), index: 0 }, b: { ...squash({ delay: 10 }), index: 1 } },
  });
  const { container, rerender } = render(<Staggered playKey={0} />);
  container.querySelector("svg")!.setAttribute("style", "--motion-stagger: 30ms");
  rerender(<Staggered playKey={1} />);
  expect(spy.mock.calls.map((c) => (c[1] as KeyframeAnimationOptions).delay)).toEqual([10, 40]);
});

test("handle.play plays action and is ignored while playing", async () => {
  const { container } = render(<Demo trigger="none" />);
  const handle = getIconHandle(container.querySelector("svg")!)!;
  expect(handle.isPlaying()).toBe(false);
  handle.play();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(handle.isPlaying()).toBe(true);
  handle.play();
  expect(spy).toHaveBeenCalledTimes(2);
  await act(async () => {
    for (const f of fakes) f.resolve();
    await Promise.resolve();
  });
  expect(handle.isPlaying()).toBe(false);
  handle.play();
  expect(spy).toHaveBeenCalledTimes(4);
});

test("isPlaying honors playState when present", () => {
  proto.animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel: vi.fn(), playState: "finished" })) as unknown as AnimateFn;
  const { container } = render(<Demo />);
  const handle = getIconHandle(container.querySelector("svg")!)!;
  handle.play();
  expect(handle.isPlaying()).toBe(false);
});

test("handle is unregistered on unmount", () => {
  const { container, unmount } = render(<Demo />);
  const svg = container.querySelector("svg")!;
  expect(getIconHandle(svg)).toBeDefined();
  unmount();
  expect(getIconHandle(svg)).toBeUndefined();
});

test("loop starts on true, cancels on false and on unmount", () => {
  const { rerender, unmount } = render(<Demo />);
  expect(spy).not.toHaveBeenCalled();
  rerender(<Demo loop />);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(targets()).toEqual(["root"]);
  expect(spy.mock.calls[0]![1]).toMatchObject({ iterations: Infinity, duration: 1000, easing: "linear" });
  rerender(<Demo loop={false} />);
  expect(fakes[0]!.cancel).toHaveBeenCalled();
  rerender(<Demo loop />);
  expect(spy).toHaveBeenCalledTimes(2);
  unmount();
  expect(fakes[1]!.cancel).toHaveBeenCalled();
});

test("action triggers are ignored while loop is on", () => {
  const { container, rerender } = render(<Demo loop playKey={1} />);
  getIconHandle(container.querySelector("svg")!)!.play();
  rerender(<Demo loop playKey={2} />);
  expect(targets()).toEqual(["root"]);
});

test("loop under reduced motion animates only root opacity once", () => {
  document.documentElement.dataset.reduceMotion = "true";
  const Multi = defineIcon({
    name: "multi-loop",
    parts: { a: <path d="M1 1h2" />, b: <path d="M1 3h2" /> },
    loop: { a: nudge({ x: 2 }), b: draw() },
  });
  render(<Multi loop />);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(targets()).toEqual(["root"]);
  expect(spy.mock.calls[0]![0]).toEqual(REDUCED_LOOP.keyframes);
  expect(spy.mock.calls[0]![1]).toMatchObject({ duration: REDUCED_LOOP.duration, iterations: Infinity });
});

test("action under reduced motion uses technique's reduced keyframes", () => {
  document.documentElement.dataset.reduceMotion = "true";
  const { rerender } = render(<Demo playKey={0} />);
  rerender(<Demo playKey={1} />);
  // nudge (só translate) some; draw usa `reduced` (opacidade).
  expect(targets()).toEqual(["b"]);
  expect(spy.mock.calls[0]![0]).toEqual([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }]);
});

test("rapid loop/playKey toggling leaves no running animation", () => {
  const { rerender, unmount } = render(<Demo playKey={0} />);
  rerender(<Demo playKey={1} />);
  rerender(<Demo playKey={1} loop />);
  rerender(<Demo playKey={1} loop={false} />);
  rerender(<Demo playKey={2} loop={false} />);
  rerender(<Demo playKey={2} loop />);
  unmount();
  expect(fakes.length).toBeGreaterThan(0);
  for (const f of fakes) expect(f.cancel).toHaveBeenCalled();
});

test("loop on icon without loop warns in dev, once per name", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const Static = defineIcon({ name: "static-only", parts: { a: <path d="M1 1h2" /> }, action: { a: squash() } });
  render(<Static loop />);
  render(<Static loop />);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(String(warn.mock.calls[0]![0])).toContain("static-only");
  expect(spy).not.toHaveBeenCalled();
});

describe("defineIcon validation", () => {
  const parts = { a: <path d="M1 1h2" /> };
  test("throws in dev for unknown part in action", () =>
    expect(() => defineIcon({ name: "bad-part", parts, action: { zz: squash() } })).toThrow(/zz/));
  test("throws in dev for unknown part in loop and origin", () => {
    expect(() => defineIcon({ name: "bad-loop", parts, loop: { zz: spin() } })).toThrow(/zz/);
    expect(() => defineIcon({ name: "bad-origin", parts, origin: { zz: "0 0" } })).toThrow(/zz/);
  });
  test("throws in dev for non kebab-case name", () =>
    expect(() => defineIcon({ name: "BadName", parts })).toThrow(/kebab/));
  test("throws in dev for technique used in the wrong mode", () => {
    expect(() => defineIcon({ name: "bad-mode", parts, loop: { a: squash() } })).toThrow(/squash/);
    expect(() => defineIcon({ name: "bad-mode-2", parts, action: { a: spin() } })).toThrow(/spin/);
  });
  test("throws in dev for a part named root", () =>
    expect(() => defineIcon({ name: "bad-root", parts: { root: <path d="M1 1h2" /> } })).toThrow(/root/));
  test("in production an invalid definition renders a static icon", () => {
    vi.stubEnv("NODE_ENV", "production");
    const Broken = defineIcon({ name: "broken", parts, action: { zz: squash() }, loop: { a: spin() } });
    expect(Broken.definition.action).toBeUndefined();
    expect(Broken.definition.loop).toBeUndefined();
    const { container, rerender } = render(<Broken playKey={0} />);
    rerender(<Broken playKey={1} loop />);
    expect(spy).not.toHaveBeenCalled();
    expect(container.querySelector("[data-part=a]")).not.toBeNull();
  });
});

test("renderToString renders static svg without touching document listeners", () => {
  const add = vi.spyOn(document, "addEventListener");
  const html = renderToString(<Demo label="Demo" />);
  expect(html).toContain('data-animated-icon="demo"');
  expect(html).toContain('data-part="root"');
  expect(html).toContain("transform-origin:100% 100%");
  expect(add).not.toHaveBeenCalled();
  expect(spy).not.toHaveBeenCalled();
});

test("Icon accepts an AnimatedIconComponent", () => {
  const { container } = render(<Icon icon={Demo} size="sm" intent="brand" />);
  const svg = container.querySelector("svg")!;
  expect(svg.getAttribute("data-animated-icon")).toBe("demo");
  expect(svg).toHaveClass("h-4", "w-4", "text-intent-fill");
  expect(svg).not.toHaveClass("h-5");
  expect(svg.getAttribute("stroke-width")).toBe("2");
  expect(svg.getAttribute("aria-hidden")).toBe("true");
});

test("root exports defineIcon but not techniques", () => {
  expect(root).toHaveProperty("defineIcon");
  expect(root).not.toHaveProperty("squash");
  expect(root).not.toHaveProperty("draw");
});

test("loop reacts to reduced motion turned on and off after it started", async () => {
  render(<Demo loop />);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0]![0]).not.toEqual(REDUCED_LOOP.keyframes);
  await act(async () => {
    document.documentElement.dataset.reduceMotion = "true";
    await Promise.resolve();
  });
  expect(fakes[0]!.cancel).toHaveBeenCalled();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy.mock.calls[1]![0]).toEqual(REDUCED_LOOP.keyframes);
  expect(spy.mock.calls[1]![1]).toMatchObject({ duration: REDUCED_LOOP.duration, iterations: Infinity });
  await act(async () => {
    document.documentElement.dataset.reduceMotion = "false";
    await Promise.resolve();
  });
  expect(fakes[1]!.cancel).toHaveBeenCalled();
  expect(spy).toHaveBeenCalledTimes(3);
  expect(spy.mock.calls[2]![0]).not.toEqual(REDUCED_LOOP.keyframes);
});
