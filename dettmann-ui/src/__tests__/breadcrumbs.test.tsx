import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "../components/breadcrumbs";

describe("Breadcrumbs", () => {
  it("marks the current page for assistive tech", () => {
    render(
      <Breadcrumbs.Root>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Separator />
        <Breadcrumbs.Item current>Profile</Breadcrumbs.Item>
      </Breadcrumbs.Root>
    );

    expect(screen.getByText("Profile")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Home")).toHaveAttribute("href", "/");
    expect(screen.getByText("Home")).toHaveClass("text-fg-muted");
    expect(screen.getByText("Profile")).toHaveClass("text-fg");
  });
});
