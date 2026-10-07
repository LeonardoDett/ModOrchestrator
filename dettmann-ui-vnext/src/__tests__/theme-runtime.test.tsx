import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { ThemeProvider, ThemeScope, getThemeScript, useTheme, type UseThemeReturn } from "../theme";
import { injectTheme } from "../theme/inject";
import { createTheme } from "../theme/engine";
import { MotionScope } from "../motion";

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

test("ThemeScope inherits the level of an enclosing MotionScope, clamped by its ceiling", () => {
  const { container } = render(
    <MotionScope level="expressive">
      <ThemeScope theme="forest"><span /></ThemeScope>
      <ThemeScope theme={{ id: "still", label: "Still", brand: "#336699", motion: "responsive" }}><span /></ThemeScope>
      <ThemeScope theme="forest" motion="calm"><span /></ThemeScope>
    </MotionScope>,
  );
  const scopes = container.querySelectorAll<HTMLElement>("[data-theme]");
  expect(scopes[0]!.dataset.motion).toBe("expressive");
  expect(scopes[1]!.dataset.motion).toBe("responsive");
  expect(scopes[2]!.dataset.motion).toBe("calm");
});

test("getThemeScript output is valid JS that sets data-theme", () => {
  new Function(getThemeScript({ defaultTheme: "ink" }))();
  expect(document.documentElement.dataset.theme).toBe("ink");
});

test("scopes inside a forced light island stay light under html.dark", () => {
  const { container } = render(
    <ThemeProvider defaultMode="dark">
      <ThemeScope theme={{ id: "b", label: "B", brand: "#db2777" }} mode="light">
        <ThemeScope density="compact"><span /></ThemeScope>
        <ThemeScope theme={{ id: "c", label: "C", brand: "#0055aa" }}><span /></ThemeScope>
        <ThemeScope mode="dark"><span /></ThemeScope>
      </ThemeScope>
      <ThemeScope density="compact"><span /></ThemeScope>
    </ThemeProvider>,
  );
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  const scopes = [...container.querySelectorAll("div[data-theme]")];
  expect(scopes.map((s) => [s.getAttribute("data-theme"), s.getAttribute("data-ui-mode")])).toEqual([
    ["b", "light"],
    ["b", "light"],
    ["c", "light"],
    ["b", "dark"],
    ["forest", null],
  ]);
});

test("stored theme reaches child scopes before paint", () => {
  localStorage.setItem("ui-theme", "ember");
  const seen: (string | null)[] = [];
  function Probe() {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
      seen.push(ref.current!.closest("[data-theme]")!.getAttribute("data-theme"));
    });
    return <span ref={ref} />;
  }
  const { container } = render(<ThemeProvider><ThemeScope><Probe /></ThemeScope></ThemeProvider>);
  expect((container.firstElementChild as HTMLElement).dataset.theme).toBe("ember");
  expect(document.documentElement.dataset.theme).toBe("ember");
  expect(seen[0]).toBe("ember");
});

test("theme prop transitions preset -> config -> preset", () => {
  const ui = (theme: string | { id: string; label: string; brand: string }) => (
    <ThemeProvider theme={theme}><ThemeScope><span /></ThemeScope></ThemeProvider>
  );
  const { rerender, container } = render(ui("graphite"));
  const scope = () => (container.firstElementChild as HTMLElement).dataset.theme;
  expect(document.documentElement.dataset.theme).toBe("graphite");
  rerender(ui({ id: "mine", label: "Mine", brand: "#7c3aed" }));
  expect(document.documentElement.dataset.theme).toBe("mine");
  expect(scope()).toBe("mine");
  expect(document.querySelectorAll('style[data-dettmann-theme="mine"]')).toHaveLength(1);
  rerender(ui("ink"));
  expect(document.documentElement.dataset.theme).toBe("ink");
  expect(scope()).toBe("ink");
});

test("setTheme via useTheme switches theme and persists ids", () => {
  let api!: UseThemeReturn;
  function Grab() {
    api = useTheme();
    return null;
  }
  render(<ThemeProvider><Grab /></ThemeProvider>);
  act(() => api.setTheme("graphite"));
  expect(document.documentElement.dataset.theme).toBe("graphite");
  expect(api.theme.id).toBe("graphite");
  expect(localStorage.getItem("ui-theme")).toBe("graphite");
  act(() => api.setTheme({ id: "live", label: "Live", brand: "#0055aa" }));
  expect(document.documentElement.dataset.theme).toBe("live");
  expect(document.querySelectorAll('style[data-dettmann-theme="live"]')).toHaveLength(1);
  expect(localStorage.getItem("ui-theme")).toBe("graphite");
});

test("unsafe config id is rejected (dev) and falls back once per message (prod)", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const bad = { id: 'x"]{}*{display:none}[a="', label: "X", brand: "#7c3aed" };
  expect(() => render(<ThemeProvider theme={bad}><span /></ThemeProvider>)).toThrow(/id/);
  vi.restoreAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const bad2 = { ...bad, id: "Upper" };
  render(<ThemeProvider theme={bad2}><span /></ThemeProvider>);
  render(<ThemeProvider theme={bad2}><span /></ThemeProvider>);
  expect(document.documentElement.dataset.theme).toBe("forest");
  expect(document.querySelectorAll("style[data-dettmann-theme]")).toHaveLength(0);
  expect(error).toHaveBeenCalledTimes(1);
});

test("stored mode wins over defaultMode and setMode persists", () => {
  localStorage.setItem("ui-theme-mode", "dark");
  let api!: UseThemeReturn;
  function Grab() {
    api = useTheme();
    return null;
  }
  render(<ThemeProvider defaultMode="light"><Grab /></ThemeProvider>);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(api.resolvedMode).toBe("dark");
  act(() => api.setMode("light"));
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(localStorage.getItem("ui-theme-mode")).toBe("light");
});
