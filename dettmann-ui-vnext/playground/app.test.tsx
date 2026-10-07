import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./app";
import { configToCode } from "./panels/export";

describe("playground", () => {
  let original: typeof document.elementFromPoint;
  beforeEach(() => {
    // jsdom não tem layout; o BudgetInspector amostra a tela com elementFromPoint.
    original = document.elementFromPoint;
    document.elementFromPoint = () => document.body;
  });
  afterEach(() => {
    document.elementFromPoint = original;
    document.head.querySelectorAll("style[data-dettmann-theme]").forEach((s) => s.remove());
  });

  test("renders both modes and the contrast panel with no failures for the default preset", () => {
    render(<App />);
    expect(screen.getAllByTestId("mode-column")).toHaveLength(2);
    expect(screen.getAllByTestId("contrast-pass").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("contrast-fail")).toHaveLength(0);
  });

  test("changing brand updates the exported code", async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByLabelText("Cor da marca (texto)");
    await user.clear(field);
    await user.type(field, "#7c3aed");
    expect(screen.getByTestId("export-code").textContent).toContain('brand: "#7c3aed"');
  });

  test("an invalid brand keeps the last valid theme and shows the error", async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByLabelText("Cor da marca (texto)");
    await user.clear(field);
    await user.type(field, "teal");
    const editor = screen.getByRole("complementary", { name: "Editor de tema" });
    expect(within(editor).getByRole("alert").textContent).toMatch(/brand/);
    expect(screen.getAllByTestId("mode-column")).toHaveLength(2);
  });

  test("configToCode omits defaults", () => {
    const code = configToCode({ id: "x", label: "X", brand: "#123456", vibrance: 0.5 });
    expect(code).not.toContain("vibrance");
    expect(code).toContain('brand: "#123456"');
    expect(code.startsWith("createTheme({")).toBe(true);
  });

  test("configToCode keeps non-default knobs", () => {
    const code = configToCode({
      id: "x",
      label: "X",
      brand: "#123456",
      neutral: "warm",
      motion: { ceiling: "expressive" },
      font: { sans: "Plus Jakarta Sans", mono: "Fira Code" },
    });
    expect(code).toContain('neutral: "warm"');
    expect(code).not.toContain("motion");
    expect(code).toContain('mono: "Fira Code"');
    expect(code).not.toContain("sans");
  });
});
