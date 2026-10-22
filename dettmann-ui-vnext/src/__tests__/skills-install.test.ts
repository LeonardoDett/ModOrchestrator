// @vitest-environment node
import { afterEach, describe, expect, test } from "vitest";

// Sem @types/node no projeto: especificadores não literais, tipados localmente.
type RunResult = { status: number | null; stderr: string };
interface NodeApi {
  cp: {
    execFileSync(cmd: string, args: string[], opts: { cwd: string; stdio: "pipe" }): unknown;
    spawnSync(cmd: string, args: string[], opts: { cwd: string; encoding: "utf8" }): RunResult;
  };
  fs: {
    mkdtempSync(prefix: string): string;
    mkdirSync(dir: string, opts: { recursive: true }): void;
    writeFileSync(file: string, data: string): void;
    readFileSync(file: string, encoding: "utf8"): string;
    readdirSync(dir: string): string[];
    statSync(file: string): { isDirectory(): boolean };
    existsSync(file: string): boolean;
    rmSync(dir: string, opts: { recursive: true; force: true }): void;
  };
  os: { tmpdir(): string };
  path: { join(...parts: string[]): string; resolve(...parts: string[]): string; dirname(p: string): string };
  url: { fileURLToPath(url: string): string };
}
const load = async <T,>(name: string) => (await import(/* @vite-ignore */ name)) as T;
const [cp, fs, os, path, url] = await Promise.all([
  load<NodeApi["cp"]>("node:child_process"),
  load<NodeApi["fs"]>("node:fs"),
  load<NodeApi["os"]>("node:os"),
  load<NodeApi["path"]>("node:path"),
  load<NodeApi["url"]>("node:url"),
]);
const { execFileSync, spawnSync } = cp;
const { fileURLToPath } = url;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/skills/install.mjs");
const SKILLS = path.join(ROOT, "skills");

const temps: string[] = [];
function tempTarget(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  temps.push(dir);
  return dir;
}
const read = (file: string) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("skills:install", () => {
  test("installs skills into .claude only by default and removes legacy folder only", () => {
    const dir = tempTarget();
    fs.mkdirSync(path.join(dir, ".cursor/skills/dettmann-ui"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".claude/skills/other"), { recursive: true });
    execFileSync("node", [SCRIPT, dir], { cwd: ROOT, stdio: "pipe" });
    expect(fs.existsSync(path.join(dir, ".claude/skills/dettmann-ui-use/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".cursor/skills/dettmann-ui-use"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".cursor/skills/dettmann-ui"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".claude/skills/other"))).toBe(true);
  });

  test("--cursor also installs into .cursor and keeps other skills there", () => {
    const dir = tempTarget();
    fs.mkdirSync(path.join(dir, ".cursor/skills/other"), { recursive: true });
    execFileSync("node", [SCRIPT, dir, "--cursor"], { cwd: ROOT, stdio: "pipe" });
    expect(fs.existsSync(path.join(dir, ".claude/skills/dettmann-ui-use/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".cursor/skills/dettmann-ui-use/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".cursor/skills/other"))).toBe(true);
  });

  test("copies every skill folder with identical content", () => {
    const dir = tempTarget();
    execFileSync("node", [SCRIPT, dir, "--cursor"], { cwd: ROOT, stdio: "pipe" });
    const names = fs.readdirSync(SKILLS).filter((n) => fs.statSync(path.join(SKILLS, n)).isDirectory());
    expect(names).toContain("dettmann-ui-use");
    for (const name of names) {
      for (const host of [".claude", ".cursor"]) {
        expect(read(path.join(dir, host, "skills", name, "SKILL.md"))).toBe(read(path.join(SKILLS, name, "SKILL.md")));
      }
    }
  });

  test("overwrites a previous install, dropping stale files", () => {
    const dir = tempTarget();
    const stale = path.join(dir, ".claude/skills/dettmann-ui-use/old.md");
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, "old");
    fs.writeFileSync(path.join(dir, ".claude/skills/dettmann-ui-use/SKILL.md"), "old");
    execFileSync("node", [SCRIPT, dir], { cwd: ROOT, stdio: "pipe" });
    expect(fs.existsSync(stale)).toBe(false);
    expect(read(path.join(dir, ".claude/skills/dettmann-ui-use/SKILL.md"))).toBe(
      read(path.join(SKILLS, "dettmann-ui-use/SKILL.md")),
    );
  });

  test("fails clearly for a missing target", () => {
    const missing = path.join(os.tmpdir(), "no-such-dir-" + Date.now());
    expect(() => execFileSync("node", [SCRIPT, missing], { cwd: ROOT, stdio: "pipe" })).toThrow();
    const run = spawnSync("node", [SCRIPT, missing], { cwd: ROOT, encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(missing);
    expect(fs.existsSync(missing)).toBe(false);
  });

  test("fails clearly without a target argument", () => {
    const run = spawnSync("node", [SCRIPT], { cwd: ROOT, encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/skills:install/);
  });
});
