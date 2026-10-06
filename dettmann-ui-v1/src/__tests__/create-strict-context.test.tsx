import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createStrictContext, createOptionalContext } from "../utils/create-strict-context";

describe("createStrictContext", () => {
  it("throws error when hook is used outside provider", () => {
    const [, useTestContext] = createStrictContext<{ value: string }>("Test");

    function ConsumerComponent() {
      useTestContext("Component");
      return <div>Test</div>;
    }

    expect(() => {
      render(<ConsumerComponent />);
    }).toThrow("Component must be used within Test.Root");
  });

  it("provides context value when used inside provider", () => {
    const [TestProvider, useTestContext] = createStrictContext<{ value: string }>("Test");

    function ConsumerComponent() {
      const { value } = useTestContext("Component");
      return <div>{value}</div>;
    }

    render(
      <TestProvider value={{ value: "test value" }}>
        <ConsumerComponent />
      </TestProvider>
    );

    expect(screen.getByText("test value")).toBeInTheDocument();
  });
});

describe("createOptionalContext", () => {
  it("returns null when hook is used outside provider", () => {
    const [, useTestContext] = createOptionalContext<{ value: string }>("Test");

    function ConsumerComponent() {
      const context = useTestContext("Consumer");
      return <div>{context ? context.value : "no context"}</div>;
    }

    render(<ConsumerComponent />);

    expect(screen.getByText("no context")).toBeInTheDocument();
  });

  it("provides context value when used inside provider", () => {
    const [TestProvider, useTestContext] = createOptionalContext<{ value: string }>("Test");

    function ConsumerComponent() {
      const context = useTestContext("Consumer");
      return <div>{context ? context.value : "no context"}</div>;
    }

    render(
      <TestProvider value={{ value: "test value" }}>
        <ConsumerComponent />
      </TestProvider>
    );

    expect(screen.getByText("test value")).toBeInTheDocument();
  });
});
