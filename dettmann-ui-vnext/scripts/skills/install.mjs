#!/usr/bin/env node
// Instala as skills da lib (skills/<nome>/) num projeto consumidor, para Claude Code
// (.claude/skills) e, com --cursor, também para o Cursor (.cursor/skills).
// Uso: npm run skills:install -- <caminho-do-projeto> [--cursor]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = path.join(ROOT, "skills");
const args = process.argv.slice(2);
const HOSTS = args.includes("--cursor") ? [".claude", ".cursor"] : [".claude"];
/** Pastas de versões anteriores da lib, removidas na instalação (só elas). */
const LEGACY = [path.join(".cursor", "skills", "dettmann-ui")];

function fail(message) {
  console.error(`skills:install: ${message}`);
  process.exit(1);
}

const arg = args.find((a) => !a.startsWith("--"));
if (!arg) fail("informe o projeto de destino: npm run skills:install -- <caminho-do-projeto> [--cursor]");
const target = path.resolve(arg);
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) fail(`destino não existe ou não é pasta: ${target}`);

const skills = fs
  .readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(SOURCE, entry.name, "SKILL.md")))
  .map((entry) => entry.name);
if (skills.length === 0) fail(`nenhuma skill encontrada em ${SOURCE}`);

for (const legacy of LEGACY) {
  const dir = path.join(target, legacy);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removido legado ${legacy}`);
  }
}

for (const host of HOSTS) {
  for (const name of skills) {
    const dest = path.join(target, host, "skills", name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(path.join(SOURCE, name), dest, { recursive: true });
    console.log(`instalado ${path.join(host, "skills", name)}`);
  }
}
