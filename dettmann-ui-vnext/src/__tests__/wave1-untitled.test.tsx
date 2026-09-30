import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { Button } from "../components/button";
import { ButtonGroup } from "../components/button-group";
import { Progress } from "../components/progress";
import { Skeleton } from "../primitives/skeleton";
import { EmptyState } from "../components/empty-state";
import { EmptyPlaceholder } from "../components/empty-placeholder";
import { Tag } from "../components/tag";
import { Rating } from "../components/rating";
import { Input } from "../components/input";
import { Tabs } from "../components/tabs";

describe("ButtonGroup", () => {
  it("exposes role=group", () => {
    render(
      <ButtonGroup>
        <Button variant="secondary">A</Button>
        <Button variant="secondary">B</Button>
      </ButtonGroup>
    );
    expect(screen.getByRole("group")).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("exposes progressbar with valuemin/max/now", () => {
    render(<Progress.Root value={40} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });
});

describe("Skeleton", () => {
  it("is aria-hidden", () => {
    render(<Skeleton data-testid="sk" />);
    expect(screen.getByTestId("sk")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EmptyState", () => {
  it("renders slots", () => {
    render(
      <EmptyState.Root>
        <EmptyState.Title>None yet</EmptyState.Title>
        <EmptyState.Description>Add the first item.</EmptyState.Description>
      </EmptyState.Root>
    );
    expect(screen.getByText("None yet")).toBeInTheDocument();
    expect(screen.getByText("Add the first item.")).toBeInTheDocument();
  });
});

describe("EmptyPlaceholder", () => {
  it("renders the default help text and no action", () => {
    render(<EmptyPlaceholder />);
    expect(screen.getByText("Ainda não há nada aqui")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a custom message and media", () => {
    render(<EmptyPlaceholder media={<span>Ilustração</span>} message="Nada para mostrar." />);
    expect(screen.getByText("Nada para mostrar.")).toBeInTheDocument();
    expect(screen.getByText("Ilustração")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Tag", () => {
  it("calls onRemove with the value, not an event", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <Tag value="design" onRemove={onRemove}>
        Design
      </Tag>
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith("design");
  });
});

describe("Rating", () => {
  it("updates value via click and keyboard", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Rating.Root value={1} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("button", { name: "3 of 5" }));
    expect(onValueChange).toHaveBeenCalledWith(3);
    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenCalledWith(2);
  });
});

describe("Input.Pin", () => {
  it("concatenates digits onto Root onChange", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [otp, setOtp] = useState("");
      return (
        <Input.Root value={otp} onChange={setOtp}>
          <Input.Pin length={4} />
          <span data-testid="otp">{otp}</span>
        </Input.Root>
      );
    }
    render(<Harness />);
    await user.type(screen.getAllByRole("textbox")[0]!, "12");
    expect(screen.getByTestId("otp")).toHaveTextContent("12");
  });
});

describe("Input.MultiSelect", () => {
  it("toggles options into a string[] on Root", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Input.Root value={[]} onChange={onChange}>
        <Input.Box>
          <Input.MultiSelect
            options={[
              { value: "a", label: "Alpha" },
              { value: "b", label: "Beta" },
            ]}
          />
        </Input.Box>
      </Input.Root>
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Alpha" }));
    expect(onChange).toHaveBeenCalledWith(["a"]);
  });
});

describe("Tabs segmented", () => {
  it("renders segmented list without underline border", () => {
    render(
      <Tabs.Root defaultValue="a" variant="segmented">
        <Tabs.List>
          <Tabs.Trigger value="a">A</Tabs.Trigger>
          <Tabs.Trigger value="b">B</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
    );
    expect(screen.getByRole("tablist")).toHaveClass("bg-muted");
  });
});
