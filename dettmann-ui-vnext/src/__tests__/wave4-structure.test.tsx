import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../components/card";
import { Toolbar } from "../components/toolbar";
import { ActionBar } from "../components/action-bar";
import { FeaturedIcon } from "../components/featured-icon";
import { Sidebar } from "../templates/sidebar";
import { InfoIcon } from "../icons/glyphs/info";

const tokens = (el: Element) => el.className.split(/\s+/);
const backgrounds = (el: Element) => tokens(el).filter((c) => /^bg-/.test(c));
const borders = (el: Element) => tokens(el).filter((c) => /^border-(?![trblxy]$)(?![trblxy]-)/.test(c));

describe("Card (D-033)", () => {
  it("low is a flat bordered surface outside the structural layer", () => {
    render(<Card.Root data-testid="card">Body</Card.Root>);
    const card = screen.getByTestId("card");
    expect(backgrounds(card)).toEqual(["bg-surface"]);
    expect(borders(card)).toEqual(["border-border"]);
    expect(card.className).not.toMatch(/shadow-/);
    expect(card).not.toHaveAttribute("data-layer");
    expect(card).toHaveClass("rounded-card");
  });

  it("medium is a structural layer", () => {
    render(
      <Card.Root data-testid="card" emphasis="medium">
        Body
      </Card.Root>,
    );
    const card = screen.getByTestId("card");
    expect(backgrounds(card)).toEqual(["bg-structure"]);
    expect(card).toHaveAttribute("data-layer", "medium");
  });

  it("selected and interactive together keep one background and one border", () => {
    render(
      <Card.Root data-testid="card" emphasis="medium" interactive selected>
        Body
      </Card.Root>,
    );
    const card = screen.getByTestId("card");
    expect(backgrounds(card)).toEqual(["bg-selected"]);
    expect(borders(card)).toEqual(["border-border-strong"]);
    expect(card).toHaveClass("cursor-pointer", "hover:state-layer-hover", "focus-ring");
  });

  it("no longer accepts variant", () => {
    // @ts-expect-error `variant` deu lugar a `emphasis` e `interactive` (D-037)
    const props: Parameters<typeof Card.Root>[0] = { variant: "raised" };
    expect(props).toBeTruthy();
  });

  it("slots use the dense paddings", () => {
    render(
      <Card.Root>
        <Card.Header data-testid="header">
          <Card.Title>Title</Card.Title>
        </Card.Header>
        <Card.Body data-testid="body">Body</Card.Body>
        <Card.Footer data-testid="footer">Footer</Card.Footer>
      </Card.Root>,
    );
    expect(screen.getByTestId("header")).toHaveClass("px-4", "pt-4");
    expect(screen.getByTestId("body")).toHaveClass("px-4", "py-3");
    expect(screen.getByTestId("footer")).toHaveClass("px-4", "py-3", "border-t");
  });
});

describe("structural bars (D-033)", () => {
  it("Toolbar and ActionBar are medium structure", () => {
    render(
      <>
        <Toolbar data-testid="toolbar" start={<span>start</span>} />
        <ActionBar data-testid="actions">actions</ActionBar>
      </>,
    );
    for (const id of ["toolbar", "actions"]) {
      const bar = screen.getByTestId(id);
      expect(bar).toHaveAttribute("data-layer", "medium");
      expect(backgrounds(bar)).toEqual(["bg-structure"]);
    }
    expect(screen.getByTestId("actions")).toHaveAttribute("data-budget-region", "action-bar");
  });

  it("FeaturedIcon uses the pill primitive", () => {
    const { container } = render(<FeaturedIcon icon={InfoIcon} />);
    expect(container.innerHTML).toContain("rounded-pill");
    expect(container.innerHTML).not.toContain("rounded-full");
  });
});

describe("Sidebar (D-033)", () => {
  const sections = [
    {
      id: "main",
      items: [
        { id: "home", label: "Home" },
        { id: "mods", label: "Mods" },
        { id: "off", label: "Off", disabled: true },
      ],
    },
  ];

  it("is a structural surface", () => {
    const { container } = render(<Sidebar.Root sections={sections} currentId="mods" />);
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-layer", "medium");
    expect(backgrounds(aside)).toEqual(["bg-structure"]);
  });

  it("the current item is tinted with the brand bar; idle items only have the hover layer", () => {
    const { container } = render(<Sidebar.Root sections={sections} currentId="mods" />);
    const aside = container.querySelector("aside")!;
    const current = aside.querySelector('[aria-current="page"]')!;
    expect(backgrounds(current)).toEqual(["bg-selected"]);
    expect(current.className).toMatch(/before:bg-brand-fill/);
    expect(current.className).not.toMatch(/emphasis-/);
    expect(current).toHaveClass("focus-ring-inset");
    const idle = [...aside.querySelectorAll("button")].find((b) => b.textContent === "Home")!;
    expect(backgrounds(idle)).toEqual([]);
    expect(idle).toHaveClass("hover:bg-state-hover");
  });

  it("a collapsed sidebar still marks the current item with the bar", () => {
    const { container } = render(<Sidebar.Root sections={sections} currentId="mods" collapsed />);
    const current = container.querySelector('aside [aria-current="page"]')!;
    expect(current.className).toMatch(/before:bg-brand-fill/);
  });
});
