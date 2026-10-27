import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Accordion } from "../components/accordion";
import { ToastProvider, useToast } from "../components/toast";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = HTMLElement.prototype as unknown as { animate?: AnimateFn };

afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
  delete document.documentElement.dataset.reduceMotion;
});

/** Classes de plugins de animação que não existem no Tailwind v4 desta lib (no-op) e tempos fixos. */
const LEGACY = /\b(?:animate-in|animate-out|slide-in-from-[\w-]+|fade-in(?:-\d+)?|duration-\d+)\b/;

test("accordion chevron rotates with the motion context timing", () => {
  render(
    <Accordion.Root>
      <Accordion.Item value="a">
        <Accordion.Trigger value="a">A</Accordion.Trigger>
        <Accordion.Content value="a">Body</Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>,
  );
  const chevron = screen.getByRole("button", { name: "A" }).querySelector("svg")!;
  const cls = chevron.getAttribute("class")!;
  expect(cls).not.toMatch(LEGACY);
  expect(cls).toContain("duration-(--motion-duration)");
  expect(cls).toContain("ease-(--motion-ease)");
});

function Notify() {
  const { addToast } = useToast();
  return (
    <button type="button" onClick={() => addToast({ description: "Saved", duration: 0 })}>
      Notify
    </button>
  );
}

async function showToast() {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Notify />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Notify" }));
  return screen.getByRole("alert");
}

test("toast has no legacy animation plugin classes", async () => {
  const alert = await showToast();
  expect(alert.getAttribute("class")).not.toMatch(LEGACY);
});

test("toast entry is animated through the motion layer (slide + fade)", async () => {
  const spy = vi.fn<AnimateFn>(() => ({ finished: new Promise(() => {}), cancel: vi.fn() }) as unknown as Animation);
  proto.animate = spy;
  const alert = await showToast();
  const call = spy.mock.contexts.findIndex((ctx) => ctx === alert);
  expect(call).toBeGreaterThanOrEqual(0);
  const frames = spy.mock.calls[call]![0];
  expect(frames[0]).toMatchObject({ opacity: 0 });
  expect(String(frames[0]!.transform)).toMatch(/translateX/);
});

test("toast entry drops the slide under app-level reduced motion", async () => {
  document.documentElement.dataset.reduceMotion = "true";
  const spy = vi.fn<AnimateFn>(() => ({ finished: new Promise(() => {}), cancel: vi.fn() }) as unknown as Animation);
  proto.animate = spy;
  const alert = await showToast();
  const call = spy.mock.contexts.findIndex((ctx) => ctx === alert);
  expect(call).toBeGreaterThanOrEqual(0);
  for (const frame of spy.mock.calls[call]![0]) expect(frame).not.toHaveProperty("transform");
});
