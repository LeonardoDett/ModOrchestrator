import { useMemo, type ReactNode } from "react";
import { Activity, Info, Keyboard, Languages, Moon, ScrollText, Sun } from "lucide-react";
import { Command, Modal, type CommandItem } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { LANGUAGES, useI18n } from "../i18n/i18n";
import { NAV_SECTIONS, type Route } from "./navigation";
import type { ShellDialog } from "./TopBar";

type PaletteAction =
  | { type: "navigate"; route: Route }
  | { type: "operations" }
  | { type: "dialog"; dialog: ShellDialog }
  | { type: "setting"; key: string; value: string };

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (route: Route) => void;
  onOpenOperations: () => void;
  onOpenDialog: (dialog: ShellDialog) => void;
}

const icon = (node: ReactNode) => <span className="mt-0.5 text-fg-muted">{node}</span>;
const iconClass = "h-4 w-4";

/**
 * Command palette (Ctrl+K) over the global actions that exist today. Each
 * item is a command the shell already offers elsewhere; the palette decides
 * nothing (settings go through the backend like the Settings screen).
 */
export function CommandPalette({ open, onOpenChange, onNavigate, onOpenOperations, onOpenDialog }: CommandPaletteProps) {
  const { t } = useI18n();
  const settings = useSettings();

  const items = useMemo<CommandItem<PaletteAction>[]>(() => {
    const list: CommandItem<PaletteAction>[] = NAV_SECTIONS.flatMap((section) => section.items).map((entry) => {
      const Icon = entry.icon;
      return {
        id: `go:${entry.id}`,
        label: t("palette.goTo", { page: t(entry.label) }),
        value: { type: "navigate", route: { view: entry.id } },
        icon: icon(<Icon aria-hidden="true" className={iconClass} />),
      };
    });
    list.push(
      { id: "operations", label: t("palette.openOperations"), value: { type: "operations" }, icon: icon(<Activity aria-hidden="true" className={iconClass} />) },
      {
        id: "log",
        label: t("palette.openLog"),
        value: { type: "navigate", route: { view: "diagnostics", tab: "log" } },
        icon: icon(<ScrollText aria-hidden="true" className={iconClass} />),
      },
    );
    if (settings.status === "ready") {
      for (const language of LANGUAGES.filter((l) => l !== settings.language)) {
        list.push({
          id: `language:${language}`,
          label: t("palette.switchLanguage", { language: t(`language.${language}`) }),
          value: { type: "setting", key: "ui.language", value: language },
          icon: icon(<Languages aria-hidden="true" className={iconClass} />),
        });
      }
      const mode = settings.get("theme.mode")?.value;
      list.push(
        mode === "light"
          ? { id: "theme:dark", label: t("palette.themeDark"), value: { type: "setting", key: "theme.mode", value: "dark" }, icon: icon(<Moon aria-hidden="true" className={iconClass} />) }
          : { id: "theme:light", label: t("palette.themeLight"), value: { type: "setting", key: "theme.mode", value: "light" }, icon: icon(<Sun aria-hidden="true" className={iconClass} />) },
      );
    }
    list.push(
      { id: "shortcuts", label: t("palette.shortcuts"), value: { type: "dialog", dialog: "shortcuts" }, icon: icon(<Keyboard aria-hidden="true" className={iconClass} />) },
      { id: "about", label: t("palette.about"), value: { type: "dialog", dialog: "about" }, icon: icon(<Info aria-hidden="true" className={iconClass} />) },
    );
    return list;
  }, [t, settings]);

  const run = (action: PaletteAction) => {
    onOpenChange(false);
    switch (action.type) {
      case "navigate":
        return onNavigate(action.route);
      case "operations":
        return onOpenOperations();
      case "dialog":
        return onOpenDialog(action.dialog);
      case "setting":
        return void settings.set(action.key, action.value);
    }
  };

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content size="lg" className="overflow-visible bg-transparent shadow-none" aria-describedby={undefined}>
        <Modal.Title className="sr-only">{t("palette.title")}</Modal.Title>
        <Command
          items={items}
          placeholder={t("palette.placeholder")}
          emptyMessage={t("palette.empty")}
          onValueChange={(item) => run(item.value)}
        />
      </Modal.Content>
    </Modal.Root>
  );
}
