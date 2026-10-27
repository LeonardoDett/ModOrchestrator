import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useControllableState } from "../hooks/use-controllable-state";

describe("useControllableState", () => {
  describe("uncontrolled mode", () => {
    it("uses defaultValue initially", () => {
      const { result } = renderHook(() =>
        useControllableState({
          defaultValue: "initial",
        })
      );

      expect(result.current[0]).toBe("initial");
    });

    it("updates internal state when setValue is called", () => {
      const { result } = renderHook(() =>
        useControllableState({
          defaultValue: "initial",
        })
      );

      act(() => {
        result.current[1]("updated");
      });

      expect(result.current[0]).toBe("updated");
    });

    it("calls onChange when setValue is called", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useControllableState({
          defaultValue: "initial",
          onChange,
        })
      );

      act(() => {
        result.current[1]("updated");
      });

      expect(onChange).toHaveBeenCalledWith("updated");
    });
  });

  describe("controlled mode", () => {
    it("uses controlled value", () => {
      const { result } = renderHook(() =>
        useControllableState({
          value: "controlled",
          defaultValue: "default",
        })
      );

      expect(result.current[0]).toBe("controlled");
    });

    it("does not update internal state when setValue is called", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useControllableState({
          value: "controlled",
          onChange,
        })
      );

      act(() => {
        result.current[1]("new value");
      });

      // Value should still be controlled value
      expect(result.current[0]).toBe("controlled");
      // But onChange should have been called
      expect(onChange).toHaveBeenCalledWith("new value");
    });

    it("updates when controlled value changes", () => {
      const { result, rerender } = renderHook(
        ({ value }) =>
          useControllableState({
            value,
          }),
        { initialProps: { value: "first" } }
      );

      expect(result.current[0]).toBe("first");

      rerender({ value: "second" });

      expect(result.current[0]).toBe("second");
    });
  });

  describe("fallback value", () => {
    it("uses fallback when no value or defaultValue provided", () => {
      const { result } = renderHook(() =>
        useControllableState({
          fallbackValue: "fallback",
        })
      );

      expect(result.current[0]).toBe("fallback");
    });
  });
});
