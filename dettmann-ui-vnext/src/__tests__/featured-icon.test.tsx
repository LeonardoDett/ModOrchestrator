import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Check } from "lucide-react";
import { FeaturedIcon } from "../components/featured-icon";

describe("FeaturedIcon", () => {
  it("renders a decorative two-layer icon by default", () => {
    const { container } = render(<FeaturedIcon icon={Check} intent="success" />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("rounded-full");
    expect(root).toHaveClass("bg-intent-subtle");
    expect(root).toHaveAttribute("data-intent", "success");
    expect(root?.firstElementChild).toHaveClass("bg-state-hover");
  });

  it("exposes an accessible name when label is set", () => {
    render(<FeaturedIcon icon={Check} intent="danger" label="Error" />);
    expect(screen.getByRole("img", { name: "Error" })).toBeInTheDocument();
  });
});
