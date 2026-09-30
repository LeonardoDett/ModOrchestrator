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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Hook libraries installed under the linked dettmann-ui must go through
    // Vite (and its dedupe) instead of being externalized with their own
    // copy of React.
    server: { deps: { inline: [/dettmann-ui/, /@floating-ui/, /@tanstack/] } },
  },
});
