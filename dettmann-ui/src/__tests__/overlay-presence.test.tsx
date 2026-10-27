import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Modal } from "../components/modal";
import { Drawer } from "../components/drawer";
import { Presence } from "../motion";

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;
const proto = HTMLElement.prototype as unknown as { animate?: AnimateFn };

afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});

/** WAAPI falso cuja animação só termina quando o teste manda. */
function stubAnimate() {
  const finishers: Array<() => void> = [];
  proto.animate = vi.fn<AnimateFn>(() => {
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    finishers.push(finish);
    return { cancel() {}, finished } as unknown as Animation;
  });
  return {
    finishAll: async () => {
      await act(async () => {
        finishers.splice(0).forEach((f) => f());
        await Promise.resolve();
      });
    },
  };
}

function modal(open: boolean, onOpenChange = () => {}) {
  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <span>sibling</span>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Title</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <button type="button">inside</button>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

describe("Presence onExited", () => {
  it("fires once the exit ends, and at once without WAAPI", async () => {
    const onExited = vi.fn();
    const { rerender } = render(
      <Presence show onExited={onExited}>
        <div>x</div>
      </Presence>,
    );
    rerender(
      <Presence show={false} onExited={onExited}>
        <div>x</div>
      </Presence>,
    );
    expect(onExited).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("x")).toBeNull();
  });
});

describe("Modal exit", () => {
  it("without WAAPI the dialog and Root siblings leave at once", () => {
    const { rerender } = render(modal(true));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("sibling")).toBeInTheDocument();
    rerender(modal(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("sibling")).toBeNull();
  });

  it("closed from the start renders nothing, siblings included", () => {
    render(modal(false));
    expect(screen.queryByText("sibling")).toBeNull();
    expect(screen.queryByText("Title")).toBeNull();
  });

  it("stays mounted but inert while the exit runs, then unmounts", async () => {
    const { finishAll } = stubAnimate();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(modal(true, onOpenChange));
    rerender(modal(false, onOpenChange));
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveAttribute("inert");
    expect(dialog).toHaveAttribute("data-state", "closed");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    await finishAll();
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(screen.queryByText("sibling")).toBeNull();
  });

  it("releases the body scroll lock as soon as it closes", () => {
    stubAnimate();
    const { rerender } = render(modal(true));
    expect(document.body.style.overflow).toBe("hidden");
    rerender(modal(false));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("reopening during the exit brings it back interactive", () => {
    stubAnimate();
    const { rerender } = render(modal(true));
    rerender(modal(false));
    rerender(modal(true));
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("inert");
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("close button uses the shared focus ring", () => {
    render(modal(true));
    expect(screen.getByRole("button", { name: /close/i })).toHaveClass("focus-ring");
  });
});

describe("Drawer", () => {
  const drawer = (open: boolean, side: "left" | "right" | "top" | "bottom" = "right") => (
    <Drawer.Root open={open} onOpenChange={() => {}}>
      <Drawer.Content side={side}>
        <Drawer.Body>Body</Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );

  it("rounds only the free edge with the panel radius", () => {
    const { rerender } = render(drawer(true, "left"));
    const radius = () => screen.getByRole("dialog").className.split(/\s+/).filter((c) => c.startsWith("rounded"));
    expect(radius()).toEqual(["rounded-r-panel"]);
    rerender(drawer(true, "right"));
    expect(radius()).toEqual(["rounded-l-panel"]);
    rerender(drawer(true, "top"));
    expect(radius()).toEqual(["rounded-b-panel"]);
    rerender(drawer(true, "bottom"));
    expect(radius()).toEqual(["rounded-t-panel"]);
  });

  it("stays mounted but inert while the exit runs, then unmounts", async () => {
    const { finishAll } = stubAnimate();
    const { rerender } = render(drawer(true));
    rerender(drawer(false));
    expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute("inert");
    await finishAll();
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
  });

  it("without WAAPI it leaves at once", () => {
    const { rerender } = render(drawer(true));
    rerender(drawer(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
