import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DiffViewer } from "../components/diff-viewer";
import { Lightbox } from "../components/lightbox";
import { MediaImage } from "../components/media-image";

// Revisão das ondas 2 a 4 (2026-10-20): componentes que estavam sem teste e
// os nomes do Lightbox, que agora se localizam por prop.
describe("MediaImage", () => {
  it("shows the image, then the fallback with the same name when it fails to load", () => {
    const onLoadError = vi.fn();
    render(<MediaImage src="missing.png" alt="Capa" onLoadError={onLoadError} fallback={<span>sem imagem</span>} />);
    fireEvent.error(screen.getByRole("img", { name: "Capa" }));
    expect(onLoadError).toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Capa" })).toHaveTextContent("sem imagem");
  });
});

describe("DiffViewer", () => {
  it("shows the empty message when there is no line", () => {
    render(<DiffViewer lines={[]} empty="Nada mudou" />);
    expect(screen.getByText("Nada mudou")).toBeInTheDocument();
  });

  it("shows both sides with their titles and line numbers", () => {
    render(
      <DiffViewer
        leftTitle="Antes"
        rightTitle="Depois"
        lines={[{ id: "1", kind: "changed", left: { lineNumber: 3, text: "velho" }, right: { lineNumber: 3, text: "novo" } }]}
      />,
    );
    expect(screen.getByText("Antes")).toBeInTheDocument();
    expect(screen.getByText("Depois")).toBeInTheDocument();
    expect(screen.getByText("velho")).toBeInTheDocument();
    expect(screen.getByText("novo")).toBeInTheDocument();
  });
});

describe("Lightbox", () => {
  it("uses the localized names and moves with the arrows", () => {
    const onIndexChange = vi.fn();
    render(
      <Lightbox
        open
        index={0}
        onIndexChange={onIndexChange}
        onClose={() => undefined}
        items={[
          { id: "a", src: "a.png", alt: "A" },
          { id: "b", src: "b.png", alt: "B" },
        ]}
        labels={{ dialog: "Prévia", close: "Fechar", previous: "Anterior", next: "Próxima" }}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Prévia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument();
  });
});
