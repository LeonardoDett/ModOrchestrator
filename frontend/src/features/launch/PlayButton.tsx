import { useState } from "react";
import { ChevronDown, FolderOpen, Loader2, OctagonX, Play, Square, TriangleAlert, UploadCloud } from "lucide-react";
import { Button, Menu } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useLaunchCheck, useWorkspace } from "../../bridge/queries";
import type { LaunchCheck, LaunchRequest } from "../../bridge/types";
import { useI18n, type MessageKey, type Translator } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { PrelaunchDialog } from "./PrelaunchDialog";

/** Label of a launch option ("skse", "game"...), by code (D044). */
export function launchOptionLabel(i18n: Translator, id: string): string {
  const key = `launch.option.${id}`;
  return i18n.has(key) ? i18n.t(key) : id;
}

/** Why Play is unavailable or what it will do, for its tooltip. */
function stateHint(i18n: Translator, c: LaunchCheck): string {
  switch (c.state) {
    case "running":
      return i18n.t("launch.hint.running", { processes: c.running.join(", ") });
    case "busy":
      return i18n.t("launch.hint.busy");
    case "unavailable":
      return i18n.t(`launch.unavailable.${c.unavailable ?? "no_executable"}` as MessageKey);
    case "blocked":
      return i18n.t("launch.hint.blocked");
    case "deploy":
      return i18n.t(c.autoDeploy ? "launch.hint.deployAuto" : "launch.hint.deploy");
    case "warnings":
      return i18n.t("launch.hint.warnings");
    default:
      return i18n.t("launch.hint.ready");
  }
}

/**
 * Play in the title bar (ui/00 §2.1, core/11 §6, D045; Vortex
 * `titlebar-launcher`). The state comes from the backend's pre-launch
 * check: ready launches at once; a pending deploy is run first (directly
 * when auto-deploy is on, else DLG-26 asks); problems open DLG-26 with
 * "Jogar mesmo assim", blocking ones only with the actions that solve
 * them; while the game runs Play becomes "Em execução". The menu has the
 * other launch options and the game folder.
 */
export function PlayButton() {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const ws = useWorkspace();
  const instance = ws.status === "ready" ? (ws.data.active?.id ?? "") : "";
  const check = useLaunchCheck(instance);
  const [dialog, setDialog] = useState<{ option: string } | null>(null);

  if (!instance || check.status !== "ready" || !check.data) return null;
  const c = check.data;

  const launch = (request: LaunchRequest) => run(() => backend.launch(instance, request));
  const play = (option: string) => {
    if (c.state === "ready" || (c.state === "deploy" && c.autoDeploy)) void launch({ option, deploy: false, confirmed: false });
    else setDialog({ option });
  };

  const disabled = c.state === "running" || c.state === "busy" || c.state === "unavailable";
  const icon =
    c.state === "running" ? (
      <Square aria-hidden="true" className="h-3.5 w-3.5" />
    ) : c.state === "busy" ? (
      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
    ) : c.state === "blocked" ? (
      <OctagonX aria-hidden="true" className="h-3.5 w-3.5" />
    ) : c.state === "warnings" ? (
      <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
    ) : c.state === "deploy" ? (
      <UploadCloud aria-hidden="true" className="h-3.5 w-3.5" />
    ) : (
      <Play aria-hidden="true" className="h-3.5 w-3.5" />
    );
  const hint = stateHint(i18n, c);
  const others = c.options.filter((o) => !o.default);

  return (
    <div className="flex items-center">
      <Button
        size="sm"
        tone={c.state === "blocked" ? "danger" : c.state === "warnings" ? "warning" : "primary"}
        variant={c.state === "running" ? "outline" : undefined}
        disabled={disabled}
        startIcon={icon}
        title={hint}
        aria-label={`${t(c.state === "running" ? "launch.running" : "launch.play")}. ${hint}`}
        className="rounded-r-none"
        onClick={() => play("")}
      >
        {t(c.state === "running" ? "launch.running" : "launch.play")}
      </Button>
      <Menu.Root placement="bottom-end">
        <Menu.Trigger>
          <Button size="sm" variant="outline" className="rounded-l-none border-l-0 px-1.5" aria-label={t("launch.menu")}>
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </Menu.Trigger>
        <Menu.Content>
          {others.map((o) => (
            <Menu.Item key={o.id} label={launchOptionLabel(i18n, o.id)} disabled={disabled} onSelect={() => play(o.id)}>
              <Play aria-hidden="true" className="h-4 w-4" />
              {launchOptionLabel(i18n, o.id)}
            </Menu.Item>
          ))}
          <Menu.Item label={t("launch.openGameFolder")} onSelect={() => void run(() => backend.openInstanceFolder(instance, "game"))}>
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            {t("launch.openGameFolder")}
          </Menu.Item>
        </Menu.Content>
      </Menu.Root>
      {dialog ? <PrelaunchDialog check={c} option={dialog.option} onLaunch={launch} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
