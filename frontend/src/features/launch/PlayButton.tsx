import { useState } from "react";
import { OctagonX, Square } from "lucide-react";
import { PlayIcon, TriangleAlertIcon, UploadIcon } from "dettmann-ui/icons";
import { Button, ContextMenu, Icon, Loader, type ContextMenuItem } from "dettmann-ui";
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
export function PlayButton({ layout = "inline" }: { layout?: "inline" | "block" | "icon" } = {}) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const ws = useWorkspace();
  const instance = ws.status === "ready" ? (ws.data.active?.id ?? "") : "";
  const check = useLaunchCheck(instance);
  const [dialog, setDialog] = useState<{ option: string; elevation: boolean } | null>(null);

  if (!instance || check.status !== "ready" || !check.data) return null;
  const c = check.data;

  const launch = (request: LaunchRequest) => run(() => backend.launch(instance, request));
  const play = (option: string) => {
    // D150: an option Windows refused without administrator rights asks
    // first whether to play elevated.
    const chosen = c.options.find((o) => (option ? o.id === option : o.default));
    if (chosen?.needsElevation && c.state !== "blocked") setDialog({ option, elevation: true });
    else if (c.state === "ready" || (c.state === "deploy" && c.autoDeploy)) void launch({ option, deploy: false, confirmed: false });
    else setDialog({ option, elevation: false });
  };

  const disabled = c.state === "running" || c.state === "busy" || c.state === "unavailable";
  const icon =
    c.state === "running" ? (
      <Icon icon={Square} size="sm" />
    ) : c.state === "busy" ? (
      <Loader decorative size="xs" />
    ) : c.state === "blocked" ? (
      <Icon icon={OctagonX} size="sm" />
    ) : c.state === "warnings" ? (
      <TriangleAlertIcon size="sm" />
    ) : c.state === "deploy" ? (
      <UploadIcon size="sm" />
    ) : (
      <PlayIcon size="sm" />
    );
  const hint = stateHint(i18n, c);
  const others = c.options.filter((o) => !o.default);

  const label = `${t(c.state === "running" ? "launch.running" : "launch.play")}. ${hint}`;
  const intent = c.state === "blocked" ? "danger" : c.state === "warnings" ? "warning" : "brand";
  const emphasis = c.state === "running" ? "medium" : "high";
  const dialogNode = dialog ? <PrelaunchDialog check={c} option={dialog.option} elevation={dialog.elevation} onLaunch={launch} onClose={() => setDialog(null)} /> : null;

  // Rail of the collapsed menu (D120): the main action only, named by its state.
  if (layout === "icon") {
    return (
      <>
        <Button size="icon" intent={intent} emphasis={emphasis} disabled={disabled} aria-label={label} tooltip={hint} onClick={() => play("")}>
          {icon}
        </Button>
        {dialogNode}
      </>
    );
  }

  // Foot of the game menu (board JogoMods): one 40 px button in the game's
  // color. The other launch options and the game folder stay on its
  // context menu (right click or the menu key).
  if (layout === "block") {
    const options: ContextMenuItem[] = [
      ...others.map((o) => ({ id: o.id, label: launchOptionLabel(i18n, o.id), disabled, onSelect: () => play(o.id) })),
      { id: "folder", label: t("launch.openGameFolder"), onSelect: () => void run(() => backend.openInstanceFolder(instance, "game")) },
    ];
    return (
      <>
        <ContextMenu items={options} className="w-full">
          <Button size="lg" fullWidth intent={intent} emphasis={emphasis} disabled={disabled} startIcon={icon} title={hint} aria-label={label} onClick={() => play("")}>
            {t(c.state === "running" ? "launch.running" : "launch.play")}
          </Button>
        </ContextMenu>
        {dialogNode}
      </>
    );
  }

  // A card of a screen (boards Biblioteca, Inicio): one button, the other
  // launch options and the game folder on its context menu, like the block.
  const options: ContextMenuItem[] = [
    ...others.map((o) => ({ id: o.id, label: launchOptionLabel(i18n, o.id), disabled, onSelect: () => play(o.id) })),
    { id: "folder", label: t("launch.openGameFolder"), onSelect: () => void run(() => backend.openInstanceFolder(instance, "game")) },
  ];
  return (
    <>
      <ContextMenu items={options}>
        <Button intent={intent} emphasis={emphasis} disabled={disabled} startIcon={icon} title={hint} aria-label={label} onClick={() => play("")}>
          {t(c.state === "running" ? "launch.running" : "launch.play")}
        </Button>
      </ContextMenu>
      {dialogNode}
    </>
  );
}
