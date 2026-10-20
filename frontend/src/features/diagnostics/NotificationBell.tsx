import { useEffect, useRef, useState } from "react";
import { BellIcon, CircleCheckIcon, CircleXIcon, InfoIcon, XIcon } from "dettmann-ui/icons";
import { Badge, Button, FeaturedIcon, FilterChip, Popover, Typography, type IconComponent } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage } from "../../bridge/errors";
import { useNotifications } from "../../bridge/queries";
import type { AppNotification } from "../../bridge/types";
import { useI18n, type MessageKey, type Translator } from "../../i18n/i18n";
import { useNavigation } from "../../shell/navigation";
import { useAction } from "../games/use-action";
import { operationKindLabel } from "../operations/operation-labels";
import { SEVERITY_LOOK, diagnosticTitle, type ShownSeverity } from "./diagnostic-labels";

/** Title and detail of a notification, from its code and parameters (D044). */
export function notificationText(i18n: Translator, n: AppNotification): { title: string; detail?: string } {
  if (n.kind === "diagnostic") {
    return {
      title: diagnosticTitle(i18n, { code: n.code, params: n.params }),
      detail: n.count > 1 ? i18n.tp("notif.more", n.count - 1) : undefined,
    };
  }
  if (n.kind === "info") {
    // Something the system did or found on its own (app update, D104).
    const key = `notif.${n.code}`;
    return { title: i18n.has(key) ? i18n.t(key as MessageKey, n.params) : n.code };
  }
  const kind = operationKindLabel(i18n, n.params.kind ?? "");
  const base = `notif.${n.code}`;
  const key = n.count > 1 && i18n.has(`${base}.many`) ? `${base}.many` : base;
  const title = i18n.has(key) ? i18n.t(key as MessageKey, { kind, count: n.count }) : n.code;
  if (!n.params.error) return { title };
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(n.params)) if (k.startsWith("error.")) params[k.slice(6)] = v;
  return { title, detail: errorMessage(i18n, { code: n.params.error, params }) };
}

function lookOf(n: AppNotification): (typeof SEVERITY_LOOK)[ShownSeverity] | null {
  const s = n.severity as ShownSeverity;
  return s in SEVERITY_LOOK ? SEVERITY_LOOK[s] : null;
}

/** What a row offers to do, by kind (board JogoNotificacoes); null: nothing. */
function actionOf(n: AppNotification): MessageKey | null {
  if (n.kind === "diagnostic") return "notif.action.problem";
  if (n.code === "app_update_available") return "notif.action.update";
  if (n.kind === "operation_result" && n.params.error) return "notif.action.operation";
  return null;
}

/** The mark of a row: severity of a problem, outcome of an operation. */
function markOf(n: AppNotification): { icon: IconComponent; intent: "danger" | "warning" | "info" | "success" } {
  const look = lookOf(n);
  if (n.kind === "operation_result" && n.params.error) return { icon: CircleXIcon, intent: "danger" };
  if (n.kind === "operation_result" && n.severity !== "warning") return { icon: CircleCheckIcon, intent: "success" };
  if (look) return { icon: look.icon, intent: look.intent };
  return { icon: InfoIcon, intent: "info" };
}

type Filter = "all" | "unread" | "action";

interface NotificationBellProps {
  onOpenOperations: () => void;
}

/**
 * Notification center (board JogoNotificacoes, ui/00 §2.3, core/10 §2):
 * what happened and should be read, with lida/não lida, the action of
 * each row, filters, "mark all as read" and "clear read". A problem that
 * persists is also a diagnostic; dismissing here never hides it. Also
 * raises the Windows notification of a long operation that ended while the
 * window was in the background (setting ui.desktopNotifications, decided by
 * the backend; the text is translated here).
 */
export function NotificationBell({ onOpenOperations }: NotificationBellProps) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const backend = useBackend();
  const run = useAction();
  const { navigate } = useNavigation();
  const list = useNotifications(50);
  const items = list.status === "ready" ? list.data : [];
  const unread = items.filter((n) => n.state === "unread").length;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const shown = items.filter((n) => (filter === "unread" ? n.state === "unread" : filter === "action" ? actionOf(n) !== null : true));
  const read = items.filter((n) => n.state === "read").map((n) => n.id);

  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;
  useEffect(() => {
    if (!backend.connected) return;
    return backend.onOperationEvent((event) => {
      if (event?.type !== "notification.created" || event.data?.desktop !== "true" || document.hasFocus()) return;
      const id = event.data.notification ?? "";
      void backend
        .notifications(20)
        .then((all) => {
          const n = all?.find((x) => x.id === id);
          if (!n) return;
          const text = notificationText(i18nRef.current, n);
          return backend.sendDesktopNotification(n.id, text.title, text.detail ?? i18nRef.current.t("app.name"));
        })
        .catch(() => undefined);
    });
  }, [backend]);

  const act = (n: AppNotification) => {
    if (n.state === "unread") void run(() => backend.markNotificationsRead([n.id]));
    setOpen(false);
    if (n.kind === "diagnostic") {
      navigate({ view: "diagnostics", tab: "problems", diagnostic: n.params.key ?? n.code });
    } else if (n.code === "app_update_available") {
      navigate({ view: "settings", settingsTab: "application" });
    } else {
      onOpenOperations();
    }
  };

  if (!backend.connected) return null;
  return (
    <Popover.Root placement="bottom-end" open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button
          emphasis="low"
          size="icon"
          aria-label={unread > 0 ? `${t("topbar.notifications")}: ${tp("topbar.notificationsUnread", unread)}` : t("topbar.notifications")}
          title={t("topbar.notifications")}
          badge={unread > 0 ? unread : undefined}
          badgeIntent="warning"
        >
          <BellIcon size="sm" />
        </Button>
      </Popover.Trigger>
      <Popover.Content aria-label={t("notif.title")} className="flex max-h-[min(43.75rem,85vh)] w-[27.5rem] max-w-[92vw] flex-col overflow-hidden p-0">
        <div data-layer="medium" className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border bg-structure pl-4 pr-3">
          <span className="text-md font-semibold text-fg">{t("notif.title")}</span>
          <span className="flex-1 text-xs text-fg-muted">{unread > 0 ? tp("notif.unreadCount", unread) : null}</span>
          <Button size="sm" emphasis="low" intent="brand" disabled={unread === 0} onClick={() => void run(() => backend.markNotificationsRead([]))}>
            {t("notif.markAllRead")}
          </Button>
        </div>
        <FilterChip.Group
          type="single"
          aria-label={t("notif.filter")}
          value={[filter]}
          onValueChange={(v) => setFilter((v[0] as Filter | undefined) ?? "all")}
          className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border-subtle px-4"
        >
          {(["all", "unread", "action"] as const).map((f) => (
            <FilterChip key={f} value={f} tone="neutral">
              {t(`notif.filter.${f}` as MessageKey)}
            </FilterChip>
          ))}
        </FilterChip.Group>
        {shown.length === 0 ? (
          <Typography variant="body-sm" color="muted-fg" className="block flex-1 px-4 py-8 text-center">
            {t("notif.empty")}
          </Typography>
        ) : (
          <ul className="min-h-0 flex-1 overflow-auto" aria-label={t("notif.title")}>
            {shown.map((n) => {
              const text = notificationText(i18n, n);
              const mark = markOf(n);
              const action = actionOf(n);
              const isUnread = n.state === "unread";
              return (
                <li
                  key={n.id}
                  className={`grid grid-cols-[0.5rem_2rem_minmax(0,1fr)_1.5rem] gap-2.5 border-b border-border-subtle px-2.5 py-3 ${isUnread ? "state-layer-hover" : ""}`}
                >
                  <span
                    role="img"
                    aria-label={isUnread ? t("notif.unread") : t("notif.read")}
                    className={`mt-3 size-2 rounded-pill ${isUnread ? "bg-brand-fill" : ""}`}
                  />
                  <FeaturedIcon shape="tile" icon={mark.icon} intent={mark.intent} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className={`text-sm leading-snug text-fg ${isUnread ? "font-semibold" : "font-medium"}`}>{text.title}</span>
                    {text.detail ? <span className="text-xs leading-snug text-fg-muted">{text.detail}</span> : null}
                    <span className="mt-0.5 flex items-center gap-2">
                      {action ? (
                        <Button size="sm" onClick={() => act(n)}>
                          {t(action)}
                        </Button>
                      ) : null}
                      <time dateTime={n.updatedAt} className="text-xs text-fg-subtle">
                        {i18n.formatAgo(n.updatedAt)}
                      </time>
                      {n.params.auto === "true" ? (
                        <Badge emphasis="low" size="sm">
                          {t("notif.auto")}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                  <Button
                    size="icon-sm"
                    emphasis="low"
                    aria-label={t("notif.dismissOne", { title: text.title })}
                    title={t("notif.dismiss")}
                    onClick={() => void run(() => backend.dismissNotifications([n.id]))}
                  >
                    <XIcon size="sm" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div data-layer="medium" className="flex h-12 shrink-0 items-center gap-2 border-t border-border bg-structure pl-4 pr-3">
          <Button
            size="inline"
            emphasis="low"
            className="flex-1 text-sm"
            onClick={() => {
              setOpen(false);
              navigate({ view: "diagnostics", tab: "problems" });
            }}
          >
            {t("notif.seeAll")}
          </Button>
          <Button size="sm" emphasis="low" disabled={read.length === 0} onClick={() => void run(() => backend.dismissNotifications(read))}>
            {t("notif.clearRead")}
          </Button>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
