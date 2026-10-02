import { useEffect, useRef } from "react";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { Badge, Button, Inline, Popover, Stack, Typography } from "dettmann-ui";
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

interface NotificationBellProps {
  onOpenOperations: () => void;
}

/**
 * Notification center (ui/00 §2.3, core/10 §2): what happened and should
 * be read, with lida/não lida, actions and "mark all as read". A problem
 * that persists is also a diagnostic; dismissing here never hides it.
 * Also raises the Windows notification of a long operation that ended
 * while the window was in the background (setting ui.desktopNotifications,
 * decided by the backend; the text is translated here).
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

  const open = (n: AppNotification) => {
    if (n.state === "unread") void run(() => backend.markNotificationsRead([n.id]));
    if (n.kind === "diagnostic") {
      navigate({ view: "diagnostics", tab: "problems", diagnostic: n.params.key ?? n.code });
    } else {
      onOpenOperations();
    }
  };

  if (!backend.connected) return null;
  return (
    <Popover.Root placement="bottom-end">
      <Popover.Trigger>
        <Button
          variant="ghost"
          size="sm"
          aria-label={unread > 0 ? `${t("topbar.notifications")}: ${tp("topbar.notificationsUnread", unread)}` : t("topbar.notifications")}
          startIcon={<Bell aria-hidden="true" className="h-4 w-4" />}
        >
          {unread > 0 ? (
            <Badge tone="primary" size="sm" aria-hidden="true">
              {unread}
            </Badge>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Content className="w-[26rem] max-w-[90vw] p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Typography variant="heading-6" className="flex-1">
            {t("notif.title")}
          </Typography>
          <Button size="sm" variant="ghost" disabled={unread === 0} startIcon={<CheckCheck aria-hidden="true" className="h-4 w-4" />} onClick={() => void run(() => backend.markNotificationsRead([]))}>
            {t("notif.markAllRead")}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("notif.dismissAll")} disabled={items.length === 0} onClick={() => void run(() => backend.dismissNotifications([]))}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        {items.length === 0 ? (
          <Typography variant="body-sm" color="muted-fg" className="block px-4 py-6 text-center">
            {t("notif.empty")}
          </Typography>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-auto" aria-label={t("notif.title")}>
            {items.map((n) => {
              const text = notificationText(i18n, n);
              const look = lookOf(n);
              const Icon = look?.icon ?? Bell;
              return (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${look?.className ?? "text-fg-muted"}`} />
                  <Stack gap="xs" className="min-w-0 flex-1">
                    <Typography variant="body-sm" className={n.state === "unread" ? "font-semibold" : undefined}>
                      {text.title}
                    </Typography>
                    {text.detail ? (
                      <Typography variant="caption" color="muted-fg">
                        {text.detail}
                      </Typography>
                    ) : null}
                    <Inline gap="xs">
                      <Typography variant="caption" color="muted-fg">
                        <time dateTime={n.updatedAt}>{i18n.formatDateTime(n.updatedAt)}</time>
                      </Typography>
                      {n.state === "unread" ? (
                        <Badge tone="primary" size="sm">
                          {t("notif.unread")}
                        </Badge>
                      ) : null}
                      {n.params.auto === "true" ? (
                        <Badge variant="muted" size="sm">
                          {t("notif.auto")}
                        </Badge>
                      ) : null}
                    </Inline>
                  </Stack>
                  <Button size="sm" variant="outline" onClick={() => open(n)}>
                    {t("notif.open")}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t("notif.dismiss")} onClick={() => void run(() => backend.dismissNotifications([n.id]))}>
                    <X aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
