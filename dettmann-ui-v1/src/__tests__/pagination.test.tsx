import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Pagination } from "../components/pagination";

describe("Pagination", () => {
  it("calls onPageChange from the shorthand API", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />
    );

    await user.click(screen.getByRole("button", { name: "Go to page 3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(screen.getByRole("button", { name: "Go to page 2" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("composes Root + Item with shared context", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination.Root currentPage={1} totalPages={4} onPageChange={onPageChange}>
        <Pagination.Previous />
        <Pagination.Item page={1} />
        <Pagination.Item page={2} />
        <Pagination.Next />
      </Pagination.Root>
    );

    expect(screen.getByRole("button", { name: "Go to previous page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Go to page 2" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
