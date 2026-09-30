import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../templates/sidebar";
import { Command } from "../components/command";
import { LogViewer } from "../components/log-viewer";

describe("Sidebar sections", () => {
  const sections = [
    { id: "top", items: [{ id: "home", label: "Home" }] },
    { id: "work", label: "Project", items: [{ id: "files", label: "Files" }] },
    { id: "bottom", placement: "end" as const, items: [{ id: "settings", label: "Settings" }] },
  ];

  it("renders titled groups, pins end sections and marks the current item", () => {
    render(<Sidebar.Root sections={sections} currentId="files" labels={{ navigation: "Main menu" }} />);
    const nav = screen.getAllByRole("navigation", { name: "Main menu" })[0]!;
    const project = within(nav).getByRole("group", { name: "Project" });
    expect(within(project).getByText("Project")).toBeInTheDocument();
    expect(within(project).getByRole("button", { name: "Files" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Settings" }).closest(".mt-auto")).not.toBeNull();
  });

  it("hides section headings when collapsed and localizes the toggle", async () => {
    const user = userEvent.setup();
    render(
      <Sidebar.Root
        sections={sections}
        labels={{ collapseSidebar: "Recolher", expandSidebar: "Expandir" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Recolher" }));
    expect(screen.getByRole("button", { name: "Expandir" })).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation")[0]!;
    expect(within(nav).queryByText("Project")).not.toBeInTheDocument();
  });

  it("still accepts a flat item list", () => {
    render(<Sidebar.Root items={[{ id: "a", label: "Alpha" }]} />);
    expect(screen.getAllByRole("navigation", { name: "Sidebar" })[0]).toBeInTheDocument();
  });
});

describe("Command", () => {
  const items = [
    { id: "a", label: "Open settings", value: "settings", keywords: ["preferences"] },
    { id: "b", label: "Go to dashboard", value: "dashboard" },
    { id: "c", label: "Disabled thing", value: "x", disabled: true },
  ];

  it("filters by label and keywords as the user types", async () => {
    const user = userEvent.setup();
    render(<Command items={items} placeholder="Type a command" emptyMessage="Nothing found" />);
    const field = screen.getByRole("textbox", { name: "Type a command" });
    await user.type(field, "prefer");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Open settings"]);
    await user.clear(field);
    await user.type(field, "zzz");
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });

  it("selects the active item with the keyboard and skips disabled ones", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Command items={items} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith(items[1]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });
});

describe("LogViewer", () => {
  const entries = [
    { id: "1", level: "info" as const, message: "Started" },
    { id: "2", level: "error" as const, message: "Disk full" },
  ];

  it("localizes level labels and search, and filters by text and level", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LogViewer
        entries={entries}
        searchLabel="Buscar no log"
        levelLabels={{ info: "Informação", error: "Erro" }}
        toolbar={<button type="button">Open folder</button>}
      />,
    );
    expect(screen.getByText("Informação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Buscar no log" }), "disk");
    expect(screen.queryByText("Started")).not.toBeInTheDocument();
    expect(screen.getByText("Disk full")).toBeInTheDocument();

    rerender(<LogViewer entries={entries} query="" levels={["info"]} showSearch={false} empty="Empty" />);
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.queryByText("Disk full")).not.toBeInTheDocument();
  });
});
