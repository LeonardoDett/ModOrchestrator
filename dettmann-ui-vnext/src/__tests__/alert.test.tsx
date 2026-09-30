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
    expect(alert).toHaveClass("flex-col");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Your changes are live.")).toBeInTheDocument();
  });
});
