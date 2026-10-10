import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./app";
import { configToCode } from "./panels/export";
import { CATALOG } from "../src/icons/catalog";

// O app inteiro (duas colunas com a tela de exemplo e o painel de controles) passa de 5 s por interação no jsdom.
vi.setConfig({ testTimeout: 20_000 });

describe("playground", () => {
  afterEach(() => {
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

describe("playground: ícones", () => {
  beforeAll(() => {
    // jsdom não tem `Element.prototype.animate`; os ícones disparam animação ao tocar.
    (Element.prototype as unknown as { animate: unknown }).animate = () => ({ cancel() {}, finished: Promise.resolve(), onfinish: null });
  });
  afterEach(() => {
    document.head.querySelectorAll("style[data-dettmann-theme]").forEach((s) => s.remove());
  });

  test("icons page lists the whole catalog", () => {
    render(<App />);
    expect(screen.getAllByTestId("icon-cell")).toHaveLength(CATALOG.length);
  });

  test("context switch wraps icons in a high-emphasis button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: "CTA (high)" }));
    const cells = screen.getAllByTestId("icon-cell");
    for (const cell of cells) expect(cell.querySelector("button[data-motion=expressive]")).not.toBeNull();
  });

  test("loader matrix renders 4 variants", () => {
    render(<App />);
    expect(screen.getAllByTestId("loader-variant")).toHaveLength(4);
  });

  test("reduce motion toggles the root attribute and restores it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole("switch", { name: "Reduzir movimento" }));
    expect(document.documentElement.dataset.reduceMotion).toBe("true");
    unmount();
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined();
  });
});
