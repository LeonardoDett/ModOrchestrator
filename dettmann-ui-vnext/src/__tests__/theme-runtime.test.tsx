import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider, ThemeScope, getThemeScript } from "../theme";
import { injectTheme } from "../theme/inject";
import { createTheme } from "../theme/engine";

function reset() {
  document.querySelectorAll("style[data-dettmann-theme]").forEach((s) => s.remove());
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.removeAttribute("style");
  root.className = "";
  localStorage.clear();
}

beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  reset();
});

test("applies data-theme and dark class for a preset without injecting a style", () => {
  render(<ThemeProvider theme="graphite" defaultMode="dark"><span /></ThemeProvider>);
  expect(document.documentElement.dataset.theme).toBe("graphite");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.querySelectorAll("style[data-dettmann-theme]")).toHaveLength(0);
});

test("injects a runtime config and replaces it on change instead of accumulating", () => {
  const { rerender } = render(<ThemeProvider theme={{ id: "mine", label: "Mine", brand: "#7c3aed" }}><span /></ThemeProvider>);
  const first = document.querySelector('style[data-dettmann-theme="mine"]')?.textContent;
  rerender(<ThemeProvider theme={{ id: "mine", label: "Mine", brand: "#db2777" }}><span /></ThemeProvider>);
  const styles = document.querySelectorAll('style[data-dettmann-theme="mine"]');
  expect(styles).toHaveLength(1);
  expect(styles[0]!.textContent).toContain("--ui-brand-fill");
  expect(styles[0]!.textContent).not.toBe(first);
  expect(document.documentElement.dataset.theme).toBe("mine");
});

test("theme from the consumer registry is injected", () => {
  render(<ThemeProvider theme="corp" themes={{ corp: { id: "corp", label: "Corp", brand: "#0055aa" } }}><span /></ThemeProvider>);
  expect(document.documentElement.dataset.theme).toBe("corp");
  expect(document.querySelectorAll('style[data-dettmann-theme="corp"]')).toHaveLength(1);
});

test("two scopes with different configs get separate styles", () => {
  const { container } = render(
    <ThemeProvider>
      <ThemeScope theme={{ id: "a", label: "A", brand: "#7c3aed" }}>
        <ThemeScope mode="dark"><span /></ThemeScope>
      </ThemeScope>
      <ThemeScope theme={{ id: "b", label: "B", brand: "#db2777" }}><span /></ThemeScope>
    </ThemeProvider>,
  );
  expect(document.querySelectorAll('style[data-dettmann-theme="a"]')).toHaveLength(1);
  expect(document.querySelectorAll('style[data-dettmann-theme="b"]')).toHaveLength(1);
  const a = document.querySelector('style[data-dettmann-theme="a"]')!.textContent!;
  const b = document.querySelector('style[data-dettmann-theme="b"]')!.textContent!;
  expect(a).toContain('[data-theme="a"]');
  expect(a).not.toContain('[data-theme="b"]');
  expect(b).not.toContain('[data-theme="a"]');
  const scopes = container.querySelectorAll("div[data-theme]");
  expect([...scopes].map((s) => s.getAttribute("data-theme"))).toEqual(["a", "a", "b"]);
  expect(scopes[1]!.getAttribute("data-ui-mode")).toBe("dark");
  expect(scopes[0]!.hasAttribute("data-ui-mode")).toBe(false);
});

test("injectTheme replaces content per id and is a no-op without a document", () => {
  injectTheme(createTheme({ id: "x1", label: "X", brand: "#7c3aed" }));
  injectTheme(createTheme({ id: "x1", label: "X", brand: "#db2777" }));
  expect(document.querySelectorAll('style[data-dettmann-theme="x1"]')).toHaveLength(1);
  injectTheme(createTheme({ id: "forest", label: "F", brand: "#db2777" }));
  expect(document.querySelectorAll('style[data-dettmann-theme="forest"]')).toHaveLength(0);
  expect(() => injectTheme(createTheme({ id: "x2", label: "X", brand: "#7c3aed" }), null as unknown as Document)).not.toThrow();
});

test("unknown stored theme id falls back to default", () => {
  localStorage.setItem("ui-theme", "removed");
  render(<ThemeProvider><span /></ThemeProvider>);
  expect(document.documentElement.dataset.theme).toBe("forest");
});

test("valid stored theme id is applied", () => {
  localStorage.setItem("ui-theme", "ember");
  render(<ThemeProvider><span /></ThemeProvider>);
  expect(document.documentElement.dataset.theme).toBe("ember");
});

test("blocked localStorage does not throw", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => render(<ThemeProvider><span /></ThemeProvider>)).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe("forest");
});

test("invalid config throws ThemeConfigError in dev", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<ThemeProvider theme={{ id: "x", label: "X", brand: "nope" }}><span /></ThemeProvider>)).toThrow(/brand/);
});

test("unknown theme id throws in dev", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<ThemeProvider theme="nope"><span /></ThemeProvider>)).toThrow(/theme/);
});

test("invalid config falls back in prod", () => {
  vi.stubEnv("NODE_ENV", "production");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<ThemeProvider theme={{ id: "x", label: "X", brand: "nope" }}><span /></ThemeProvider>)).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe("forest");
  expect(error).toHaveBeenCalledTimes(1);
  expect(String(error.mock.calls[0]![0])).toMatch(/brand/);
});

test("ThemeScope sets density and motion attributes", () => {
  const { container } = render(<ThemeScope theme="forest" density="compact"><span /></ThemeScope>);
  const div = container.firstElementChild as HTMLElement;
  expect(div.dataset.theme).toBe("forest");
  expect(div.dataset.density).toBe("compact");
  expect(div.dataset.motion).toBe("calm");
  expect(div.hasAttribute("data-ui-mode")).toBe(false);
});

test("ThemeScope clamps motion by the theme ceiling", () => {
  const { container } = render(
    <ThemeScope theme={{ id: "still", label: "Still", brand: "#336699", motion: "responsive" }} motion="expressive"><span /></ThemeScope>,
  );
  expect((container.firstElementChild as HTMLElement).dataset.motion).toBe("responsive");
});

test("getThemeScript output is valid JS that sets data-theme", () => {
  new Function(getThemeScript({ defaultTheme: "ink" }))();
  expect(document.documentElement.dataset.theme).toBe("ink");
});
