import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import {
  BudgetInspector,
  budgetVerdict,
  findBudgetViolations,
  sampleLayers,
  summarizeLayers,
  useBudgetGuard,
} from "../dev";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("findBudgetViolations", () => {
  test("flags a region with two visible high elements", () => {
    document.body.innerHTML = `<div data-budget-region><button data-layer="high"></button><button data-layer="high"></button></div>`;
    expect(findBudgetViolations(document)).toHaveLength(1);
  });
  test("ignores hidden high elements", () => {
    document.body.innerHTML = `<div data-budget-region><button data-layer="high"></button><div hidden><button data-layer="high"></button></div></div>`;
    expect(findBudgetViolations(document)).toEqual([]);
  });
  test("ignores inert and aria-hidden subtrees", () => {
    document.body.innerHTML = `<div data-budget-region><button data-layer="high"></button><div inert><i data-layer="high"></i></div><div aria-hidden="true"><i data-layer="high"></i></div></div>`;
    expect(findBudgetViolations(document)).toEqual([]);
  });
});

describe("useBudgetGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  const mount = () => {
    document.body.innerHTML = `<div data-budget-region><button data-layer="high"></button><button data-layer="high"></button></div>`;
  };

  test("warns once per region in dev", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount } = renderHook(() => useBudgetGuard(true));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe("[dettmann-ui] budget: 2 high-emphasis elements in");
    document.body.appendChild(document.createElement("span"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("never warns when disabled (production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useBudgetGuard(false));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test("disconnects on unmount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount } = renderHook(() => useBudgetGuard(true));
    unmount();
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("sampling", () => {
  test("sampleLayers maps hits to nearest data-layer ancestor and skips ignored", () => {
    document.body.innerHTML = `
      <div id="plain"></div>
      <div data-layer="medium"><span id="m"></span></div>
      <div data-layer="high" id="h"></div>
      <div data-budget-ignore><b id="ig"></b></div>`;
    const by = (id: string) => document.getElementById(id);
    const seq = [by("plain"), by("m"), by("h"), by("ig"), null];
    let i = 0;
    const out = sampleLayers({ width: 5, height: 1, step: 1, hit: () => seq[i++] ?? null });
    expect(out).toEqual(["low", "medium", "high"]);
  });

  test("summarizeLayers returns fractions", () => {
    expect(summarizeLayers(["low", "low", "medium", "high"])).toEqual({ low: 0.5, medium: 0.25, high: 0.25 });
    expect(summarizeLayers([])).toEqual({ low: 0, medium: 0, high: 0 });
  });

  test("verdict passes 62/29/9 and fails 40/30/30", () => {
    expect(budgetVerdict({ low: 0.62, medium: 0.29, high: 0.09 }).ok).toBe(true);
    const bad = budgetVerdict({ low: 0.4, medium: 0.3, high: 0.3 });
    expect(bad.ok).toBe(false);
    expect(bad.messages.length).toBeGreaterThan(0);
  });
});

describe("BudgetInspector", () => {
  test("renders nothing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { container } = render(<BudgetInspector />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders ignored panel in dev with Medir button", async () => {
    document.elementFromPoint = () => document.body;
    const { container } = render(<BudgetInspector step={400} />);
    expect(container.querySelector("[data-budget-ignore]")).not.toBeNull();
    await act(async () => {
      screen.getByRole("button", { name: "Medir" }).click();
    });
    expect(screen.getByText(/orçamento/i, { selector: "p" })).toBeTruthy();
  });
});
