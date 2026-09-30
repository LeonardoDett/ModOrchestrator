import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Accordion } from "../components/accordion";

describe("Accordion", () => {
  describe("keyboard navigation", () => {
    it("navigates between triggers with arrow keys", async () => {
      const user = userEvent.setup();

      render(
        <Accordion.Root defaultValue="item1">
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item2">
            <Accordion.Trigger value="item2">Item 2</Accordion.Trigger>
            <Accordion.Content value="item2">Content 2</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item3">
            <Accordion.Trigger value="item3">Item 3</Accordion.Trigger>
            <Accordion.Content value="item3">Content 3</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      const trigger1 = screen.getByRole("button", { name: "Item 1" });
      const trigger2 = screen.getByRole("button", { name: "Item 2" });
      const trigger3 = screen.getByRole("button", { name: "Item 3" });

      trigger1.focus();
      expect(trigger1).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(trigger2).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(trigger3).toHaveFocus();

      // Should wrap around
      await user.keyboard("{ArrowDown}");
      expect(trigger1).toHaveFocus();
    });

    it("navigates backwards with ArrowUp", async () => {
      const user = userEvent.setup();

      render(
        <Accordion.Root>
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item2">
            <Accordion.Trigger value="item2">Item 2</Accordion.Trigger>
            <Accordion.Content value="item2">Content 2</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      const trigger1 = screen.getByRole("button", { name: "Item 1" });
      const trigger2 = screen.getByRole("button", { name: "Item 2" });

      trigger2.focus();
      await user.keyboard("{ArrowUp}");
      
      expect(trigger1).toHaveFocus();
    });

    it("jumps to first trigger with Home key", async () => {
      const user = userEvent.setup();

      render(
        <Accordion.Root>
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item2">
            <Accordion.Trigger value="item2">Item 2</Accordion.Trigger>
            <Accordion.Content value="item2">Content 2</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item3">
            <Accordion.Trigger value="item3">Item 3</Accordion.Trigger>
            <Accordion.Content value="item3">Content 3</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      const trigger1 = screen.getByRole("button", { name: "Item 1" });
      const trigger3 = screen.getByRole("button", { name: "Item 3" });

      trigger3.focus();
      await user.keyboard("{Home}");
      
      expect(trigger1).toHaveFocus();
    });

    it("jumps to last trigger with End key", async () => {
      const user = userEvent.setup();

      render(
        <Accordion.Root>
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item2">
            <Accordion.Trigger value="item2">Item 2</Accordion.Trigger>
            <Accordion.Content value="item2">Content 2</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item3">
            <Accordion.Trigger value="item3">Item 3</Accordion.Trigger>
            <Accordion.Content value="item3">Content 3</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      const trigger1 = screen.getByRole("button", { name: "Item 1" });
      const trigger3 = screen.getByRole("button", { name: "Item 3" });

      trigger1.focus();
      await user.keyboard("{End}");
      
      expect(trigger3).toHaveFocus();
    });
  });

  describe("single mode", () => {
    it("only allows one item open at a time", async () => {
      const user = userEvent.setup();

      render(
        <Accordion.Root defaultValue="item1">
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item2">
            <Accordion.Trigger value="item2">Item 2</Accordion.Trigger>
            <Accordion.Content value="item2">Content 2</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.queryByText("Content 2")).not.toBeInTheDocument();

      const trigger2 = screen.getByRole("button", { name: "Item 2" });
      await user.click(trigger2);

      expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });

    it("toggles item when clicked", async () => {
      const user = userEvent.setup();

      render(
        <Accordion.Root defaultValue="item1">
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      expect(screen.getByText("Content 1")).toBeInTheDocument();

      const trigger = screen.getByRole("button", { name: "Item 1" });
      await user.click(trigger);

      expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
    });
  });

  describe("multiple mode", () => {
    it("allows multiple items open simultaneously", async () => {
      const user = userEvent.setup();

      render(
        <Accordion.Root multiple defaultValue={["item1"]}>
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item2">
            <Accordion.Trigger value="item2">Item 2</Accordion.Trigger>
            <Accordion.Content value="item2">Content 2</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.queryByText("Content 2")).not.toBeInTheDocument();

      const trigger2 = screen.getByRole("button", { name: "Item 2" });
      await user.click(trigger2);

      // Both should be open
      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });
  });

  describe("aria attributes", () => {
    it("sets aria-expanded correctly", () => {
      render(
        <Accordion.Root defaultValue="item1">
          <Accordion.Item value="item1">
            <Accordion.Trigger value="item1">Item 1</Accordion.Trigger>
            <Accordion.Content value="item1">Content 1</Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="item2">
            <Accordion.Trigger value="item2">Item 2</Accordion.Trigger>
            <Accordion.Content value="item2">Content 2</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      );

      const trigger1 = screen.getByRole("button", { name: "Item 1" });
      const trigger2 = screen.getByRole("button", { name: "Item 2" });

      expect(trigger1).toHaveAttribute("aria-expanded", "true");
      expect(trigger2).toHaveAttribute("aria-expanded", "false");
    });
  });
});
