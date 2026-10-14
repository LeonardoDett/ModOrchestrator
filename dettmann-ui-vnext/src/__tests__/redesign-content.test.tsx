import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tag } from "../components/tag";
import { FilterChip } from "../components/filter-chip";
import { Progress } from "../components/progress";
import { StatTile } from "../components/stat-tile";
import { SwatchPicker } from "../components/swatch-picker";
import { SettingRow } from "../components/setting-row";
import { Checkbox } from "../components/checkbox";
import { Section } from "../components/section";
import { List } from "../components/list";
import { Switch } from "../components/switch";
import { PackageIcon } from "../icons";

describe("Tag com cor da paleta", () => {
  test("color paints through data-category on the colored classes; icon is decorative", () => {
    render(
      <Tag color="violet" icon={PackageIcon}>
        Gráficos
      </Tag>,
    );
    const tag = screen.getByText("Gráficos");
    expect(tag).toHaveAttribute("data-category", "violet");
    expect(tag.className).toContain("bg-intent-subtle");
    expect(tag.querySelector("svg")).not.toBeNull();
  });

  test("without color the tag keeps its intent and no category", () => {
    render(<Tag intent="warning">Órfão</Tag>);
    const tag = screen.getByText("Órfão");
    expect(tag).toHaveAttribute("data-intent", "warning");
    expect(tag).not.toHaveAttribute("data-category");
  });
});

describe("FilterChip", () => {
  test("standalone chip toggles aria-pressed and shows count and color dot", () => {
    const onPressedChange = vi.fn();
    render(
      <FilterChip color="blue" count={3} onPressedChange={onPressedChange}>
        Texturas
      </FilterChip>,
    );
    const chip = screen.getByRole("button", { name: /Texturas/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip.querySelector('[data-category="blue"]')).not.toBeNull();
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveAttribute("data-intent", "brand");
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  test("single group keeps at most one; arrows move focus", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string[]>(["all"]);
      return (
        <FilterChip.Group type="single" aria-label="Nível de suporte" value={value} onValueChange={setValue}>
          <FilterChip value="all">Todos</FilterChip>
          <FilterChip value="full">Completo</FilterChip>
          <FilterChip value="custom" count={0}>
            Personalizado
          </FilterChip>
        </FilterChip.Group>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Nível de suporte" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Completo/ }));
    expect(screen.getByRole("button", { name: /Completo/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Todos/ })).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /Personalizado/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: /Personalizado/ }).className).toContain("text-fg-subtle");
  });
});

describe("Progress.Stacked", () => {
  test("one image with the whole breakdown; zero parts are not drawn; legend optional", () => {
    render(
      <Progress.Stacked
        label="Arquivos por tipo"
        legend
        segments={[
          { label: ".dds", value: 742 },
          { label: ".nif", value: 418, color: "teal" },
          { label: ".esp", value: 0 },
        ]}
      />,
    );
    const bar = screen.getByRole("img", { name: "Arquivos por tipo: .dds 742, .nif 418, .esp 0" });
    const parts = bar.querySelectorAll("[data-category]");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveAttribute("data-category", "blue");
    expect(parts[1]).toHaveAttribute("data-category", "teal");
    expect((parts[0] as HTMLElement).style.width).toBe(`${(742 / 1160) * 100}%`);
    expect(screen.getByText(".nif")).toBeInTheDocument();
  });
});

describe("StatTile", () => {
  test("static, link and button forms; loading hides the value", () => {
    const onClick = vi.fn();
    render(
      <StatTile.Grid columns={3}>
        <StatTile label="Mods" value="142" unit="de 380" />
        <StatTile label="Conflitos" value="38" href="#/conflitos" intent="warning" icon={PackageIcon} />
        <StatTile label="Em disco" value="48 GB" onClick={onClick} loading />
      </StatTile.Grid>,
    );
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("de 380")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Conflitos/ });
    expect(link).toHaveAttribute("href", "#/conflitos");
    expect(link).toHaveAttribute("data-intent", "warning");
    fireEvent.click(screen.getByRole("button", { name: /Em disco/ }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText("48 GB")).toBeNull();
  });
});

describe("SwatchPicker", () => {
  const options = Array.from({ length: 6 }, (_, i) => ({ value: `c${i}`, label: `Cor ${i}`, disabled: i === 4 }));

  test("radio grid: one tab stop, 2D arrows skip disabled, Home/End", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SwatchPicker
        aria-label="Cor"
        columns={3}
        options={options}
        defaultValue="c1"
        onValueChange={onValueChange}
        renderSwatch={(o) => <span data-category="blue">{o.value}</span>}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([screen.getByRole("radio", { name: "Cor 1" })]);
    screen.getByRole("radio", { name: "Cor 1" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Cor 5" })).toHaveFocus();
    expect(onValueChange).toHaveBeenLastCalledWith("c5");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Cor 3" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Cor 0" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Cor 5" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Cor 5" })).toHaveClass("border-2");
  });
});

describe("SettingRow", () => {
  test("label targets the control; description describes the group", () => {
    render(
      <SettingRow
        label="Ordem de carga"
        description="Ordena os plugins. Depende de Plugins."
        status="Bloqueado: precisa de Plugins"
        controlId="feat-lo"
        control={<Switch id="feat-lo" />}
      />,
    );
    expect(screen.getByRole("switch", { name: "Ordem de carga" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Ordem de carga" });
    expect(group).toHaveAccessibleDescription("Ordena os plugins. Depende de Plugins.");
    expect(screen.getByText("Bloqueado: precisa de Plugins")).toBeInTheDocument();
  });

  test("read-only row has no control", () => {
    render(<SettingRow label="Proteção contra mudanças externas" />);
    expect(screen.getByRole("group", { name: "Proteção contra mudanças externas" }).querySelector("button")).toBeNull();
  });
});

describe("Checkbox em cartão", () => {
  test("card is named by its label, toggles, and the action stays outside the control", () => {
    const onAction = vi.fn();
    render(
      <Checkbox
        variant="card"
        label="Regras entre mods"
        description="27 regras"
        defaultChecked
        action={
          <button type="button" onClick={onAction}>
            Escolher
          </button>
        }
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Regras entre mods" });
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(box.closest("[data-state]")!.parentElement).toHaveAttribute("data-state", "checked");
    fireEvent.click(screen.getByRole("button", { name: "Escolher" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(box).toHaveAttribute("aria-checked", "true");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(box).not.toContainElement(screen.getByRole("button", { name: "Escolher" }));
  });
});

describe("Section", () => {
  test("compact density, heading level and header actions", () => {
    render(
      <Section.Root density="compact">
        <Section.Header actions={<button type="button">Vale para Skyrim SE</button>}>
          <Section.Title>Automação</Section.Title>
        </Section.Header>
        <Section.Body>corpo</Section.Body>
      </Section.Root>,
    );
    const title = screen.getByRole("heading", { level: 2, name: "Automação" });
    expect(title).toHaveClass("text-sm");
    expect(title.closest("section")).toHaveClass("py-4");
    expect(screen.getByRole("button", { name: "Vale para Skyrim SE" })).toBeInTheDocument();
  });
});

describe("List do redesign", () => {
  test("static list: list roles, no tab stop, slots and actions", () => {
    render(
      <List.Root
        selectionMode="none"
        items={[{ id: "a", text: "Implantação concluída", when: "há 2 horas" }]}
        renderItem={(item) => (
          <List.Item
            title={item.text}
            description="Skyrim SE"
            meta={item.when}
            unread
            actions={<button type="button">Abrir</button>}
          />
        )}
      />,
    );
    const list = screen.getByRole("list");
    expect(list).not.toHaveAttribute("tabindex");
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Implantação concluída");
    expect(item).toHaveTextContent("há 2 horas");
    expect(item.querySelector('[data-slot="unread"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Abrir" })).toBeInTheDocument();
  });

  test("selectable list uses the shared row recipe and never renders row actions", async () => {
    const user = userEvent.setup();
    render(
      <List.Root
        items={[
          { id: "a", name: "Alfa" },
          { id: "b", name: "Beta" },
        ]}
        renderItem={(item) => <List.Item title={item.name} actions={<button type="button">x</button>} />}
      />,
    );
    await user.click(screen.getByRole("option", { name: "Beta" }));
    const beta = screen.getByRole("option", { name: "Beta" });
    expect(beta).toHaveAttribute("aria-selected", "true");
    expect(beta.className).toContain("bg-selected");
    expect(screen.queryByRole("button", { name: "x" })).toBeNull();
    expect(screen.getByRole("listbox").className).toContain("focus-ring-inset");
  });

  test("group collapses and expands its rows", () => {
    render(
      <List.Group title="Ignorados" count={4} collapsible defaultOpen={false}>
        <p>conteúdo</p>
      </List.Group>,
    );
    const toggle = screen.getByRole("button", { name: /Ignorados/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("conteúdo")).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("conteúdo")).toBeVisible();
  });
});
