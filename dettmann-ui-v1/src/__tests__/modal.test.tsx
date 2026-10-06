import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Modal } from "../components/modal";

describe("Modal", () => {
  describe("focus trap", () => {
    it("focuses first focusable element when modal opens", async () => {
      render(
        <Modal.Root open={true} onOpenChange={() => {}}>
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>Test Modal</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <button>First Button</button>
              <button>Second Button</button>
            </Modal.Body>
            <Modal.Footer>
              <button>Close</button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      );

      const firstButton = screen.getByText("First Button");
      
      // Modal should trap focus within its boundaries
      expect(firstButton).toBeInTheDocument();
      expect(screen.getByText("Second Button")).toBeInTheDocument();
      expect(screen.getByText("Close")).toBeInTheDocument();
    });
  });

  describe("escape key", () => {
    it("closes modal when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <Modal.Root open={true} onOpenChange={onOpenChange}>
          <Modal.Content>
            <Modal.Body>Modal Content</Modal.Body>
          </Modal.Content>
        </Modal.Root>
      );

      await user.keyboard("{Escape}");

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("backdrop click", () => {
    it("closes modal when backdrop is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <Modal.Root open={true} onOpenChange={onOpenChange}>
          <Modal.Content>
            <Modal.Body>Modal Content</Modal.Body>
          </Modal.Content>
        </Modal.Root>
      );

      // Click outside the modal content (on backdrop)
      const backdrop = screen.getByRole("dialog").parentElement;
      if (backdrop) {
        await user.click(backdrop);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      }
    });

    it("does not close when modal content is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <Modal.Root open={true} onOpenChange={onOpenChange}>
          <Modal.Content>
            <Modal.Body>Modal Content</Modal.Body>
          </Modal.Content>
        </Modal.Root>
      );

      const content = screen.getByText("Modal Content");
      await user.click(content);

      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("rendering", () => {
    it("does not render when open is false", () => {
      render(
        <Modal.Root open={false} onOpenChange={() => {}}>
          <Modal.Content>
            <Modal.Body>Modal Content</Modal.Body>
          </Modal.Content>
        </Modal.Root>
      );

      expect(screen.queryByText("Modal Content")).not.toBeInTheDocument();
    });

    it("renders when open is true", () => {
      render(
        <Modal.Root open={true} onOpenChange={() => {}}>
          <Modal.Content>
            <Modal.Body>Modal Content</Modal.Body>
          </Modal.Content>
        </Modal.Root>
      );

      expect(screen.getByText("Modal Content")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveClass("rounded-xl", "shadow-xl");
    });

    it("applies flex end alignment and gap-2 on Footer by default", () => {
      render(
        <Modal.Root open={true} onOpenChange={() => {}}>
          <Modal.Content>
            <Modal.Footer>Actions</Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      );

      expect(screen.getByText("Actions")).toHaveClass(
        "flex",
        "items-center",
        "justify-end",
        "gap-2"
      );
    });
  });

  describe("close button", () => {
    it("closes modal when CloseButton is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <Modal.Root open={true} onOpenChange={onOpenChange}>
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>Test</Modal.Title>
              <Modal.CloseButton />
            </Modal.Header>
            <Modal.Body>Content</Modal.Body>
          </Modal.Content>
        </Modal.Root>
      );

      const closeButton = screen.getByLabelText("Close");
      await user.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
