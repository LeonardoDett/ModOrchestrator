import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPresetsCSS } from "../../src/theme/presets";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "src/styles/theme/themes.generated.css");
fs.writeFileSync(out, renderPresetsCSS());
console.log(`Temas gerados em ${path.relative(root, out)}.`);
