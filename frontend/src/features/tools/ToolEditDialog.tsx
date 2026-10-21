import { useEffect, useState } from "react";
import { PlusIcon, XIcon, ChevronDownIcon } from "dettmann-ui/icons";
import { Avatar, Button, Input, Menu, Modal, SettingRow, Switch, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import type { ToolEnv, ToolEntry, ToolInput, ToolVariable } from "../../bridge/types";
import { useRefresh } from "../../bridge/use-backend-query";
import { useI18n } from "../../i18n/i18n";
import { useToast } from "dettmann-ui";
import { ToolIcon, monogram, toInput } from "./tool-parts";

const EMPTY: ToolInput = { id: "", name: "", known: "", exe: "", args: "", workDir: "", env: [], icon: "", exclusive: false, deployBefore: true };

type Field = "name" | "exe" | "args" | "workDir" | "env" | "icon";

/**
 * Adicionar / Editar ferramenta (board JogoFerramentasEditar, D146). The
 * form never validates by itself: the backend refuses with tool_invalid and
 * the reason, and the message goes under the field at fault. "Inserir
 * variável" lists the variables of the instance with their values.
 */
export function ToolEditDialog({
  instance,
  gameName,
  tool,
  variables,
  onClose,
}: {
  instance: string;
  gameName: string;
  /** The tool to edit; null to add one. */
  tool: ToolEntry | null;
  variables: ToolVariable[];
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const { refresh } = useRefresh();
  const { addToast } = useToast();
  const [form, setForm] = useState<ToolInput>(tool ? toInput(tool) : EMPTY);
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm(tool ? toInput(tool) : EMPTY);
    setError(null);
  }, [tool]);

  const set = <K extends keyof ToolInput>(key: K, value: ToolInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setEnv = (index: number, row: ToolEnv | null) =>
    setForm((f) => ({ ...f, env: row ? f.env.map((e, i) => (i === index ? row : e)) : f.env.filter((_, i) => i !== index) }));

  const faulty = fieldOf(error, form);
  const message = error ? errorMessage(i18n, error) : "";

  const browse = async (key: "exe" | "icon") => {
    const path = key === "exe" ? await backend.pickToolExecutable(t("tools.edit.pickExe")) : await backend.pickToolIcon(t("tools.edit.pickIcon"));
    if (path) set(key, path);
  };
  const browseFolder = async () => {
    const path = await backend.pickFolder(t("tools.edit.workDir"));
    if (path) set("workDir", path);
  };
  const insert = (name: string) => set("args", form.args === "" || form.args.endsWith(" ") ? `${form.args}{${name}}` : `${form.args} {${name}}`);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await backend.saveTool(instance, form);
      refresh();
      addToast({ title: t("tools.saved"), variant: "success", duration: 3000 });
      onClose();
    } catch (raw) {
      setError(toUIError(raw));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="custom" className="w-160" aria-describedby={undefined}>
        <Modal.Header layout="stacked">
          <Modal.Title size="lg">{t(tool ? "tools.edit.titleEdit" : "tools.edit.titleAdd")}</Modal.Title>
          <Typography variant="body-sm" color="muted-fg">
            {t("tools.edit.scope", { game: gameName })}
          </Typography>
        </Modal.Header>
        <Modal.Body>
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-end gap-3.5">
              <span className="flex justify-center">
                {tool && form.icon === tool.icon ? (
                  <ToolIcon instance={instance} tool={tool} size="lg" />
                ) : (
                  <Avatar shape="square" size="lg" fallback={monogram(form.name || "?")} label={t("tools.edit.iconCurrent")} />
                )}
              </span>
              <Input.Root fullWidth value={form.name} onChange={(v: string) => set("name", v)} error={faulty === "name" ? message : undefined}>
                <Input.Label>{t("tools.edit.name")}</Input.Label>
                <Input.Box>
                  <Input.Field autoFocus />
                </Input.Box>
                <Input.Error />
              </Input.Root>
            </div>
            <div className="-mt-2 flex gap-2">
              <Button size="sm" onClick={() => void browse("icon")}>
                {t("tools.edit.chooseIcon")}
              </Button>
              <Button size="sm" emphasis="low" onClick={() => set("icon", "")}>
                {t("tools.edit.exeIcon")}
              </Button>
            </div>
            {faulty === "icon" ? <Typography variant="body-sm" intent="danger">{message}</Typography> : null}

            <Input.Root fullWidth value={form.exe} onChange={(v: string) => set("exe", v)} error={faulty === "exe" ? message : undefined}>
              <Input.Label>{t("tools.edit.exe")}</Input.Label>
              <div className="flex gap-2">
                <Input.Box className="min-w-0 flex-1">
                  <Input.Field className="font-mono text-xs" />
                </Input.Box>
                <Button className="shrink-0" onClick={() => void browse("exe")}>
                  {t("tools.edit.browse")}
                </Button>
              </div>
              <Input.Error />
            </Input.Root>

            <Input.Root fullWidth value={form.args} onChange={(v: string) => set("args", v)} error={faulty === "args" ? message : undefined}>
              <Input.Label>{t("tools.edit.args")}</Input.Label>
              <div className="flex gap-2">
                <Input.Box className="min-w-0 flex-1">
                  <Input.Field className="font-mono text-xs" />
                </Input.Box>
                <Menu.Root placement="bottom-end">
                  <Menu.Trigger>
                    <Button className="shrink-0" endIcon={<ChevronDownIcon size="sm" />}>
                      {t("tools.edit.insertVariable")}
                    </Button>
                  </Menu.Trigger>
                  <Menu.Content className="w-82.5">
                    {variables.map((v) => (
                      <Menu.Item key={v.name} label={v.name} description={v.value} onSelect={() => insert(v.name)}>
                        <span className="font-mono text-xs">{`{${v.name}}`}</span>
                      </Menu.Item>
                    ))}
                  </Menu.Content>
                </Menu.Root>
              </div>
              <Input.Error />
            </Input.Root>

            <Input.Root fullWidth value={form.workDir} onChange={(v: string) => set("workDir", v)} error={faulty === "workDir" ? message : undefined}>
              <Input.Label>{t("tools.edit.workDir")}</Input.Label>
              <div className="flex gap-2">
                <Input.Box className="min-w-0 flex-1">
                  <Input.Field placeholder={t("tools.panel.workDirDefault")} />
                </Input.Box>
                <Button className="shrink-0" onClick={() => void browseFolder()}>
                  {t("tools.edit.browse")}
                </Button>
              </div>
              <Input.Error />
            </Input.Root>

            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-fg">{t("tools.edit.env")}</span>
              {form.env.map((row, i) => (
                <div key={i} className="grid grid-cols-[11.25rem_minmax(0,1fr)_2rem] items-center gap-2">
                  <Input.Root fullWidth value={row.name} onChange={(v: string) => setEnv(i, { ...row, name: v })}>
                    <Input.Box>
                      <Input.Field aria-label={t("tools.edit.envName")} className="font-mono text-xs" />
                    </Input.Box>
                  </Input.Root>
                  <Input.Root fullWidth value={row.value} onChange={(v: string) => setEnv(i, { ...row, value: v })}>
                    <Input.Box>
                      <Input.Field aria-label={t("tools.edit.envValue")} className="font-mono text-xs" />
                    </Input.Box>
                  </Input.Root>
                  <Button size="icon-sm" emphasis="low" aria-label={t("tools.edit.envRemove", { name: row.name })} title={t("tools.edit.envRemove", { name: row.name })} onClick={() => setEnv(i, null)}>
                    <XIcon size="sm" />
                  </Button>
                </div>
              ))}
              {faulty === "env" ? <Typography variant="body-sm" intent="danger">{message}</Typography> : null}
              <Button size="sm" emphasis="low" intent="brand" className="self-start" startIcon={<PlusIcon size="sm" />} onClick={() => set("env", [...form.env, { name: "", value: "" }])}>
                {t("tools.edit.envAdd")}
              </Button>
            </div>

            <div className="flex flex-col border-t border-border-subtle">
              <SettingRow
                className="border-b border-border-subtle"
                label={t("tools.edit.exclusive")}
                description={t("tools.edit.exclusiveHelp")}
                controlId="tool-exclusive"
                control={<Switch id="tool-exclusive" size="xs" checked={form.exclusive} onCheckedChange={(on) => set("exclusive", on)} />}
              />
              <SettingRow
                className="border-b border-border-subtle"
                label={t("tools.edit.deployBefore")}
                description={t("tools.edit.deployBeforeHelp")}
                controlId="tool-deploy"
                control={<Switch id="tool-deploy" size="xs" checked={form.deployBefore} onCheckedChange={(on) => set("deployBefore", on)} />}
              />
            </div>
            {error && faulty === null ? <Typography variant="body-sm" intent="danger">{message}</Typography> : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button emphasis="high" loading={busy} disabled={busy} onClick={() => void submit()}>
            {t("tools.edit.save")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

/** The field a tool_invalid error points at (the backend says the reason and, for a variable, which one). */
function fieldOf(error: UIError | null, form: ToolInput): Field | null {
  if (!error || error.code !== "tool_invalid") return null;
  const { reason, detail = "" } = error.params;
  switch (reason) {
    case "name":
      return "name";
    case "executable":
    case "extension":
      return "exe";
    case "env_name":
    case "env_repeated":
      return "env";
    case "variable":
    case "syntax": {
      const fields: [Field, string][] = [
        ["args", form.args],
        ["exe", form.exe],
        ["workDir", form.workDir],
        ["icon", form.icon],
        ["env", form.env.map((e) => e.value).join(" ")],
      ];
      return fields.find(([, text]) => detail !== "" && text.includes(detail))?.[0] ?? "args";
    }
  }
  return null;
}
