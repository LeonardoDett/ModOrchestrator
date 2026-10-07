import { afterEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeScope } from "../theme";
import { MotionScope } from "../motion";
import { Modal } from "../components/modal";
import { Popover } from "../components/popover";
import { Tooltip } from "../components/tooltip";
import { Drawer } from "../components/drawer";

afterEach(() => {
  document.querySelectorAll("style[data-dettmann-theme]").forEach((s) => s.remove());
});

describe("overlays keep the ThemeScope outside the tree", () => {
  test("Modal inside a dark graphite scope has a graphite/dark ancestor", () => {
    render(
      <ThemeScope theme="graphite" mode="dark" density="compact" motion="responsive">
        <Modal.Root open onOpenChange={() => {}}>
          <Modal.Content>
            <Modal.Title>Escopo</Modal.Title>
          </Modal.Content>
        </Modal.Root>
      </ThemeScope>,
    );
    const title = screen.getByText("Escopo");
    const scope = title.closest('[data-theme="graphite"][data-ui-mode="dark"]');
    expect(scope).not.toBeNull();
    expect(scope).toHaveStyle({ display: "contents" });
    expect(scope!.getAttribute("data-density")).toBe("compact");
    expect(scope!.getAttribute("data-motion")).toBe("responsive");
    // portado: fora do div do ThemeScope
    expect(scope!.parentElement).toBe(document.body);
  });

  test("density and forced mode are inherited from an outer scope", () => {
    render(
      <ThemeScope theme="ember" mode="dark" density="spacious">
        <ThemeScope theme="graphite">
          <Drawer.Root open onOpenChange={() => {}}>
            <Drawer.Content>
              <Drawer.Title>Gaveta</Drawer.Title>
            </Drawer.Content>
          </Drawer.Root>
        </ThemeScope>
      </ThemeScope>,
    );
    const scope = screen.getByText("Gaveta").closest("[data-theme]");
    expect(scope!.getAttribute("data-theme")).toBe("graphite");
    expect(scope!.getAttribute("data-ui-mode")).toBe("dark");
    expect(scope!.getAttribute("data-density")).toBe("spacious");
  });

  test("no data-ui-mode when no mode is forced", () => {
    render(
      <ThemeScope theme="graphite">
        <Modal.Root open onOpenChange={() => {}}>
          <Modal.Content>
            <Modal.Title>Livre</Modal.Title>
          </Modal.Content>
        </Modal.Root>
      </ThemeScope>,
    );
    const scope = screen.getByText("Livre").closest('[data-theme="graphite"]');
    expect(scope).not.toBeNull();
    expect(scope!.hasAttribute("data-ui-mode")).toBe(false);
    expect(scope!.hasAttribute("data-density")).toBe(false);
  });

  test("floating overlays (Popover, Tooltip) carry the scope and MotionScope level", () => {
    render(
      <ThemeScope theme="ember" mode="dark">
        <MotionScope level="calm">
          <Popover.Root open>
            <Popover.Trigger>
              <button type="button">abrir</button>
            </Popover.Trigger>
            <Popover.Content>Pop</Popover.Content>
          </Popover.Root>
          <Tooltip.Root open>
            <Tooltip.Trigger>
              <button type="button">dica</button>
            </Tooltip.Trigger>
            <Tooltip.Content>Dica</Tooltip.Content>
          </Tooltip.Root>
        </MotionScope>
      </ThemeScope>,
    );
    for (const text of ["Pop", "Dica"]) {
      const scope = screen.getByText(text).closest('[data-theme="ember"][data-ui-mode="dark"]');
      expect(scope).not.toBeNull();
      expect(scope!.getAttribute("data-motion")).toBe("calm");
    }
  });
});
