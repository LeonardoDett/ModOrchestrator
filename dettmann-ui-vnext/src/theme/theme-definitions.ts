export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeDefinition {
  id: string;
  label: string;
  radius?: "sharp" | "soft" | "rounded";
  density?: "compact" | "comfortable" | "spacious";
}
export type ThemeRegistry = Record<string, ThemeDefinition>;

export const forestTheme: ThemeDefinition = { id: "forest", label: "Forest", radius: "soft", density: "comfortable" };
export const graphiteTheme: ThemeDefinition = { id: "graphite", label: "Graphite", radius: "soft", density: "comfortable" };
export const defaultTheme = forestTheme;
export const THEME_REGISTRY: ThemeRegistry = { forest: forestTheme, graphite: graphiteTheme };
