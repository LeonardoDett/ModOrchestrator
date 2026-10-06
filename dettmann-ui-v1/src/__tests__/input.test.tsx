import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Input } from "../components/input";

describe("Input", () => {
  describe("label association", () => {
    it("associates label with input field via htmlFor", () => {
      render(
        <Input.Root name="email">
          <Input.Label>Email</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      );

      const label = screen.getByText("Email");
      const input = screen.getByRole("textbox");

      expect(label).toHaveAttribute("for", input.id);
    });

    it("focuses input when label is clicked", async () => {
      const user = userEvent.setup();

      render(
        <Input.Root name="email">
          <Input.Label>Email</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      );

      const label = screen.getByText("Email");
      const input = screen.getByRole("textbox");

      await user.click(label);

      expect(input).toHaveFocus();
    });
  });

  describe("error propagation", () => {
    it("shows error message when error prop is set", () => {
      render(
        <Input.Root name="email" error="Invalid email">
          <Input.Label>Email</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
          <Input.Error />
        </Input.Root>
      );

      expect(screen.getByText("Invalid email")).toBeInTheDocument();
    });

    it("applies error styling to Input.Box", () => {
      render(
        <Input.Root name="email" error="Invalid email">
          <Input.Box data-testid="input-box">
            <Input.Field />
          </Input.Box>
          <Input.Error />
        </Input.Root>
      );

      const box = screen.getByTestId("input-box");
      expect(box).toHaveClass("border-danger");
      expect(box).toHaveClass("rounded-lg");
      expect(box).toHaveClass("shadow-xs");
    });

    it("hides error message when no error", () => {
      render(
        <Input.Root name="email">
          <Input.Box>
            <Input.Field />
          </Input.Box>
          <Input.Error />
        </Input.Root>
      );

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("returns null when error is an empty string", () => {
      render(
        <Input.Root name="email" error="">
          <Input.Box>
            <Input.Field />
          </Input.Box>
          <Input.Error />
        </Input.Root>
      );

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("returns null when error is null", () => {
      render(
        <Input.Root name="email" error={null}>
          <Input.Box>
            <Input.Field />
          </Input.Box>
          <Input.Error />
        </Input.Root>
      );

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("controlled state", () => {
    it("updates value when onChange is called", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <Input.Root name="email" value="" onChange={onChange}>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      );

      const input = screen.getByRole("textbox");
      await user.type(input, "a");

      expect(onChange).toHaveBeenCalledWith("a");
      expect(typeof onChange.mock.calls[0]?.[0]).toBe("string");
    });
  });

  describe("disabled state", () => {
    it("disables input field when disabled prop is true", () => {
      render(
        <Input.Root name="email" disabled>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      );

      const input = screen.getByRole("textbox");
      expect(input).toBeDisabled();
    });
  });

  describe("floating label", () => {
    it("renders floating label correctly", () => {
      render(
        <Input.Root name="email" value="">
          <Input.Box>
            <Input.Label floating>Email</Input.Label>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      );

      const label = screen.getByText("Email");
      expect(label).toHaveClass("absolute");
    });
  });

  describe("textarea miolo", () => {
    it("associates label with textarea via the same Root context", () => {
      render(
        <Input.Root name="bio">
          <Input.Label>Bio</Input.Label>
          <Input.Box>
            <Input.Textarea />
          </Input.Box>
        </Input.Root>
      );

      const textarea = screen.getByRole("textbox");
      const label = screen.getByText("Bio");

      expect(textarea.tagName).toBe("TEXTAREA");
      expect(label).toHaveAttribute("for", textarea.id);
    });

    it("shows error from Root without changing Error", () => {
      render(
        <Input.Root name="bio" error="Required">
          <Input.Label>Bio</Input.Label>
          <Input.Box>
            <Input.Textarea />
          </Input.Box>
          <Input.Error />
        </Input.Root>
      );

      expect(screen.getByText("Required")).toBeInTheDocument();
    });

    it("calls Root onChange with a plain string", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <Input.Root name="bio" value="" onChange={onChange}>
          <Input.Box>
            <Input.Textarea />
          </Input.Box>
        </Input.Root>
      );

      await user.type(screen.getByRole("textbox"), "x");
      expect(onChange).toHaveBeenCalledWith("x");
    });
  });

  describe("select miolo", () => {
    it("calls Root onChange with the option value, not an event", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <Input.Root name="role" value="" onChange={onChange}>
          <Input.Box>
            <Input.Select
              options={[
                { value: "dev", label: "Developer" },
                { value: "design", label: "Designer" },
              ]}
            />
          </Input.Box>
        </Input.Root>
      );

      await user.selectOptions(screen.getByRole("combobox"), "design");
      expect(onChange).toHaveBeenCalledWith("design");
      expect(onChange.mock.calls[0]?.[0]).not.toHaveProperty("target");
    });
  });

  describe("combobox miolo", () => {
    it("calls Root onChange with the selected option value", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <Input.Root name="country" value="" onChange={onChange}>
          <Input.Box>
            <Input.Combobox
              options={[
                { value: "br", label: "Brazil" },
                { value: "pt", label: "Portugal" },
              ]}
            />
          </Input.Box>
        </Input.Root>
      );

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByRole("option", { name: "Portugal" }));
      expect(onChange).toHaveBeenCalledWith("pt");
    });
  });
});
