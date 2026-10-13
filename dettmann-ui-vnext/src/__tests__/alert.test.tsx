import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "../components/alert";

describe("Alert", () => {
  it("exposes role=alert and subtle semantic colors", () => {
    render(
      <Alert.Root variant="success">
        <Alert.Title>Saved</Alert.Title>
        <Alert.Description>Your changes are live.</Alert.Description>
      </Alert.Root>
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("flex", "items-start", "gap-3", "p-3", "rounded-card");
    expect(alert.className).not.toMatch(/shadow-/);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Your changes are live.")).toBeInTheDocument();
  });

  it("shows the status glyph of its intent, hidden from assistive tech", () => {
    const { rerender } = render(
      <Alert.Root intent="warning">
        <Alert.Title>Careful</Alert.Title>
      </Alert.Root>,
    );
    const icon = screen.getByRole("alert").querySelector("[data-slot=alert-icon]")!;
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.querySelector("svg")).toBeInTheDocument();
    const warning = icon.innerHTML;
    rerender(
      <Alert.Root variant="success">
        <Alert.Title>Careful</Alert.Title>
      </Alert.Root>,
    );
    expect(screen.getByRole("alert").querySelector("[data-slot=alert-icon]")!.innerHTML).not.toBe(warning);
  });

  it("icon={null} removes the glyph and a custom icon replaces it", () => {
    const { rerender } = render(
      <Alert.Root icon={null}>
        <Alert.Title>Plain</Alert.Title>
      </Alert.Root>,
    );
    expect(screen.getByRole("alert").querySelector("[data-slot=alert-icon]")).toBeNull();
    rerender(
      <Alert.Root icon={<span data-testid="custom" />}>
        <Alert.Title>Plain</Alert.Title>
      </Alert.Root>,
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });

  it("keeps title and description in one text column", () => {
    render(
      <Alert.Root>
        <Alert.Title>Title</Alert.Title>
        <Alert.Description>Body</Alert.Description>
      </Alert.Root>,
    );
    expect(screen.getByText("Title").parentElement).toBe(screen.getByText("Body").parentElement);
    expect(screen.getByText("Title").parentElement).toHaveClass("flex-col", "min-w-0");
  });
});
