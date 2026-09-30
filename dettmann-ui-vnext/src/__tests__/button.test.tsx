import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../components/button";

describe("Button", () => {
  it("renders startIcon and endIcon as siblings of the label", () => {
    render(
      <Button startIcon={<span>start</span>} endIcon={<span>end</span>}>
        Label
      </Button>
    );

    const button = screen.getByRole("button", { name: /label/i });
    expect(button).toHaveTextContent("start");
    expect(button).toHaveTextContent("Label");
    expect(button).toHaveTextContent("end");
    expect(button).toHaveClass("gap-2");
    expect(button).toHaveClass("rounded-lg");
    expect(button).toHaveClass("shadow-xs");
    expect(button).toHaveClass("font-semibold");
  });

  it("hides startIcon and endIcon while loading", () => {
    render(
      <Button loading startIcon={<span>start</span>} endIcon={<span>end</span>}>
        Save
      </Button>
    );

    expect(screen.queryByText("start")).not.toBeInTheDocument();
    expect(screen.queryByText("end")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Save");
  });
});
