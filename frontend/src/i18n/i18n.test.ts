import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CATALOGS, LANGUAGES, createTranslator } from "./i18n";
import { en } from "./catalog/en";
import { errorMessage, toUIError } from "../bridge/errors";

const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.includes(`${join("src", "test")}`) ? [path] : [];
  });
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n catalogs (D044)", () => {
  const keys = Object.keys(en);

  it.each(LANGUAGES)("%s has exactly the English keys, non-empty, with the same placeholders", (language) => {
    const catalog = CATALOGS[language] as Record<string, string>;
    expect(Object.keys(catalog).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(catalog[key], `${language}:${key}`).toBeTruthy();
      expect(placeholders(catalog[key]!), `${language}:${key}`).toEqual(placeholders(en[key as keyof typeof en]));
    }
  });

  it("declares plural messages in pairs", () => {
    for (const key of keys.filter((k) => k.endsWith(".one"))) {
      expect(keys).toContain(key.replace(/\.one$/, ".other"));
    }
  });

  it("interpolates, pluralizes and formats per language", () => {
    const en = createTranslator("en");
    const pt = createTranslator("pt-BR");
    expect(en.t("palette.goTo", { page: "Games" })).toBe("Go to Games");
    expect(en.tp("log.shown", 1)).toBe("1 entry shown");
    expect(en.tp("log.shown", 1200)).toBe("1,200 entries shown");
    expect(pt.tp("log.shown", 1200)).toBe("1.200 entradas exibidas");
    expect(pt.has("operation.kind.nope")).toBe(false);
  });

  it("translates coded errors and falls back to the code (INV-OPS-05)", () => {
    const pt = createTranslator("pt-BR");
    const coded = toUIError(new Error(JSON.stringify({ code: "setting_unknown", params: { key: "x.y" } })));
    expect(errorMessage(pt, coded)).toBe("A configuração x.y não está disponível.");
    expect(errorMessage(pt, toUIError(new Error("boom")))).toBe("Algo deu errado dentro do aplicativo.");
    expect(toUIError("plain").detail).toBe("plain");
    expect(errorMessage(pt, { code: "brand_new", params: {} })).toBe("Erro inesperado (brand_new).");
  });

  it("every error code the bridge can send has a message", () => {
    const internal = join(SRC, "..", "..", "internal");
    const bridgeErrors = [
      join(internal, "bridge", "errors.go"),
      join(internal, "core", "application", "games", "errors.go"),
      join(internal, "core", "application", "library", "errors.go"),
      join(internal, "core", "application", "instancelock", "instancelock.go"),
      join(internal, "core", "application", "profiles", "errors.go"),
      join(internal, "core", "application", "conflicts", "commands.go"),
      join(internal, "bridge", "conflicts.go"),
      join(internal, "core", "application", "diagnostics", "actions.go"),
      join(internal, "core", "application", "history", "service.go"),
      join(internal, "core", "application", "plugins", "service.go"),
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const codes = [...bridgeErrors.matchAll(/Code\w+\s*=\s*"(\w+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(keys, code).toContain(`error.${code}`);
  });
});

describe("source hygiene", () => {
  const files = sourceFiles().filter((f) => !f.includes(join("i18n", "catalog")));

  it("has no raw colors in the app (theme-first, ui/04 §6)", () => {
    const offenders = files.filter((file) => {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      return /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(bg|text|border)-(black|white)\b/.test(code);
    });
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it("has no user-facing text outside the catalog (anti-pattern 36)", () => {
    const offenders: string[] = [];
    for (const file of files.filter((f) => f.endsWith(".tsx"))) {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, "");
      // JSX text between tags containing a letter.
      // (?<!=) skips TypeScript arrows such as "=> Promise<T>".
      for (const m of code.matchAll(/(?<![=-])>\s*([^<>{}\n]*[A-Za-zÀ-ÿ][^<>{}\n]*?)\s*</g)) {
        const text = m[1]!.trim();
        if (text && !/^[\w.]+\)?\s*(=>|&&|\?)/.test(text) && !/[=;()]/.test(text)) offenders.push(`${relative(SRC, file)}: ${text}`);
      }
      // Literal accessible names, titles and placeholders (catalog keys handed
      // to a component that translates them are fine).
      for (const m of code.matchAll(/\b(aria-label|title|description|placeholder|label|alt)="([^"]*[A-Za-z][^"]*)"/g)) {
        if (!(m[2]! in en)) offenders.push(`${relative(SRC, file)}: ${m[1]}="${m[2]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
