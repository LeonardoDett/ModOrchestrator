import { describe, expect, it } from "vitest";
import { defineRecipe, tvSlots, VariantProps } from "./index";

describe("internal recipe engine", () => {
  it("resolves base, variants, defaults and compounds", () => {
    const button = defineRecipe({
      base: "base",
      variants: { tone: { primary: "primary", danger: "danger" }, size: { sm: "sm", md: "md" } },
      defaultVariants: { tone: "primary", size: "md" },
      compoundVariants: [{ tone: "danger", size: "sm", class: "danger-sm" }],
    });

    expect(button()).toContain("base primary md");
    expect(button({ tone: "danger", size: "sm" })).toContain("danger-sm");
  });

  it("resolves slot variants", () => {
    const control = tvSlots({
      slots: { root: "root", icon: "icon" },
      variants: { active: { true: { root: "active-root", icon: "active-icon" }, false: {} } },
    });
    const styles = control({ active: true });
    expect(styles.root()).toContain("active-root");
    expect(styles.icon()).toContain("active-icon");
  });
});
