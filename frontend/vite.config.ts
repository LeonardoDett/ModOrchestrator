/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // dettmann-ui is linked from ../dettmann-ui-vnext and has its own
    // node_modules; force a single copy of React and the icon set.
    dedupe: ["react", "react-dom", "lucide-react"],
  },
  // The linked library's fonts (dettmann-ui/theme.css -> src/styles/fonts)
  // live outside this folder; the dev server only serves allowed roots.
  server: { fs: { allow: [".", "../dettmann-ui-vnext"] } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Whole-app renders (App + dettmann-ui v2 icons and overlays) pass 5 s
    // when every file runs in parallel; alone they take 1-4 s.
    testTimeout: 15_000,
    // Hook libraries installed under the linked dettmann-ui must go through
    // Vite (and its dedupe) instead of being externalized with their own
    // copy of React.
    server: { deps: { inline: [/dettmann-ui/, /@floating-ui/, /@tanstack/] } },
  },
});
