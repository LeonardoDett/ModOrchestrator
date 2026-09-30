import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Home } from "lucide-react";
import { Section } from "../components/section";
import { ActionBar } from "../components/action-bar";
import { Radio } from "../components/radio";
import { Switch } from "../components/switch";
import { Avatar } from "../components/avatar";
import { Button } from "../components/button";
import { Sidebar } from "../templates/sidebar";
import { AppShell } from "../templates/app-shell";
import { FileDropzone } from "../templates/file-dropzone";
import { Navbar } from "../templates/navbar";

describe("Section", () => {
  it("renders title, description and body", () => {
    render(
      <Section.Root layout="split">
        <Section.Header>
          <Section.Title>Profile</Section.Title>
          <Section.Description>Public details.</Section.Description>
        </Section.Header>
        <Section.Body>Fields</Section.Body>
      </Section.Root>
    );
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Public details.")).toBeInTheDocument();
    expect(screen.getByText("Fields")).toBeInTheDocument();
  });
});

describe("ActionBar", () => {
  it("renders children", () => {
    render(
      <ActionBar sticky>
        <Button>Save</Button>
      </ActionBar>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("Radio card", () => {
  it("selects the card and exposes aria-checked", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Radio.Group name="plan" value="free" onValueChange={onValueChange}>
        <Radio.Item variant="card" value="free" label="Free" />
        <Radio.Item variant="card" value="pro" label="Pro">
          $20 / mo
        </Radio.Item>
      </Radio.Group>
    );
    expect(screen.getByRole("radio", { name: /Free/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /Pro/ }));
    expect(onValueChange).toHaveBeenCalledWith("pro");
  });
});

describe("Switch description", () => {
  it("associates helper text with aria-describedby", () => {
    render(
      <Switch label="Comments" description="Notify when someone comments." />
    );
    const control = screen.getByRole("switch");
    const describedBy = control.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Notify when someone comments."
    );
  });
});

describe("Avatar.Group", () => {
  it("shows overflow count", () => {
    render(
      <Avatar.Group max={2}>
        <Avatar fallback="A" />
        <Avatar fallback="B" />
        <Avatar fallback="C" />
      </Avatar.Group>
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});

describe("Sidebar currentId", () => {
  it("marks the current item with aria-current", () => {
    render(
      <Sidebar.Root
        currentId="home"
        items={[{ id: "home", label: "Home", icon: Home, href: "#home" }]}
      />
    );
    const links = screen.getAllByRole("link", { name: "Home" });
    const current = links.find((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveClass("bg-primary-subtle");
  });
});

describe("AppShell", () => {
  it("renders sidebar, navbar and main", () => {
    render(
      <AppShell.Root
        sidebar={<div>Nav column</div>}
        navbar={<Navbar.Root brand="Brand" />}
      >
        Main copy
      </AppShell.Root>
    );
    expect(screen.getByText("Nav column")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Main copy")).toBeInTheDocument();
  });
});

describe("FileDropzone compact", () => {
  it("renders compact title", () => {
    render(<FileDropzone size="compact" title="Upload photo" />);
    expect(screen.getByText("Upload photo")).toBeInTheDocument();
  });
});
