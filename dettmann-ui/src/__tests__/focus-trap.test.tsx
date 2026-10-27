import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { Modal } from "../components/modal";

function Dialog({ children }: { children: React.ReactNode }) {
  return (
    <Modal.Root open onOpenChange={() => {}}>
      <Modal.Content>
        <Modal.Title>Trap</Modal.Title>
        {children}
      </Modal.Content>
    </Modal.Root>
  );
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 10)));

describe("useFocusTrap (Modal)", () => {
  it("keeps Tab inside a modal mounted open, around a portal that mounts late", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Outside</button>
        <Dialog>
          <button>First</button>
          <button>Last</button>
          {/* Fora da ordem do Tab: não pode ser o "último" da armadilha. */}
          <button tabIndex={-1}>Roving</button>
        </Dialog>
      </>,
    );
    await settle();
    expect(screen.getByText("First")).toHaveFocus();
    await user.tab();
    expect(screen.getByText("Last")).toHaveFocus();
    await user.tab();
    expect(screen.getByText("First")).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByText("Last")).toHaveFocus();
  });

  it("wraps from an element outside the tab order at the end of the panel", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Dialog>
          <button>First</button>
          <div role="grid" tabIndex={-1} aria-label="Grid" />
        </Dialog>
        <button>Outside</button>
      </>,
    );
    await settle();
    act(() => screen.getByRole("grid").focus());
    await user.tab();
    expect(screen.getByText("First")).toHaveFocus();
  });

  it("returns focus to the trigger, unless the closer moved it elsewhere", async () => {
    const user = userEvent.setup();
    function Harness({ moveTo }: { moveTo: boolean }) {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Trigger</button>
          <button id="elsewhere">Elsewhere</button>
          <Modal.Root open={open} onOpenChange={setOpen}>
            <Modal.Content>
              <Modal.Title>Trap</Modal.Title>
              <button
                onClick={() => {
                  if (moveTo) document.getElementById("elsewhere")!.focus();
                  setOpen(false);
                }}
              >
                Done
              </button>
            </Modal.Content>
          </Modal.Root>
        </>
      );
    }
    const { unmount } = render(<Harness moveTo={false} />);
    await user.click(screen.getByText("Trigger"));
    await settle();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByText("Trigger")).toHaveFocus();
    unmount();

    render(<Harness moveTo />);
    await user.click(screen.getByText("Trigger"));
    await settle();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByText("Elsewhere")).toHaveFocus();
  });
});
