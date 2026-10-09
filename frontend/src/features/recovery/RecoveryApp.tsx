import { ThemeProvider } from "dettmann-ui";
import type { Backend, StartupRecovery } from "../../bridge/types";
import { I18nProvider, isLanguage } from "../../i18n/i18n";
import { RecoveryScreen } from "./RecoveryScreen";

/**
 * The root used instead of App when the database could not be used: no
 * settings can be read, so the language comes from the OS (backend) and
 * the theme is the default one.
 */
export function RecoveryApp({ backend, recovery }: { backend: Backend; recovery: StartupRecovery }) {
  return (
    <ThemeProvider defaultTheme="orchestrator" defaultMode="dark">
      <I18nProvider language={isLanguage(recovery.language) ? recovery.language : "en"}>
        <RecoveryScreen backend={backend} recovery={recovery} />
      </I18nProvider>
    </ThemeProvider>
  );
}
