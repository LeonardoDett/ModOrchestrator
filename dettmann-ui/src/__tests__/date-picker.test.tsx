import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DatePicker } from "../components/date-picker";
import { Input } from "../components/input";

describe("DatePicker.Field", () => {
  it("writes an ISO yyyy-MM-dd string to Input.Root onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Input.Root name="startDate" value="2026-08-18" onChange={onChange}>
        <Input.Label>Data de início</Input.Label>
        <Input.Box>
          <DatePicker.Field />
        </Input.Box>
      </Input.Root>
    );

    await user.click(screen.getByRole("button", { name: "Data de início" }));
    await user.click(screen.getByRole("button", { name: "20" }));

    expect(onChange).toHaveBeenCalledWith("2026-08-20");
    expect(onChange.mock.calls[0]?.[0]).not.toHaveProperty("target");
  });

  it("displays the date from Input.Root value without the 4-level composition", () => {
    render(
      <Input.Root name="startDate" value="2026-08-18">
        <Input.Box>
          <DatePicker.Field />
        </Input.Box>
      </Input.Root>
    );

    expect(screen.getByText("Aug 18, 2026")).toBeInTheDocument();
  });
});
