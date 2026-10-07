import type { ReactNode } from "react";
import { ThemeProvider, ThemeScope, PRESETS, createTheme, Button, type ThemeConfig } from "dettmann-ui";

/** Preset embarcado: o tema do Mod Orchestrator, escolhido por id. */
export function App({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="orchestrator" defaultMode="dark">
      {children}
    </ThemeProvider>
  );
}

/** Variante derivada do preset: mesmas escolhas, outra personalidade. */
const compact: ThemeConfig = { ...PRESETS.orchestrator, id: "orchestrator-compact", label: "Orchestrator compacto", density: "compact", shape: "precise" };

export function CompactPanel({ children }: { children: ReactNode }) {
  return <ThemeScope theme={compact}>{children}</ThemeScope>;
}

/** O motor é puro: dá para resolver o tema fora do React (testes, relatórios de contraste). */
export const resolved = createTheme(PRESETS.orchestrator);

export function Actions() {
  return (
    <>
      <Button emphasis="high">Implantar</Button>
      <Button>Cancelar</Button>
      <Button emphasis="low" intent="danger">Remover</Button>
    </>
  );
}
