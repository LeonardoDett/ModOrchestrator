import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Stepper } from "../components/stepper";

describe("Stepper", () => {
  it("marks the current step", () => {
    render(
      <Stepper.Root value={1}>
        <Stepper.Step index={0}>
          <Stepper.StepIndicator />
          <Stepper.StepLabel>Account</Stepper.StepLabel>
        </Stepper.Step>
        <Stepper.Step index={1}>
          <Stepper.StepIndicator />
          <Stepper.StepLabel>Details</Stepper.StepLabel>
        </Stepper.Step>
        <Stepper.Step index={2}>
          <Stepper.StepIndicator />
          <Stepper.StepLabel>Confirm</Stepper.StepLabel>
        </Stepper.Step>
      </Stepper.Root>
    );

    expect(screen.getByText("Account").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "completed"
    );
    expect(screen.getByText("Details").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "current"
    );
    expect(screen.getByText("Confirm").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "upcoming"
    );
  });

  it("changes step when interactive", async () => {
    const user = userEvent.setup();

    function Harness() {
      return (
        <Stepper.Root defaultValue={0} interactive>
          <Stepper.Step index={0}>
            <Stepper.StepIndicator />
            <Stepper.StepLabel>One</Stepper.StepLabel>
          </Stepper.Step>
          <Stepper.Step index={1}>
            <Stepper.StepIndicator />
            <Stepper.StepLabel>Two</Stepper.StepLabel>
          </Stepper.Step>
        </Stepper.Root>
      );
    }

    render(<Harness />);
    await user.click(screen.getByText("Two"));
    expect(screen.getByText("Two").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "current"
    );
  });
});
