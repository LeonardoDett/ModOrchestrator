import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Tabs } from "../components/tabs";

describe("Tabs", () => {
  describe("keyboard navigation", () => {
    it("navigates between tabs with arrow keys (horizontal)", async () => {
      const user = userEvent.setup();

      render(
        <Tabs.Root defaultValue="tab1">
          <Tabs.List>
            <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
            <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
            <Tabs.Trigger value="tab3">Tab 3</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
          <Tabs.Panel value="tab3">Content 3</Tabs.Panel>
        </Tabs.Root>
      );

      const tab1 = screen.getByRole("tab", { name: "Tab 1" });
      const tab2 = screen.getByRole("tab", { name: "Tab 2" });
      const tab3 = screen.getByRole("tab", { name: "Tab 3" });

      tab1.focus();
      expect(tab1).toHaveFocus();

      await user.keyboard("{ArrowRight}");
      expect(tab2).toHaveFocus();
      expect(screen.getByText("Content 2")).toBeInTheDocument();

      await user.keyboard("{ArrowRight}");
      expect(tab3).toHaveFocus();
      expect(screen.getByText("Content 3")).toBeInTheDocument();

      // Should wrap around
      await user.keyboard("{ArrowRight}");
      expect(tab1).toHaveFocus();
      expect(screen.getByText("Content 1")).toBeInTheDocument();
    });

    it("navigates backwards with ArrowLeft", async () => {
      const user = userEvent.setup();

      render(
        <Tabs.Root defaultValue="tab2">
          <Tabs.List>
            <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
            <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
            <Tabs.Trigger value="tab3">Tab 3</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
          <Tabs.Panel value="tab3">Content 3</Tabs.Panel>
        </Tabs.Root>
      );

      const tab1 = screen.getByRole("tab", { name: "Tab 1" });
      const tab2 = screen.getByRole("tab", { name: "Tab 2" });

      tab2.focus();
      await user.keyboard("{ArrowLeft}");
      
      expect(tab1).toHaveFocus();
      expect(screen.getByText("Content 1")).toBeInTheDocument();
    });

    it("jumps to first tab with Home key", async () => {
      const user = userEvent.setup();

      render(
        <Tabs.Root defaultValue="tab3">
          <Tabs.List>
            <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
            <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
            <Tabs.Trigger value="tab3">Tab 3</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
          <Tabs.Panel value="tab3">Content 3</Tabs.Panel>
        </Tabs.Root>
      );

      const tab1 = screen.getByRole("tab", { name: "Tab 1" });
      const tab3 = screen.getByRole("tab", { name: "Tab 3" });

      tab3.focus();
      await user.keyboard("{Home}");
      
      expect(tab1).toHaveFocus();
      expect(screen.getByText("Content 1")).toBeInTheDocument();
    });

    it("jumps to last tab with End key", async () => {
      const user = userEvent.setup();

      render(
        <Tabs.Root defaultValue="tab1">
          <Tabs.List>
            <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
            <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
            <Tabs.Trigger value="tab3">Tab 3</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
          <Tabs.Panel value="tab3">Content 3</Tabs.Panel>
        </Tabs.Root>
      );

      const tab1 = screen.getByRole("tab", { name: "Tab 1" });
      const tab3 = screen.getByRole("tab", { name: "Tab 3" });

      tab1.focus();
      await user.keyboard("{End}");
      
      expect(tab3).toHaveFocus();
      expect(screen.getByText("Content 3")).toBeInTheDocument();
    });
  });

  describe("roving tabindex", () => {
    it("only active tab has tabIndex 0", () => {
      render(
        <Tabs.Root defaultValue="tab2">
          <Tabs.List>
            <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
            <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
            <Tabs.Trigger value="tab3">Tab 3</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      );

      const tab1 = screen.getByRole("tab", { name: "Tab 1" });
      const tab2 = screen.getByRole("tab", { name: "Tab 2" });
      const tab3 = screen.getByRole("tab", { name: "Tab 3" });

      expect(tab1).toHaveAttribute("tabIndex", "-1");
      expect(tab2).toHaveAttribute("tabIndex", "0");
      expect(tab3).toHaveAttribute("tabIndex", "-1");
    });
  });

  describe("controlled mode", () => {
    it("respects controlled value", () => {
      const { rerender } = render(
        <Tabs.Root value="tab1" onValueChange={() => {}}>
          <Tabs.List>
            <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
            <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
        </Tabs.Root>
      );

      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.queryByText("Content 2")).not.toBeInTheDocument();

      rerender(
        <Tabs.Root value="tab2" onValueChange={() => {}}>
          <Tabs.List>
            <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
            <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
        </Tabs.Root>
      );

      expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });
  });
});
