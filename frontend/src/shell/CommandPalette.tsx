import { useMemo, type ReactNode } from "react";
import { Activity, Keyboard, Languages, ScrollText } from "lucide-react";
import { InfoIcon, MoonIcon, PackagePlusIcon, RocketIcon, SunIcon } from "dettmann-ui/icons";
import { Command, Modal, type CommandItem, Icon } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { LANGUAGES, useI18n } from "../i18n/i18n";
import { buildSections, type Route } from "./navigation";
import type { ShellDialog } from "./TopBar";

type PaletteAction =
  | { type: "navigate"; route: Route }
  | { type: "operations" }
  | { type: "deploy" }
  | { type: "import" }
  | { type: "dialog"; dialog: ShellDialog }
  | { type: "setting"; key: string; value: string };

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (route: Route) => void;
  /** Screens of the active game, as the backend offers them. */
  workspaceItems?: readonly string[];
  canDeploy?: boolean;
  onDeploy?: () => void;
  onImport?: () => void;
  onOpenOperations: () => void;
  onOpenDialog: (dialog: ShellDialog) => void;
}

const icon = (node: ReactNode) => <span className="mt-0.5 text-fg-muted">{node}</span>;

/**
 * Command palette (Ctrl+K) over the screens and global actions that exist. Each
 * item is a command the shell already offers elsewhere; the palette decides
 * nothing (settings go through the backend like the Settings screen).
 */
export function CommandPalette({ open, onOpenChange, onNavigate, workspaceItems, canDeploy, onDeploy, onImport, onOpenOperations, onOpenDialog }: CommandPaletteProps) {
  const { t } = useI18n();
  const settings = useSettings();

  const items = useMemo<CommandItem<PaletteAction>[]>(() => {
    const list: CommandItem<PaletteAction>[] = buildSections(workspaceItems).flatMap((section) => section.items).map((entry) => {
      const GlyphIcon = entry.icon;
      return {
        id: `go:${entry.id}`,
        label: t("palette.goTo", { page: t(entry.label) }),
        value: { type: "navigate", route: { view: entry.id } },
        icon: icon(<Icon icon={GlyphIcon} size="sm" />),
      };
    });
    if (onImport) {
      list.push({ id: "import", label: t("palette.import"), value: { type: "import" }, icon: icon(<PackagePlusIcon size="sm" />) });
    }
    if (canDeploy && onDeploy) {
      list.push({ id: "deploy", label: t("palette.deploy"), value: { type: "deploy" }, icon: icon(<RocketIcon size="sm" />) });
    }
    list.push(
      { id: "operations", label: t("palette.openOperations"), value: { type: "operations" }, icon: icon(<Icon icon={Activity} size="sm" />) },
      {
        id: "log",
        label: t("palette.openLog"),
        value: { type: "navigate", route: { view: "diagnostics", tab: "log" } },
        icon: icon(<Icon icon={ScrollText} size="sm" />),
      },
    );
    if (settings.status === "ready") {
      for (const language of LANGUAGES.filter((l) => l !== settings.language)) {
        list.push({
          id: `language:${language}`,
          label: t("palette.switchLanguage", { language: t(`language.${language}`) }),
          value: { type: "setting", key: "ui.language", value: language },
          icon: icon(<Icon icon={Languages} size="sm" />),
        });
      }
      const mode = settings.get("theme.mode")?.value;
      list.push(
        mode === "light"
          ? { id: "theme:dark", label: t("palette.themeDark"), value: { type: "setting", key: "theme.mode", value: "dark" }, icon: icon(<MoonIcon size="sm" />) }
          : { id: "theme:light", label: t("palette.themeLight"), value: { type: "setting", key: "theme.mode", value: "light" }, icon: icon(<SunIcon size="sm" />) },
      );
    }
    list.push(
      { id: "shortcuts", label: t("palette.shortcuts"), value: { type: "dialog", dialog: "shortcuts" }, icon: icon(<Icon icon={Keyboard} size="sm" />) },
      { id: "about", label: t("palette.about"), value: { type: "dialog", dialog: "about" }, icon: icon(<InfoIcon size="sm" />) },
    );
    return list;
  }, [t, settings, workspaceItems, canDeploy, onDeploy, onImport]);

  const run = (action: PaletteAction) => {
    onOpenChange(false);
    switch (action.type) {
      case "navigate":
        return onNavigate(action.route);
      case "operations":
        return onOpenOperations();
      case "deploy":
        return onDeploy?.();
      case "import":
        return onImport?.();
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
