import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { SettingsIcon } from "dettmann-ui/icons";
import {
  Alert,
  Button,
  Icon,
  Menu,
  Modal,
  Typography,
  useToast,
} from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { useTools, useWorkspace } from "../../bridge/queries";
import type { OperationEvent, ToolEntry } from "../../bridge/types";
import { useI18n } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useDeploy } from "../deploy/DeployContext";
import { ToolIcon, useStartTool, type MissingExe } from "./tool-parts";

/** The section of the workspace that brings the tools menu (D146): the UI never tests the capability. */
const SECTION = "topbar.tools";

/**
 * The tools menu of the top bar (board JogoFerramentasMenu, D146): a
 * wrench left of the bell, with a dot while a tool runs; the tools in the
 * order of the list; the ones that cannot start are greyed with the reason
 * (another exclusive tool is open, the executable is gone); then "Gerenciar
 * ferramentas…".
 */
export function ToolsMenu() {
  const ws = useWorkspace();
  const instance =
    ws.status === "ready" &&
    ws.data.active &&
    (ws.data.sections ?? []).includes(SECTION)
      ? ws.data.active.id
      : "";
  if (!instance) return null;
  return <ToolsMenuFor instance={instance} />;
}

function ToolsMenuFor({ instance }: { instance: string }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const list = useTools(instance);
  const tools = list.status === "ready" ? list.data.tools : [];
  const blocker = list.status === "ready" ? list.data.blocker : "";
  const running = tools.some((x) => x.running);
  const onMissing = useCallback(
    (m: MissingExe) =>
      navigate({ view: "tools", tool: m.tool.id, missingPath: m.path }),
    [navigate],
  );
  const start = useStartTool(instance, onMissing);
  const label = running ? t("tools.menu.runningLabel") : t("tools.menu.label");
  return (
    <>
      <ToolExitNotice />
      <Menu.Root placement="bottom-end">
        <Menu.Trigger>
          <Button
            emphasis="low"
            size="icon"
            aria-label={label}
            tooltip={t("tools.menu.label")}
            badge={running}
            badgeIntent="success"
          >
            <Icon icon={Wrench} size="sm" />
          </Button>
        </Menu.Trigger>
        <Menu.Content aria-label={t("tools.menu.label")} className="w-75">
          {tools.length === 0 ? (
            <Menu.Item disabled>{t("tools.menu.empty")}</Menu.Item>
          ) : (
            tools.map((tool) => (
              <ToolItem
                key={tool.id}
                instance={instance}
                tool={tool}
                blocker={blocker}
                onStart={() => void start(tool)}
              />
            ))
          )}
          <Menu.Separator />
          <Menu.Item
            icon={SettingsIcon}
            onSelect={() => navigate({ view: "tools" })}
          >
            {t("tools.menu.manage")}
          </Menu.Item>
        </Menu.Content>
      </Menu.Root>
    </>
  );
}

function ToolItem({
  instance,
  tool,
  blocker,
  onStart,
}: {
  instance: string;
  tool: ToolEntry;
  blocker: string;
  onStart: () => void;
}) {
  const { t } = useI18n();
  const missing = tool.problem === "tool_executable_missing";
  const blocked = !tool.running && blocker !== "";
  const off = blocked || missing;
  let sub = "";
  if (tool.running) sub = t("tools.running");
  else if (blocked) sub = t("tools.menu.blocked", { name: blocker });
  else if (missing) sub = t("tools.menu.missing");
  return (
    <Menu.Item
      label={tool.name}
      disabled={off}
      title={
        blocked ? t("tools.menu.blockedTip", { name: blocker }) : undefined
      }
      onSelect={tool.running ? undefined : onStart}
      media={<ToolIcon instance={instance} tool={tool} size="xs" />}
      description={
        sub ? (
          tool.running || missing ? (
            <span
              data-intent={tool.running ? "success" : "warning"}
              className="text-intent-text"
            >
              {sub}
            </span>
          ) : (
            sub
          )
        ) : undefined
      }
      end={
        tool.running ? (
          <span
            data-intent="success"
            aria-hidden="true"
            className="size-2 rounded-pill bg-intent-fill"
          />
        ) : undefined
      }
    >
      <span className="font-medium">{tool.name}</span>
    </Menu.Item>
  );
}

interface Finished {
  tool: string;
  name: string;
  started: string;
  ended: string;
  newFiles: number;
  changes: number;
}

/**
 * When a tool started from the app ends (tool.exited, D146): with new or
 * changed files in the game, the dialog of board JogoFerramentasFim offers
 * the review with capture (DLG-15); without, a toast. The counts come with
 * the event; the review reads the backend again.
 */
export function ToolExitNotice() {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const { addToast } = useToast();
  const { instance, openReview } = useDeploy();
  const [done, setDone] = useState<Finished | null>(null);

  useEffect(() => {
    if (!backend.connected) return;
    return backend.onOperationEvent((e: OperationEvent) => {
      if (e.type !== "tool.exited" || !e.data) return;
      if (instance && e.data.instance && e.data.instance !== instance) return;
      const d = e.data;
      const name = d.name ?? "";
      const newFiles = Number(d.newFiles ?? 0);
      const changes = Number(d.changes ?? 0);
      if (d.scanned === "true" && newFiles + changes > 0) {
        setDone({
          tool: d.tool ?? "",
          name,
          started: d.started ?? "",
          ended: e.occurredAt,
          newFiles,
          changes,
        });
      } else {
        addToast({
          title: t("tools.exit.title", { name }),
          description: d.scanned === "true" ? t("tools.exit.clean") : undefined,
          variant: "success",
          duration: 4000,
        });
      }
    });
  }, [backend, instance, addToast, t]);

  if (!done) return null;
  return (
    <Modal.Root open onOpenChange={(open) => !open && setDone(null)}>
      <Modal.Content
        size="custom"
        className="w-125"
        aria-describedby={undefined}
      >
        <Modal.Header layout="stacked">
          <span className="flex items-start gap-3">
            <ToolIcon
              instance={instance}
              tool={
                {
                  id: done.tool,
                  name: done.name,
                  exe: "",
                  icon: "",
                } as ToolEntry
              }
              size="md"
            />
            <span className="flex flex-col gap-1">
              <Modal.Title size="lg">
                {t("tools.exit.title", { name: done.name })}
              </Modal.Title>
              {done.started ? (
                <Typography variant="body-sm" color="muted-fg">
                  {t("tools.exit.when", {
                    start: i18n.formatTime(done.started),
                    end: i18n.formatTime(done.ended),
                  })}
                </Typography>
              ) : null}
            </span>
          </span>
        </Modal.Header>
        <Modal.Body>
          <div className="flex flex-col gap-3.5 text-sm">
            <Alert.Root intent="info">
              <Alert.Description>
                {done.newFiles > 0 && done.changes > 0
                  ? t("tools.exit.summary", {
                      newFiles: tp("tools.exit.newFiles", done.newFiles),
                      changes: tp("tools.exit.changes", done.changes),
                    })
                  : done.newFiles > 0
                    ? t("tools.exit.summaryNew", {
                        newFiles: tp("tools.exit.newFiles", done.newFiles),
                      })
                    : t("tools.exit.summaryChanged", {
                        changes: tp("tools.exit.changes", done.changes),
                      })}
              </Alert.Description>
            </Alert.Root>
            <Typography variant="body-sm" color="muted-fg">
              {t("tools.exit.hint")}
            </Typography>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setDone(null)}>{t("tools.exit.later")}</Button>
          <Button
            emphasis="high"
            onClick={() => {
              setDone(null);
              openReview();
            }}
          >
            {t("tools.exit.review")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
