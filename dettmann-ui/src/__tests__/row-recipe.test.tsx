import { expect, test } from "vitest";
import { rowRecipe } from "../core/styles/row";

test("row is compact and carries the inset focus ring", () => {
  expect(rowRecipe()).toContain("h-control-sm");
  expect(rowRecipe()).toContain("focus-ring-inset");
  expect(rowRecipe()).toContain("hover:bg-state-hover");
});

test("selection is a tinted row plus a brand indicator, never a fill", () => {
  expect(rowRecipe({ selected: true })).toContain("bg-selected");
  expect(rowRecipe({ selected: true })).toMatch(/before:\S*bg-brand-fill/);
  expect(rowRecipe({ selected: true })).not.toContain("bg-intent-fill");
  expect(rowRecipe({ selected: true, indicator: "bottom" })).toContain("before:inset-x-0");
  expect(rowRecipe({ selected: true, indicator: "none" })).not.toMatch(/before:/);
});

test("active marks the keyboard item without focus", () => {
  expect(rowRecipe({ active: true })).toContain("bg-state-hover");
});

test("disabled uses tokens and drops interaction", () => {
  const cls = rowRecipe({ disabled: true });
  expect(cls).toContain("text-fg-subtle");
  expect(cls).not.toMatch(/opacity-/);
  expect(cls).not.toMatch(/hover:/);
});
