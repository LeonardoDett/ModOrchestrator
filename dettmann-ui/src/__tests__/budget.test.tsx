import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { ThemeProvider } from "../theme";
import {
  BudgetInspector,
  budgetVerdict,
  formatShare,
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

  test("fires within the max wait under continuous mutations", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useBudgetGuard(true));
    mount();
    const region = document.querySelector("[data-budget-region]") as HTMLElement;
    await act(async () => {
      for (let i = 0; i < 15; i++) {
        region.className = "c" + i;
        await vi.advanceTimersByTimeAsync(100);
      }
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("ThemeProvider warns exactly once in dev", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount();
    render(<ThemeProvider>x</ThemeProvider>);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("ThemeProvider never warns in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount();
    render(<ThemeProvider>x</ThemeProvider>);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
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
    expect(budgetVerdict({ low: 0.68, medium: 0.22, high: 0.1 }).ok).toBe(true);
    expect(budgetVerdict({ low: 0.6, medium: 0.28, high: 0.12 }).ok).toBe(true);
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

  describe("measurement", () => {
    const original = document.elementFromPoint;
    afterEach(() => {
      document.elementFromPoint = original;
    });

    test("is a safe no-op without document.elementFromPoint", async () => {
      // @ts-expect-error simula um ambiente sem layout
      document.elementFromPoint = undefined;
      render(<BudgetInspector step={400} />);
      await act(async () => {
        screen.getByRole("button", { name: "Medir" }).click();
      });
      expect(screen.getByText("Medição indisponível neste ambiente")).toBeTruthy();
      expect(screen.queryByText(/fora do orçamento/i)).toBeNull();
    });

    test("a child of a high button counts as high", async () => {
      document.body.innerHTML = `<button data-layer="high"><span id="label">Instalar</span></button><p id="plain"></p>`;
      const label = document.getElementById("label")!;
      const plain = document.getElementById("plain")!;
      // jsdom: 1024×768; step 400 → 3 × 2 = 6 pontos, só o de (200, 200) cai no rótulo do botão
      document.elementFromPoint = (x, y) => (x < 400 && y < 400 ? label : plain);
      render(<BudgetInspector step={400} />);
      await act(async () => {
        screen.getByRole("button", { name: "Medir" }).click();
      });
      const high = screen.getByText("high").nextElementSibling;
      expect(high?.textContent).toBe(formatShare(1 / 6));
      expect(high?.textContent).not.toBe("0%");
    });

    test("a small high share (~0.4%) reads as 0,4%, not 0%", async () => {
      document.body.innerHTML = `<button data-layer="high"><span id="label">Instalar</span></button><p id="plain"></p>`;
      const label = document.getElementById("label")!;
      const plain = document.getElementById("plain")!;
      // jsdom 1024×768, step 40 → 26 × 19 = 494 pontos; 2 caem no botão (2/494 ≈ 0,405%)
      document.elementFromPoint = (x, y) => (x < 40 && y < 80 ? label : plain);
      render(<BudgetInspector step={40} />);
      await act(async () => {
        screen.getByRole("button", { name: "Medir" }).click();
      });
      expect(screen.getByText("high").nextElementSibling?.textContent).toBe("0,4%");
    });
  });
});

describe("formatShare", () => {
  test("keeps one decimal so small shares do not read as 0%", () => {
    expect(formatShare(10 / 2702)).toBe("0,4%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.6)).toBe("60%");
    expect(formatShare(0.2134)).toBe("21,3%");
  });
});
