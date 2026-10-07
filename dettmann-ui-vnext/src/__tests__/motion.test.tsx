import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ThemeProvider, ThemeScope } from "../theme";
import { MOTION_DEFAULTS, springToLinear } from "../theme/engine";
import { MotionScope, Presence, animate, readMotion, useFlip, useMotion, type MotionValues } from "../motion";
import * as root from "../index";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = HTMLElement.prototype as unknown as { animate?: AnimateFn };

function fakeAnimation(finished: Promise<unknown> = new Promise(() => {})): Animation {
  return { finished, cancel: vi.fn() } as unknown as Animation;
}

function setMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) =>
    ({ matches, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function reset() {
  delete document.documentElement.dataset.reduceMotion;
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete proto.animate;
  document.body.innerHTML = "";
}

beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  reset();
});

const Probe = () => <span data-testid="probe" />;

test("animate returns null when WAAPI is missing", () =>
  expect(animate(document.createElement("div"), [{ opacity: 0 }, { opacity: 1 }])).toBeNull());

test("animate strips transforms when app-level reduce motion is on", () => {
  document.documentElement.dataset.reduceMotion = "true";
  const el = document.createElement("div");
  document.body.append(el);
  const spy = vi.fn((..._args: unknown[]) => ({}) as Animation);
  (el as unknown as { animate: unknown }).animate = spy;
  animate(el, [{ transform: "scale(1)", opacity: 0 }, { transform: "scale(1.2)", opacity: 1 }]);
  expect(spy.mock.calls[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  expect(spy.mock.calls[0]![1]).toMatchObject({ duration: 120 });
});

test("animate honors prefers-reduced-motion", () => {
  setMatchMedia(true);
  const el = document.createElement("div");
  document.body.append(el);
  const spy = vi.fn((..._args: unknown[]) => ({}) as Animation);
  (el as unknown as { animate: unknown }).animate = spy;
  animate(el, [{ translate: "0 4px", rotate: "10deg", scale: "0.9", opacity: 0 }, { translate: "0 0", opacity: 1 }]);
  expect(spy.mock.calls[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  expect(spy.mock.calls[0]![1]).toMatchObject({ duration: 120 });
});

test("animate drops keyframes left empty and returns null when nothing remains", () => {
  document.documentElement.dataset.reduceMotion = "true";
  const el = document.createElement("div");
  const spy = vi.fn((..._args: unknown[]) => ({}) as Animation);
  (el as unknown as { animate: unknown }).animate = spy;
  animate(el, [{ transform: "scale(1)", opacity: 0 }, { transform: "scale(1.1)", offset: 0.5 }, { opacity: 1 }]);
  expect(spy.mock.calls[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  expect(animate(el, [{ transform: "scale(1)" }, { transform: "scale(2)" }])).toBeNull();
  expect(spy).toHaveBeenCalledTimes(1);
});

test("animate passes delay/iterations/direction/fill through and caps loops when reduced", () => {
  const el = document.createElement("div");
  document.body.append(el);
  const spy = vi.fn((..._args: unknown[]) => ({}) as Animation);
  (el as unknown as { animate: unknown }).animate = spy;
  const opts = { delay: 40, iterations: Infinity, direction: "alternate", fill: "both" } as const;
  animate(el, [{ opacity: 0 }, { opacity: 1 }], opts);
  expect(spy.mock.calls[0]![1]).toMatchObject(opts);
  document.documentElement.dataset.reduceMotion = "true";
  animate(el, [{ opacity: 0 }, { opacity: 1 }], opts);
  expect(spy.mock.calls[1]![1]).toMatchObject({ delay: 40, iterations: 1, direction: "alternate", fill: "both", duration: 120 });
});

test("animate uses spring duration by default and plain duration with spring: false", () => {
  const el = document.createElement("div");
  const spy = vi.fn((..._args: unknown[]) => ({}) as Animation);
  (el as unknown as { animate: unknown }).animate = spy;
  const calm = springToLinear(MOTION_DEFAULTS.calm);
  animate(el, [{ opacity: 0 }, { opacity: 1 }]);
  expect(spy.mock.calls[0]![1]).toMatchObject({ duration: calm.duration, easing: calm.easing });
  animate(el, [{ opacity: 0 }, { opacity: 1 }], { spring: false, durationFactor: 2 });
  expect(spy.mock.calls[1]![1]).toMatchObject({ duration: MOTION_DEFAULTS.calm.duration * 2, easing: calm.easing });
});

test("animate passes MotionValues to keyframe functions", () => {
  const el = document.createElement("div");
  const spy = vi.fn((..._args: unknown[]) => ({}) as Animation);
  (el as unknown as { animate: unknown }).animate = spy;
  let seen: MotionValues | undefined;
  animate(el, (m) => {
    seen = m;
    return [{ opacity: 0 }, { opacity: m.amp }];
  });
  expect(seen?.amp).toBe(MOTION_DEFAULTS.calm.amplitude);
  expect(spy.mock.calls[0]![0]).toEqual([{ opacity: 0 }, { opacity: MOTION_DEFAULTS.calm.amplitude }]);
});

test("readMotion falls back to calm defaults without computed values", () => {
  const calm = springToLinear(MOTION_DEFAULTS.calm);
  expect(readMotion(document.createElement("div"))).toEqual({
    ease: calm.easing,
    duration: 160,
    springDuration: calm.duration,
    amp: 0.45,
    press: 0.985,
    stagger: 20,
    reduced: false,
  });
});

test("readMotion parses ms, seconds and plain numbers from computed style", () => {
  const el = document.createElement("div");
  el.style.setProperty("--motion-duration", "0.3s");
  el.style.setProperty("--motion-spring-duration", "500ms");
  el.style.setProperty("--motion-amp", "1.6");
  el.style.setProperty("--motion-stagger", "50");
  document.body.append(el);
  const m = readMotion(el);
  expect(m).toMatchObject({ duration: 300, springDuration: 500, amp: 1.6, stagger: 50 });
});

test("MotionScope clamps to the theme ceiling", () => {
  render(
    <ThemeProvider theme={{ id: "c", label: "C", brand: "#123456", motion: "responsive" }}>
      <MotionScope level="expressive">
        <Probe />
      </MotionScope>
    </ThemeProvider>,
  );
  expect(screen.getByTestId("probe").closest("[data-motion]")!.getAttribute("data-motion")).toBe("responsive");
});

test("MotionScope without a theme allows expressive and uses display: contents", () => {
  render(
    <MotionScope level="expressive">
      <Probe />
    </MotionScope>,
  );
  const scope = screen.getByTestId("probe").closest("[data-motion]") as HTMLElement;
  expect(scope.dataset.motion).toBe("expressive");
  expect(scope.style.display).toBe("contents");
  expect(scope.style.getPropertyValue("--motion-ease")).toBe("");
});

test("MotionScope tune emits CSS vars", () => {
  render(
    <MotionScope level="responsive" tune={{ amplitude: 1.2, duration: 300, stagger: 10, pressScale: 0.95 }}>
      <Probe />
    </MotionScope>,
  );
  const scope = screen.getByTestId("probe").closest("[data-motion]") as HTMLElement;
  const style = scope.getAttribute("style")!;
  expect(style).toContain("--motion-ease: linear(");
  expect(scope.style.getPropertyValue("--motion-amp")).toBe("1.2");
  expect(scope.style.getPropertyValue("--motion-duration")).toBe("300ms");
  expect(scope.style.getPropertyValue("--motion-stagger")).toBe("10ms");
  expect(scope.style.getPropertyValue("--motion-press")).toBe("0.95");
  expect(scope.style.getPropertyValue("--motion-spring-duration")).toBe(`${springToLinear(MOTION_DEFAULTS.responsive).duration}ms`);
  expect(readMotion(screen.getByTestId("probe").parentElement!)).toMatchObject({ amp: 1.2, duration: 300 });
});

test("MotionScope tune is validated (dev throws, prod clamps)", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() =>
    render(
      <MotionScope tune={{ pressScale: 2 }}>
        <Probe />
      </MotionScope>,
    ),
  ).toThrow(/pressScale/);
  vi.stubEnv("NODE_ENV", "production");
  render(
    <MotionScope tune={{ pressScale: 2 }}>
      <Probe />
    </MotionScope>,
  );
  const scope = screen.getByTestId("probe").closest("[data-motion]") as HTMLElement;
  expect(scope.style.getPropertyValue("--motion-press")).toBe("1");
});

test("useMotion reads the effective level and tuned spec", () => {
  let seen: ReturnType<typeof useMotion> | undefined;
  const Read = () => {
    seen = useMotion();
    return null;
  };
  render(<Read />);
  expect(seen).toEqual({ level: "calm", spec: MOTION_DEFAULTS.calm });
  render(
    <ThemeProvider theme={{ id: "c2", label: "C2", brand: "#123456", motion: "responsive" }}>
      <MotionScope level="expressive" tune={{ amplitude: 1.3 }}>
        <Read />
      </MotionScope>
    </ThemeProvider>,
  );
  expect(seen).toEqual({ level: "responsive", spec: { ...MOTION_DEFAULTS.responsive, amplitude: 1.3 } });
});

test("nested MotionScope inherits the parent level", () => {
  render(
    <MotionScope level="responsive">
      <MotionScope>
        <Probe />
      </MotionScope>
    </MotionScope>,
  );
  expect(screen.getByTestId("probe").closest("[data-motion]")!.getAttribute("data-motion")).toBe("responsive");
});

test("MotionScope reads the ceiling from the nearest ThemeScope", () => {
  render(
    <ThemeScope theme={{ id: "still2", label: "Still", brand: "#336699", motion: "calm" }}>
      <MotionScope level="expressive">
        <Probe />
      </MotionScope>
    </ThemeScope>,
  );
  expect(screen.getByTestId("probe").closest("[data-motion]")!.getAttribute("data-motion")).toBe("calm");
});

test("Presence keeps child mounted until exit finishes", async () => {
  let resolve!: () => void;
  const spy = vi.fn((..._args: unknown[]) => fakeAnimation(new Promise<void>((r) => (resolve = r))));
  proto.animate = spy as unknown as AnimateFn;
  const { rerender } = render(
    <Presence show>
      <div data-testid="box">hi</div>
    </Presence>,
  );
  expect(spy).toHaveBeenCalledTimes(1);
  const enter = spy.mock.calls[0]![0] as Keyframe[];
  expect(enter[0]).toMatchObject({ opacity: 0 });
  expect(enter[enter.length - 1]).toMatchObject({ opacity: 1 });

  rerender(
    <Presence show={false}>
      <div data-testid="box">hi</div>
    </Presence>,
  );
  expect(screen.getByTestId("box")).toBeInTheDocument();
  expect(spy).toHaveBeenCalledTimes(2);
  const exit = spy.mock.calls[1]![0] as Keyframe[];
  expect(exit).toEqual([...enter].reverse());

  await act(async () => resolve());
  expect(screen.queryByTestId("box")).toBeNull();
});

test("Presence cancels the exit when shown again", async () => {
  const cancel = vi.fn();
  let resolve!: () => void;
  proto.animate = vi.fn(
    () => ({ finished: new Promise<void>((r) => (resolve = r)), cancel }) as unknown as Animation,
  ) as unknown as AnimateFn;
  const ui = (show: boolean) => (
    <Presence show={show}>
      <div data-testid="box">hi</div>
    </Presence>
  );
  const { rerender } = render(ui(true));
  rerender(ui(false));
  const finishExit = resolve;
  rerender(ui(true));
  expect(cancel).toHaveBeenCalled();
  await act(async () => finishExit());
  expect(screen.getByTestId("box")).toBeInTheDocument();
});

test("Presence without WAAPI unmounts immediately", () => {
  const { rerender } = render(
    <Presence show>
      <div data-testid="box">hi</div>
    </Presence>,
  );
  expect(screen.getByTestId("box")).toBeInTheDocument();
  rerender(
    <Presence show={false}>
      <div data-testid="box">hi</div>
    </Presence>,
  );
  expect(screen.queryByTestId("box")).toBeNull();
});

test("Presence keeps the child's own ref working", () => {
  let node: HTMLDivElement | null = null;
  render(
    <Presence show>
      <div data-testid="box" ref={(el) => void (node = el)} />
    </Presence>,
  );
  expect(node).toBe(screen.getByTestId("box"));
});

test("useFlip animates moved items only", () => {
  const moved: { key: string | null; frames: Keyframe[] }[] = [];
  proto.animate = vi.fn(function (this: HTMLElement, frames: Keyframe[]) {
    moved.push({ key: this.getAttribute("data-k"), frames });
    return fakeAnimation();
  }) as unknown as AnimateFn;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const i = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
    return { top: i * 10, left: 0, width: 10, height: 10, right: 10, bottom: i * 10 + 10, x: 0, y: i * 10, toJSON() {} } as DOMRect;
  });

  let setOrder!: (o: string[]) => void;
  function List() {
    const [order, set] = useState(["a", "b", "c"]);
    setOrder = set;
    const flip = useFlip<HTMLDivElement>([order]);
    return (
      <div>
        {order.map((k) => (
          <div key={k} data-k={k} ref={flip(k)} />
        ))}
      </div>
    );
  }
  render(<List />);
  expect(moved).toHaveLength(0);
  act(() => setOrder(["b", "a", "c"]));
  expect(moved.map((m) => m.key).sort()).toEqual(["a", "b"]);
  const a = moved.find((m) => m.key === "a")!;
  expect(a.frames[0]).toEqual({ translate: "0px -10px" });
  expect(a.frames[a.frames.length - 1]).toEqual({ translate: "0px 0px" });
});

test("motion primitives are exported from the package root", () => {
  for (const name of ["animate", "readMotion", "MotionScope", "useMotion", "Presence", "useFlip"]) {
    expect(root).toHaveProperty(name);
  }
});
