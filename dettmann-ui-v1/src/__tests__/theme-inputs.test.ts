import { describe, expect, it } from "vitest";
import { inputsToStyle } from "../theme/theme-inputs";

describe("theme runtime inputs", () => {
  it("maps scalar semantic roles to CSS variables", () => {
    expect(
      inputsToStyle({ light: { canvas: "#000000", focus: "#00ff00" } }, "light"),
    ).toEqual({ "--ui-canvas": "#000000", "--ui-focus": "#00ff00" });
  });

  it("requires explicit values for a complete color family", () => {
    expect(
      inputsToStyle(
        {
          dark: {
            brand: {
              base: "#39c77d",
              hover: "#54d891",
              pressed: "#2caf6e",
              on: "#08110c",
              subtle: "#143624",
              subtleHover: "#1a442d",
              border: "#2d7651",
              text: "#61e19b",
            },
          },
        },
        "dark",
      ),
    ).toEqual({
      "--ui-brand": "#39c77d",
      "--ui-brand-hover": "#54d891",
      "--ui-brand-pressed": "#2caf6e",
      "--ui-on-brand": "#08110c",
      "--ui-brand-subtle": "#143624",
      "--ui-brand-subtle-hover": "#1a442d",
      "--ui-brand-border": "#2d7651",
      "--ui-brand-text": "#61e19b",
    });
  });
});
