import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// App local de calibração de tema; não faz parte do pacote publicado.
// `root` é relativo ao diretório de onde `npm run playground` roda (a raiz da lib).
export default defineConfig({
  root: "playground",
  plugins: [react(), tailwindcss()],
});
