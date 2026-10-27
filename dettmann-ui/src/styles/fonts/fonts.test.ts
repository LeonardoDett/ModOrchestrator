import { expect, test } from "vitest";

// Sem @types/node no projeto: especificador não literal, tipado localmente.
const NODE_FS: string = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
  readFileSync(path: URL, encoding: "utf8"): string;
  existsSync(path: URL): boolean;
};

// `rel` não literal: o Vite não reescreve `new URL(literal, import.meta.url)` como asset.
const at = (rel: string) => new URL(rel, import.meta.url);
const css = fs.readFileSync(at("./fonts.css"), "utf8").replace(/\r\n/g, "\n");

test("every url() in fonts.css points to an existing file", () => {
  const urls = [...css.matchAll(/url\("\.\/([^"]+)"\)/g)].map((m) => m[1]!);
  expect(urls.length).toBe(4);
  for (const u of urls) expect(fs.existsSync(at(`./${u}`))).toBe(true);
});

test("font-display is swap and families match theme defaults", () => {
  expect(css).toMatch(/font-family: "Plus Jakarta Sans"/);
  expect(css).toMatch(/font-family: "JetBrains Mono"/);
  expect(css).not.toMatch(/font-display: (?!swap)/);
});

test("license files ship next to the fonts", () => {
  for (const f of ["OFL-PlusJakartaSans.txt", "OFL-JetBrainsMono.txt"]) expect(fs.existsSync(at(`./${f}`))).toBe(true);
});
