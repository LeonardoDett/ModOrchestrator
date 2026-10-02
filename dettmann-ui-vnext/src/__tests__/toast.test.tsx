import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ToastProvider, useToast } from "../components/toast";

function Trigger() {
  const { addToast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        addToast({ description: "Saved", variant: "success", duration: 0 })
      }
    >
      Notify
    </button>
  );
}

describe("Toast", () => {
  it("uses the subtle success language shared with Badge", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    await user.click(screen.getByRole("button", { name: "Notify" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-tone-subtle");
    expect(alert).toHaveClass("text-tone-text");
    expect(alert).toHaveAttribute("data-tone", "success");
    expect(alert).toHaveClass("shadow-xl");
    expect(alert).toHaveClass("rounded-xl");
  });

  it("runs its action once and closes", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    function WithAction() {
      const { addToast } = useToast();
      return (
        <button type="button" onClick={() => addToast({ title: "Enabled", duration: 0, action: { label: "Also enable B", onClick } })}>
          Notify
        </button>
      );
    }
    render(
      <ToastProvider>
        <WithAction />
      </ToastProvider>
    );
    await user.click(screen.getByRole("button", { name: "Notify" }));
    await user.click(screen.getByRole("button", { name: "Also enable B" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
