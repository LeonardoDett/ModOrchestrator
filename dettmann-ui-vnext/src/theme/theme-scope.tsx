import type { CSSProperties, ReactNode } from "react";
import { inputsToStyle, type ThemeInputs } from "./theme-inputs";
import type { ResolvedTheme } from "./theme-definitions";

export interface ThemeScopeProps {
  theme?: string;
  mode?: ResolvedTheme;
  inputs?: ThemeInputs;
  className?: string;
  children: ReactNode;
}

export function ThemeScope({ theme = "forest", mode = "light", inputs, className, children }: ThemeScopeProps) {
  const style = inputsToStyle(inputs, mode) as CSSProperties | undefined;
  return <div data-theme={theme} data-ui-mode={mode} style={style} className={className}>{children}</div>;
}
