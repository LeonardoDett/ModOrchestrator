import fs from "node:fs";
import path from "node:path";

const sourceDir = path.resolve(process.argv[2] ?? "src");
const forbiddenDependencies = ["tailwind-variants", "clsx"];
const rawProductColorPatterns = [
  /\bbg-(?:black|white)\b/,
  /\btext-(?:black|white)\b/,
  /\bborder-(?:black|white)\b/,
  /#[0-9a-fA-F]{3,8}\b/,
];

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(file));
    else if (/\.(ts|tsx)$/.test(entry.name)) result.push(file);
  }
  return result;
}

const offenders = [];
for (const file of walk(sourceDir)) {
  if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const dependency of forbiddenDependencies) {
    if (source.includes(`from "${dependency}"`) || source.includes(`from '${dependency}'`)) {
      offenders.push(`${file}: forbidden runtime dependency ${dependency}`);
    }
  }
  const runtimeSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  for (const pattern of rawProductColorPatterns) {
    if (pattern.test(runtimeSource)) {
      offenders.push(`${file}: raw product color/white-black utility ${pattern}`);
      break;
    }
  }
}

if (offenders.length) {
  console.error(offenders.join("\n"));
  process.exit(1);
}

console.log("Architecture and theme-source lint OK.");
