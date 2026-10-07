export { ThemeProvider, type ThemeProviderProps } from "./theme-provider";
export { ThemeScope, type ThemeScopeProps } from "./theme-scope";
export { useTheme, type UseThemeReturn } from "./use-theme";
export type { ThemeMode, ThemeContextValue } from "./theme-context";
export { injectTheme, resolveThemeInput } from "./inject";
export { getThemeScript, THEME_STORAGE_KEY, THEME_NAME_STORAGE_KEY, type GetThemeScriptOptions } from "./get-theme-script";
export {
  createTheme,
  toCSS,
  ThemeConfigError,
  MOTION_LEVELS,
  type ThemeConfig,
  type ResolvedTheme,
  type Mode,
  type MotionLevel,
  type MotionSpec,
  type MotionTune,
  type Intent,
  type ColorIntent,
  type Emphasis,
  type RoleName,
  type RoleOverrides,
  type NeutralTemperature,
  type ContrastLevel,
  type Shape,
  type Density,
} from "./engine";
export { PRESETS, DEFAULT_PRESET, type PresetId } from "./presets";
export { TONES, type Tone } from "./tone";
export {
  resolveEmphasis,
  intentData,
  INTENTS,
  EMPHASES,
  EMPHASIS_MOTION,
  type EmphasisInput,
  type EmphasisResolution,
} from "./emphasis";
