import fs from "node:fs";
import path from "node:path";

const themeRoot = path.resolve(process.argv[2] ?? "src/styles/theme");
const required = [
  path.join(themeRoot, "themes.css"),
  path.resolve(themeRoot, "../../theme/tokens.css"),
  path.resolve(themeRoot, "foundations.css"),
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing theme source: ${file}`);
}
console.log("Theme sources are present. No generated palette is required.");
