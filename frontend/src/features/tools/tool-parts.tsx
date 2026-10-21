import { useCallback, useEffect, useState } from "react";
import { Avatar, CATEGORY_COLORS, useToast, type CategoryColor } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError } from "../../bridge/errors";
import type { ToolEntry } from "../../bridge/types";
import { useRefresh } from "../../bridge/use-backend-query";
import { useI18n } from "../../i18n/i18n";

/**
 * The icon of a tool (boards JogoFerramentas*): the image the backend reads
 * from the executable (or the one the user chose); without one, a square
 * monogram in a palette color picked from the tool id, so each tool keeps
 * its color.
 */
export function ToolIcon({ instance, tool, size = "md" }: { instance: string; tool: ToolEntry; size?: "xs" | "sm" | "md" | "lg" }) {
  const { t } = useI18n();
  const src = useToolIcon(instance, tool);
  return (
    <Avatar
      shape="square"
      size={size}
      src={src || undefined}
      fallback={monogram(tool.name)}
      color={paletteColor(tool.id)}
      label={t("tools.iconOf", { name: tool.name })}
    />
  );
}

function useToolIcon(instance: string, tool: ToolEntry) {
  const backend = useBackend();
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    if (!backend.connected) return;
    backend.toolIcon(instance, tool.id).then(
      (url) => live && setSrc(url),
      () => live && setSrc(""),
    );
    return () => {
      live = false;
    };
  }, [backend, instance, tool.id, tool.exe, tool.icon]);
  return src;
}

/** Two letters of a name: initials of two words, or the first two letters. */
export function monogram(name: string) {
  const words = name.replace(/[()[\]]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const w = words[0] ?? "?";
  return (w[0]!.toUpperCase() + (w[1] ?? "")).slice(0, 2);
}

function paletteColor(id: string): CategoryColor {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length]!;
}

/** "em execução" with its dot, beside the name of a running tool. */
export function RunningMark({ label }: { label: string }) {
  return (
    <span data-intent="success" className="flex shrink-0 items-center gap-1.5 text-xs text-intent-text">
      <span aria-hidden="true" className="size-1.75 rounded-pill bg-current" />
      {label}
    </span>
  );
}

/** A dot icon for the "em execução" chip of the header. */
export function DotIcon({ className }: { className?: string; "aria-hidden"?: boolean | "true" | "false" }) {
  return (
    <span aria-hidden="true" className={`flex size-4 items-center justify-center ${className ?? ""}`}>
      <span className="size-2 rounded-pill bg-current" />
    </span>
  );
}

export interface MissingExe {
  tool: ToolEntry;
  path: string;
}

/**
 * Starts a tool. A missing executable is not an error toast: it comes back
 * to the screen, which asks where the tool is now ("Localizar…"); any
 * other failure is a translated toast.
 */
export function useStartTool(instance: string, onMissing: (m: MissingExe) => void) {
  const i18n = useI18n();
  const backend = useBackend();
  const { addToast } = useToast();
  const { refresh } = useRefresh();
  return useCallback(
    async (tool: ToolEntry) => {
      try {
        await backend.runTool(instance, tool.id);
        refresh();
      } catch (raw) {
        const error = toUIError(raw);
        if (error.code === "tool_executable_missing") onMissing({ tool, path: error.params.path ?? tool.resolvedExe });
        else addToast({ title: errorMessage(i18n, error), variant: "danger" });
      }
    },
    [backend, instance, onMissing, refresh, addToast, i18n],
  );
}

/** "Localizar…": the user points to the executable and the tool keeps the rest. */
export function useLocateTool(instance: string) {
  const i18n = useI18n();
  const backend = useBackend();
  const { addToast } = useToast();
  const { refresh } = useRefresh();
  return useCallback(
    async (tool: ToolEntry) => {
      const exe = await backend.pickToolExecutable(i18n.t("tools.edit.pickExe"));
      if (!exe) return false;
      try {
        await backend.saveTool(instance, { ...toInput(tool), exe });
        refresh();
        addToast({ title: i18n.t("tools.saved"), variant: "success", duration: 3000 });
        return true;
      } catch (raw) {
        addToast({ title: errorMessage(i18n, toUIError(raw)), variant: "danger" });
        return false;
      }
    },
    [backend, instance, i18n, refresh, addToast],
  );
}

export function toInput(t: ToolEntry) {
  return {
    id: t.id,
    name: t.name,
    known: t.known,
    exe: t.exe,
    args: t.args,
    workDir: t.workDir,
    env: t.env.map((e) => ({ ...e })),
    icon: t.icon,
    exclusive: t.exclusive,
    deployBefore: t.deployBefore,
  };
}
