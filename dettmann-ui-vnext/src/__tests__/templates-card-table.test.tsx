import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Home } from "lucide-react";
import { Card } from "../components/card";
import { Table } from "../components/table";
import { ConfirmDialog, ConfirmProvider, useConfirm } from "../templates/confirm-dialog";
import { Sidebar } from "../templates/sidebar";
import { FileDropzone } from "../templates/file-dropzone";

describe("Card", () => {
  it("renders header, body and footer slots", () => {
    render(
      <Card.Root>
        <Card.Header>
          <Card.Title>Members</Card.Title>
          <Card.Description>People in the workspace.</Card.Description>
        </Card.Header>
        <Card.Body>Body copy</Card.Body>
        <Card.Footer>Footer actions</Card.Footer>
      </Card.Root>
    );
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("People in the workspace.")).toBeInTheDocument();
    expect(screen.getByText("Body copy")).toBeInTheDocument();
    expect(screen.getByText("Footer actions")).toBeInTheDocument();
  });
});

describe("Table", () => {
  it("marks a selected row", () => {
    render(
      <Table.Root>
        <Table.Body>
          <Table.Row selected>
            <Table.Cell>Ada</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    );
    const row = screen.getByText("Ada").closest("tr");
    expect(row).toHaveClass("bg-secondary-subtle");
  });
});

describe("ConfirmDialog", () => {
  it("calls onConfirm without an event", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete?"
        onConfirm={onConfirm}
      />
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("useConfirm", () => {
  function Probe() {
    const confirm = useConfirm();
    return (
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({ title: "Continue?" });
          document.body.setAttribute("data-confirm", String(ok));
        }}
      >
        Ask
      </button>
    );
  }

  it("resolves true on confirm and false on cancel", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Probe />
      </ConfirmProvider>
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(document.body.getAttribute("data-confirm")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.body.getAttribute("data-confirm")).toBe("false");
  });
});

describe("Sidebar", () => {
  it("renders items from JSON including groups", () => {
    render(
      <Sidebar.Root
        items={[
          { id: "home", label: "Home", icon: Home, href: "#home" },
          {
            id: "team",
            label: "Team",
            children: [{ id: "members", label: "Members", href: "#members" }],
          },
        ]}
      />
    );
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
  });

  it("marks currentId with aria-current", () => {
    render(
      <Sidebar.Root
        currentId="home"
        items={[{ id: "home", label: "Home", icon: Home, href: "#home" }]}
      />
    );
    const links = screen.getAllByRole("link", { name: "Home" });
    const current = links.find((link) => link.getAttribute("aria-current") === "page");
    expect(current).toBeTruthy();
    expect(current).toHaveClass("bg-primary-subtle");
  });

  it("uses the solid secondary surface by default", () => {
    const { container } = render(
      <Sidebar.Root items={[{ id: "home", label: "Home", href: "#home" }]} />
    );
    expect(container.querySelector("aside")).toHaveClass("bg-secondary", "text-on-secondary");
  });

  it("keeps a disabled item out of navigation and shows its badge", () => {
    render(
      <Sidebar.Root
        items={[
          {
            id: "downloads",
            label: "Downloads",
            href: "#/downloads",
            disabled: true,
            badge: <span>em breve</span>,
          },
        ]}
      />
    );
    const items = screen.getAllByRole("button", { name: /Downloads/ });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).toBeDisabled();
    }
    expect(screen.queryByRole("link", { name: /Downloads/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("em breve").length).toBeGreaterThan(0);
  });

  it("names a collapsed disabled item from its label", () => {
    render(
      <Sidebar.Root
        collapsed
        items={[
          {
            id: "downloads",
            label: "Downloads",
            disabled: true,
            badge: <span>em breve</span>,
          },
        ]}
      />
    );
    const named = screen.getAllByRole("button", { name: "Downloads" });
    expect(named.some((item) => item.getAttribute("aria-label") === "Downloads")).toBe(true);
  });

  it("uses the soft secondary surface when emphasis is subtle", () => {
    const { container } = render(
      <Sidebar.Root
        emphasis="subtle"
        items={[{ id: "home", label: "Home", href: "#home" }]}
      />
    );
    expect(container.querySelector("aside")).toHaveClass(
      "bg-secondary-subtle",
      "text-fg"
    );
  });
});

describe("FileDropzone", () => {
  it("rejects a file above maxSize before onFilesChange", async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <FileDropzone maxSize={10} onFilesChange={onFilesChange} />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(50)], "too-big.bin", {
      type: "application/octet-stream",
    });
    await user.upload(input, file);
    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("too-big.bin");
  });
});
