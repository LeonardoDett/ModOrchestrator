import { execSync } from "node:child_process";
import { defineConfig } from "tsup";

function buildCss() {
  execSync("npm run build:css", { stdio: "inherit" });
}

export default defineConfig((options) => ({
  entry: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    "!src/__tests__/**",
  ],
  format: ["esm"],
  dts: true,
  bundle: false,
  sourcemap: true,
  // Watch + clean drops newly added folders that the running watcher never globbed.
  clean: !options.watch,
  external: ["react", "react-dom"],
  onSuccess: async () => {
    buildCss();
  },
  outExtension() {
    return { js: ".mjs" };
  },
}));

