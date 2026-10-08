import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../components";
import { Portal } from "../primitives/portal";
import { defineIcon, nudge } from "../icons";
import { INTERACTIVE_SELECTOR, findControl, retainController } from "../icons/controller";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = Element.prototype as unknown as { animate?: AnimateFn };

interface Fake {
  finished: Promise<unknown>;
  cancel: ReturnType<typeof vi.fn>;
  playState: AnimationPlayState;
  resolve: () => void;
}

let fakes: Fake[] = [];
let spy: ReturnType<typeof vi.fn>;

function fakeAnimation(): Animation {
  let resolve!: () => void;
  const finished = new Promise<void>((r) => {
    resolve = r;
  });
  const fake: Fake = { finished, cancel: vi.fn(), playState: "running", resolve };
  fake.resolve = () => {
    fake.playState = "finished";
    resolve();
  };
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
  reset();
});

const Demo = defineIcon({ name: "ctl-demo", parts: { a: <path d="M4 12h16" /> }, action: { a: nudge({ x: 2 }) } });

/** Ícones (svg) cujas partes foram animadas, na ordem das chamadas. */
const animatedIcons = () => spy.mock.contexts.map((el) => (el as Element).closest("svg"));
const finishAll = async () => {
  for (const f of fakes) f.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const hover = (el: Element, pointerType = "mouse", relatedTarget: Element | null = document.body) =>
  fireEvent.pointerOver(el, { pointerType, relatedTarget });

test("selector is the exact list from the spec", () => {
  expect(INTERACTIVE_SELECTOR).toBe(
    "button, a[href], summary, label, [role=button], [role=link], [role=menuitem], " +
      "[role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=option], " +
      "[role=switch], [role=checkbox], [role=radio], [role=treeitem], [data-icon-trigger]",
  );
  const { container } = render(
    <div data-icon-trigger>
      <span>
        <Demo />
      </span>
    </div>,
  );
  expect(findControl(container.querySelector("svg")!)).toBe(container.querySelector("[data-icon-trigger]"));
});

test("retainController is a no-op without a document", () => {
  const release = retainController(undefined);
  expect(() => release()).not.toThrow();
});

test("mouse hover on a button plays its icon", () => {
  render(
    <button>
      <Demo /> Go
    </button>,
  );
  hover(screen.getByRole("button"));
  expect(spy).toHaveBeenCalledTimes(1);
});

test("pen hover plays too", () => {
  render(
    <button>
      <Demo />
    </button>,
  );
  hover(screen.getByRole("button"), "pen");
  expect(spy).toHaveBeenCalledTimes(1);
});

test("moving between children of the same control does not replay", async () => {
  render(
    <button>
      <span data-testid="label">Go</span>
      <Demo />
    </button>,
  );
  const button = screen.getByRole("button");
  hover(button);
  expect(spy).toHaveBeenCalledTimes(1);
  await finishAll();
  hover(screen.getByTestId("label"), "mouse", button);
  hover(button.querySelector("svg")!, "mouse", screen.getByTestId("label"));
  expect(spy).toHaveBeenCalledTimes(1);
});

test("touch hover does not play, touch pointerdown does", () => {
  render(
    <button>
      <Demo />
    </button>,
  );
  const button = screen.getByRole("button");
  hover(button, "touch");
  expect(spy).not.toHaveBeenCalled();
  fireEvent.pointerDown(button, { pointerType: "touch", button: 0 });
  expect(spy).toHaveBeenCalledTimes(1);
});

test("secondary button pointerdown does not play", () => {
  render(
    <button>
      <Demo />
    </button>,
  );
  fireEvent.pointerDown(screen.getByRole("button"), { pointerType: "mouse", button: 2 });
  expect(spy).not.toHaveBeenCalled();
});

test("keyboard focus plays; mouse focus does not double play", async () => {
  render(
    <>
      <button>
        <Demo /> A
      </button>
      <button>
        <Demo /> B
      </button>
    </>,
  );
  const [a, b] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];
  // Teclado: Tab leva o foco ao botão A.
  fireEvent.keyDown(document.body, { key: "Tab" });
  a.focus();
  expect(spy).toHaveBeenCalledTimes(1);
  expect(animatedIcons()[0]).toBe(a.querySelector("svg"));
  await finishAll();
  // Mouse: pointerdown toca, o foco que se segue não toca de novo.
  fireEvent.pointerDown(b, { pointerType: "mouse", button: 0 });
  b.focus();
  expect(spy).toHaveBeenCalledTimes(2);
  await finishAll();
  a.focus();
  expect(spy).toHaveBeenCalledTimes(2);
});

test("icon in nested control belongs to the inner control", () => {
  render(
    <div role="option" data-testid="outer">
      <Demo data-testid="outer-icon" />
      <button>
        <Demo data-testid="inner-icon" />
      </button>
    </div>,
  );
  fireEvent.pointerDown(screen.getByRole("button"), { pointerType: "mouse", button: 0 });
  expect(animatedIcons()).toEqual([screen.getByTestId("inner-icon")]);
  spy.mockClear();
  hover(screen.getByTestId("outer"));
  expect(animatedIcons()).toEqual([screen.getByTestId("outer-icon")]);
});

test("disabled button and aria-disabled menuitem do not play", () => {
  render(
    <>
      <button disabled data-testid="b">
        <Demo />
      </button>
      <div role="menuitem" aria-disabled="true" data-testid="m">
        <Demo />
      </div>
    </>,
  );
  for (const id of ["b", "m"]) {
    const el = screen.getByTestId(id);
    hover(el);
    fireEvent.pointerDown(el, { pointerType: "mouse", button: 0 });
  }
  expect(spy).not.toHaveBeenCalled();
});

test("trigger='none' never plays automatically", () => {
  render(
    <button>
      <Demo trigger="none" />
    </button>,
  );
  const button = screen.getByRole("button");
  hover(button);
  fireEvent.pointerDown(button, { pointerType: "mouse", button: 0 });
  expect(spy).not.toHaveBeenCalled();
});

test("retrigger while playing is ignored", async () => {
  render(
    <button>
      <Demo />
    </button>,
  );
  const button = screen.getByRole("button");
  hover(button);
  fireEvent.pointerDown(button, { pointerType: "mouse", button: 0 });
  expect(spy).toHaveBeenCalledTimes(1);
  await finishAll();
  fireEvent.pointerDown(button, { pointerType: "mouse", button: 0 });
  expect(spy).toHaveBeenCalledTimes(2);
});

test("200 icons add document listeners once and remove them when all unmount", () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const { unmount } = render(
    <>
      {Array.from({ length: 200 }, (_, i) => (
        <button key={i}>
          <Demo />
        </button>
      ))}
    </>,
  );
  for (const type of ["pointerover", "pointerdown", "focusin", "keydown"]) {
    expect(add.mock.calls.filter(([t]) => t === type)).toHaveLength(1);
  }
  const options = add.mock.calls.find(([t]) => t === "pointerover")![2];
  expect(options).toEqual({ capture: true, passive: true });
  unmount();
  for (const type of ["pointerover", "pointerdown", "focusin", "keydown"]) {
    expect(remove.mock.calls.filter(([t]) => t === type)).toHaveLength(1);
  }
});

test("icon inside a portaled menuitem plays", () => {
  const { container, unmount } = render(
    <Portal>
      <div role="menuitem" data-testid="item">
        <Demo />
      </div>
    </Portal>,
  );
  const item = screen.getByTestId("item");
  expect(container.contains(item)).toBe(false);
  hover(item);
  expect(spy).toHaveBeenCalledTimes(1);
  unmount(); // antes do reset, que esvazia o body por baixo do portal
});

test("amp follows the button emphasis", () => {
  // jsdom não aplica tokens.css nem herda custom properties: resolve `--motion-amp` pelo
  // `data-motion` mais próximo, como a cascata real faria.
  const AMP: Record<string, string> = { calm: "0.45", responsive: "1", expressive: "1.6" };
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const style = real(el, pseudo);
    const level = el.closest("[data-motion]")?.getAttribute("data-motion");
    const getPropertyValue = (name: string) =>
      name === "--motion-amp" && level ? AMP[level] : style.getPropertyValue(name);
    return new Proxy(style, {
      get: (target, key) => (key === "getPropertyValue" ? getPropertyValue : Reflect.get(target, key)),
    });
  });
  render(
    <>
      <Button emphasis="high" data-testid="high">
        <Demo /> Salvar
      </Button>
      <Button emphasis="low" data-testid="low">
        <Demo /> Cancelar
      </Button>
    </>,
  );
  const high = screen.getByTestId("high");
  const low = screen.getByTestId("low");
  expect(high.getAttribute("data-motion")).toBe("expressive");
  expect(low.getAttribute("data-motion")).toBe("calm");
  hover(high);
  hover(low);
  expect(spy).toHaveBeenCalledTimes(2);
  const peak = (call: number) => parseFloat(String((spy.mock.calls[call]![0] as Keyframe[])[1]!.translate));
  expect(peak(0)).toBeCloseTo(2 * 1.6);
  expect(peak(1)).toBeCloseTo(2 * 0.45);
  expect(peak(0)).toBeGreaterThan(peak(1));
});
