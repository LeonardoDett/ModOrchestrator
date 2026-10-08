import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Accordion } from "../components/accordion";
import { Checkbox } from "../components/checkbox";
import { Modal } from "../components/modal";
import { Drawer } from "../components/drawer";
import { ToastProvider, useToast } from "../components/toast";
import { Input } from "../components/input";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = Element.prototype as unknown as { animate?: AnimateFn };
let spy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  spy = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation);
  proto.animate = spy as unknown as AnimateFn;
});
afterEach(() => {
  delete proto.animate;
});

function Notify() {
  const { addToast } = useToast();
  return (
    <button type="button" onClick={() => addToast({ description: "Saved", duration: 0 })}>
      Notify
    </button>
  );
}

const fixtures: Array<[string, () => React.ReactElement, string]> = [
  [
    "Accordion trigger",
    () => (
      <Accordion.Root>
        <Accordion.Item value="a">
          <Accordion.Trigger value="a">A</Accordion.Trigger>
          <Accordion.Content value="a">Body</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    ),
    "chevron-down",
  ],
  [
    "Modal close",
    () => (
      <Modal.Root open onOpenChange={() => {}}>
        <Modal.Content>
          <Modal.CloseButton />
        </Modal.Content>
      </Modal.Root>
    ),
    "x",
  ],
  [
    "Drawer close",
    () => (
      <Drawer.Root open onOpenChange={() => {}}>
        <Drawer.Content>
          <Drawer.CloseButton />
        </Drawer.Content>
      </Drawer.Root>
    ),
    "x",
  ],
  ["Checkbox", () => <Checkbox defaultChecked aria-label="c" />, "check"],
  ["Checkbox indeterminate", () => <Checkbox indeterminate aria-label="c" />, "minus"],
];

test.each(fixtures)("%s renders the catalog icon", (_, ui, name) => {
  render(ui());
  expect(document.querySelector(`[data-animated-icon="${name}"]`)).not.toBeNull();
});

test("Toast close renders the catalog icon", () => {
  render(
    <ToastProvider>
      <Notify />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("Notify"));
  expect(document.querySelector('[data-animated-icon="x"]')).not.toBeNull();
});

test("Combobox arrow renders the catalog icon", () => {
  const { container } = render(
    <Input.Root>
      <Input.Combobox options={[{ value: "a", label: "A" }]} aria-label="c" />
    </Input.Root>,
  );
  expect(container.querySelector('[data-animated-icon="chevron-down"]')).not.toBeNull();
});

test("Checkbox draws the check when it becomes checked, not on mount", () => {
  function Controlled() {
    const [c, setC] = useState(false);
    return <Checkbox checked={c} onCheckedChange={setC} aria-label="c" />;
  }
  render(<Controlled />);
  expect(spy).toHaveBeenCalledTimes(0);
  act(() => {
    fireEvent.click(screen.getByRole("checkbox"));
  });
  expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
});
