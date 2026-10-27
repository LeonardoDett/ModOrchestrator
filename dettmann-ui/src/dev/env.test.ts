// @vitest-environment node
import { transformSync } from "esbuild";
import { afterEach, describe, expect, test, vi } from "vitest";
import { isDev } from "./env";

// Sem @types/node no projeto: especificador não literal, tipado localmente.
const NODE_FS: string = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(path: URL, encoding: "utf8"): string };

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Compila `env.ts` como um bundler faria (`define` de `process.env.NODE_ENV`) e roda sem `process`. */
function bundledIsDev(define?: string): boolean {
  const source = fs.readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  const { code } = transformSync(source, {
    loader: "ts",
    format: "cjs",
    define: define === undefined ? {} : { "process.env.NODE_ENV": JSON.stringify(define) },
  });
  const module = { exports: {} as { isDev?: () => boolean } };
  // `process` sombreado por um parâmetro ausente: navegador puro, sem o global.
  new Function("module", "exports", "process", code)(module, module.exports, undefined);
  return module.exports.isDev!();
}

describe("isDev", () => {
  test("true under vitest (NODE_ENV=test)", () => {
    expect(isDev()).toBe(true);
  });

  test("false when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDev()).toBe(false);
  });

  test("bundled for development without a global process → true", () => {
    expect(bundledIsDev("development")).toBe(true);
  });

  test("bundled for production → false", () => {
    expect(bundledIsDev("production")).toBe(false);
  });

  test("no bundler replacement and no process → false (production, safe)", () => {
    expect(bundledIsDev()).toBe(false);
  });
});
