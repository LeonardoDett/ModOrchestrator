import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../components/button";
import { Indicator } from "../components/indicator";
import { Avatar } from "../components/avatar";
import { Tooltip } from "../components/tooltip";
import { Alert } from "../components/alert";
import { Sidebar } from "../templates/sidebar";
import { AppShell } from "../templates/app-shell";
import { Navbar } from "../templates/navbar";
import { Workspace } from "../templates/workspace";
import { PackageIcon } from "../icons";

const Glyph = (props: { className?: string }) => <svg data-testid="glyph" {...props} />;

describe("Button: selo, progresso e dica", () => {
  test("badge is decorative; the accessible name carries the count", () => {
    render(
      <Button size="icon" aria-label="Fila de instalação, 3 itens" badge={3} badgeIntent="warning">
        <Glyph />
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Fila de instalação, 3 itens" });
    const badge = button.querySelector('[data-slot="badge"]')!;
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge).toHaveAttribute("data-intent", "warning");
    expect(badge).toHaveTextContent("3");
    expect(button).toHaveClass("relative");
  });

  test("progress draws a decorative ring clamped to 0..100", () => {
    render(
      <Button size="icon" aria-label="Implantando, 64%" progress={140}>
        64%
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Implantando, 64%" });
    const ring = button.querySelector("svg")!;
    expect(ring).toHaveAttribute("role", "presentation");
    expect(ring).toHaveAttribute("aria-hidden", "true");
    expect(ring).toHaveAttribute("aria-valuenow", "100");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("tooltip opens on focus and keeps the forwarded ref", async () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} size="icon" aria-label="Notificações" tooltip="Notificações">
        <Glyph />
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Notificações" });
    expect(ref.current).toBe(button);
    await act(async () => {
      fireEvent.focus(button);
    });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Notificações");
  });

  test("icon-only button without a name warns in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <Button size="icon" tooltip="sem nome único">
        <Glyph />
      </Button>,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("aria-label"));
    warn.mockRestore();
  });
});

describe("Indicator chip", () => {
  test("shows value and label as visible text, no img role", () => {
    render(<Indicator variant="chip" icon={Glyph} value="142" label="de 380 ativos" />);
    const chip = screen.getByText("de 380 ativos").closest('[data-slot="indicator-chip"]')!;
    expect(chip).toHaveTextContent("142de 380 ativos");
    expect(screen.queryByRole("img")).toBeNull();
  });

  test("chromatic chip tints only the icon", () => {
    const { container } = render(<Indicator variant="chip" icon={Glyph} intent="warning" count={12} label="pares a decidir" />);
    expect(container.querySelector('[data-intent="warning"]')).toContainElement(screen.getByTestId("glyph"));
    expect(container.querySelector('[data-slot="indicator-chip"]')).not.toHaveAttribute("data-intent");
  });
});

describe("Avatar monograma", () => {
  test("square shape with a label is a named image; initials are hidden", () => {
    render(<Avatar shape="square" fallback="SSE" intent="brand" emphasis="high" label="Skyrim Special Edition" />);
    const avatar = screen.getByRole("img", { name: "Skyrim Special Edition" });
    const initials = screen.getByText("SSE");
    expect(initials).toHaveAttribute("aria-hidden", "true");
    expect(initials).toHaveAttribute("data-intent", "brand");
    expect(initials).toHaveClass("bg-intent-fill", "text-on-intent");
    expect(avatar.querySelector(".rounded-control")).not.toBeNull();
  });

  test("category color paints through data-category, low by default", () => {
    render(<Avatar shape="square" fallback="VX" color="blue" label="Vortex" />);
    const initials = screen.getByText("VX");
    expect(initials).toHaveAttribute("data-category", "blue");
    expect(initials).not.toHaveAttribute("data-intent");
    expect(initials).toHaveClass("bg-intent-subtle", "text-intent-text");
  });

  test("plain avatar keeps the round shape and neutral paint", () => {
    render(<Avatar fallback="JD" />);
    expect(screen.getByText("JD")).toHaveClass("bg-sunken", "text-fg-muted");
    expect(screen.getByText("JD").parentElement).toHaveClass("rounded-pill");
  });
});

describe("Tooltip", () => {
  test("trigger keeps a callback ref of its child", () => {
    const seen: (Element | null)[] = [];
    render(
      <Tooltip.Root>
        <Tooltip.Trigger>
          <button ref={(el) => { seen.push(el); }} type="button">
            alvo
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content>dica</Tooltip.Content>
      </Tooltip.Root>,
    );
    expect(seen).toContain(screen.getByRole("button", { name: "alvo" }));
  });
});

describe("Alert: ação, dispensar e compacto", () => {
  test("action and dismiss render after the text; dismiss is last and named", () => {
    const onDismiss = vi.fn();
    render(
      <Alert.Root compact variant="info" action={<Button size="sm">Abrir o passo a passo</Button>} onDismiss={onDismiss} dismissLabel="Dispensar a dica">
        <Alert.Description>Não sabe por onde começar?</Alert.Description>
      </Alert.Root>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("items-center");
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Abrir o passo a passo", "Dispensar a dica"]);
    fireEvent.click(screen.getByRole("button", { name: "Dispensar a dica" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("default alert stays top-aligned without extra slots", () => {
    render(
      <Alert.Root variant="warning">
        <Alert.Title>Atenção</Alert.Title>
      </Alert.Root>,
    );
    expect(screen.getByRole("alert")).toHaveClass("items-start");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

const sections = [
  { id: "entry", items: [{ id: "overview", label: "Visão geral", icon: PackageIcon }] },
  {
    id: "content",
    label: "Conteúdo",
    items: [
      { id: "mods", label: "Mods", icon: PackageIcon, count: 380 },
      { id: "conflicts", label: "Conflitos", icon: PackageIcon, count: 12, countLabel: "12 a decidir", attention: true },
    ],
  },
];

describe("Sidebar do redesign", () => {
  test("count pill and attention: warning intent, filled pill, name read with the count", () => {
    render(<Sidebar.Root sections={sections} heading="Menu" />);
    const conflicts = screen.getByRole("button", { name: /Conflitos, 12 a decidir/ });
    expect(conflicts).toHaveAttribute("data-intent", "warning");
    expect(conflicts.className).toContain("bg-intent-subtle");
    const pill = conflicts.querySelector('[aria-hidden="true"].rounded-pill')!;
    expect(pill).toHaveTextContent("12");
    expect(pill).toHaveClass("bg-intent-fill");
    const mods = screen.getByRole("button", { name: /Mods/ });
    expect(mods).not.toHaveAttribute("data-intent");
    expect(screen.getByText("Menu")).toBeInTheDocument();
  });

  test("collapsed: overlay count, name with count in aria-label, design widths", () => {
    const { container } = render(<Sidebar.Root sections={sections} defaultCollapsed />);
    const conflicts = screen.getByRole("button", { name: "Conflitos, 12 a decidir" });
    expect(conflicts.querySelector(".absolute")).toHaveTextContent("12");
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(aside.className).toContain("w-[var(--sidebar-width-collapsed,3.75rem)]");
  });

  test("footer function receives the collapsed state and follows the toggle", () => {
    render(
      <Sidebar.Root
        sections={sections}
        labels={{ collapseSidebar: "Recolher menu", expandSidebar: "Expandir menu" }}
        footer={({ collapsed }) => <span>{collapsed ? "anel" : "cartão"}</span>}
      />,
    );
    expect(screen.getByText("cartão")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recolher menu" }));
    expect(screen.getByText("anel")).toBeInTheDocument();
  });
});

describe("AppShell, Navbar e Workspace", () => {
  test("topbar layout puts the navbar above the sidebar and scrolls only the content", () => {
    const { container } = render(
      <AppShell.Root layout="topbar" navbar={<Navbar.Root size="compact">barra</Navbar.Root>} sidebar={<nav>menu</nav>}>
        conteúdo
      </AppShell.Root>,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("h-screen", "flex-col", "overflow-hidden");
    expect(root.firstElementChild!.tagName).toBe("HEADER");
    expect(screen.getByText("conteúdo")).toHaveClass("overflow-auto");
  });

  test("sidebar layout keeps the previous structure and no stray layer", () => {
    const { container } = render(<AppShell.Root sidebar={<nav>menu</nav>}>conteúdo</AppShell.Root>);
    expect(container.querySelector("[data-layer]")).toBeNull();
  });

  test("navbar is a structure layer with window controls flush right", () => {
    render(
      <Navbar.Root size="compact" actions={<button type="button">sino</button>} windowControls={<button type="button">fechar</button>}>
        jogo
      </Navbar.Root>,
    );
    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-layer", "medium");
    expect(header).toHaveClass("bg-structure", "h-12", "pr-0");
    expect(header.lastElementChild).toContainElement(screen.getByRole("button", { name: "fechar" }));
  });

  test("workspace declares the structure layer on its column", () => {
    const { container } = render(<Workspace sidebar={<nav>menu</nav>}>conteúdo</Workspace>);
    expect(container.querySelector("aside")).toHaveAttribute("data-layer", "medium");
    expect(container.firstElementChild).toHaveStyle({ gridTemplateColumns: "232px minmax(0,1fr)" });
  });
});
