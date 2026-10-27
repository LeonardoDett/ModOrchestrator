import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Container } from "../primitives/container";
import { Grid } from "../primitives/grid";
import { PageContainer } from "../components/page-container";

describe("Container", () => {
  it("uses token max-widths including the 1440px frame", () => {
    const { rerender } = render(<Container size="xl">xl</Container>);
    expect(screen.getByText("xl")).toHaveClass("max-w-container-xl");

    rerender(<Container size="2xl">frame</Container>);
    expect(screen.getByText("frame")).toHaveClass("max-w-container-2xl");
  });

  it("scales horizontal padding at smaller breakpoints", () => {
    render(<Container padding="md">pad</Container>);
    expect(screen.getByText("pad")).toHaveClass("px-4", "sm:px-6", "lg:px-8");
  });
});

describe("Grid", () => {
  it("is structure-only with configurable columns", () => {
    render(
      <Grid columns={1} sm={2} md={4} gap="md">
        cell
      </Grid>
    );
    const grid = screen.getByText("cell");
    expect(grid).toHaveClass("grid", "grid-cols-1", "sm:grid-cols-2", "md:grid-cols-4");
  });
});

describe("PageContainer", () => {
  it("defaults to the full frame and page padding", () => {
    render(<PageContainer>body</PageContainer>);
    expect(screen.getByText("body")).toHaveClass("max-w-container-full", "px-4", "md:px-8", "xl:px-20");
  });

  it("renders optional title, description, and actions slots", () => {
    render(
      <PageContainer title="Users" description="Manage accounts" actions={<button>New</button>}>
        table
      </PageContainer>
    );
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Manage accounts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});
