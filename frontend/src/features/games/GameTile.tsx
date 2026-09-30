import type { ReactNode } from "react";
import { Ellipsis, Info, type LucideIcon } from "lucide-react";
import { Button, Card, Menu, Popover, Typography } from "dettmann-ui";
import { useI18n } from "../../i18n/i18n";

export interface TileAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
}

interface GameTileProps {
  layout: "grid" | "list";
  title: string;
  subtitle?: string;
  /** Short facts under the title (store, version). */
  meta: string[];
  badges?: ReactNode;
  primary?: { label: string; onClick: () => void; variant?: "primary" | "outline" };
  menu: TileAction[];
  /** Content of the details popover (GameInfoPopover in Vortex). */
  details?: ReactNode;
  dimmed?: boolean;
}

/**
 * One game in the Games screen, as a grid card or a list row (paridade
 * Vortex GameThumbnail). Composition only: actions and texts come from the
 * caller, which gets them from the backend state.
 */
export function GameTile({ layout, title, subtitle, meta, badges, primary, menu, details, dimmed }: GameTileProps) {
  const { t } = useI18n();
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      {primary ? (
        <Button size="sm" variant={primary.variant ?? "primary"} onClick={primary.onClick}>
          {primary.label}
        </Button>
      ) : null}
      {details ? (
        <Popover.Root placement="bottom-end">
          <Popover.Trigger>
            <Button size="icon-sm" variant="ghost" aria-label={t("games.details", { name: title })}>
              <Info aria-hidden="true" className="h-4 w-4" />
            </Button>
          </Popover.Trigger>
          <Popover.Content className="w-[26rem] max-w-[90vw]">{details}</Popover.Content>
        </Popover.Root>
      ) : null}
      {menu.length > 0 ? (
        <Menu.Root placement="bottom-end">
          <Menu.Trigger>
            <Button size="icon-sm" variant="ghost" aria-label={t("games.moreActions", { name: title })}>
              <Ellipsis aria-hidden="true" className="h-4 w-4" />
            </Button>
          </Menu.Trigger>
          <Menu.Content>
            {menu.map((action) => (
              <Menu.Item key={action.id} disabled={action.disabled} onSelect={action.onSelect}>
                <span className="flex items-center gap-2">
                  {action.icon ? <action.icon aria-hidden="true" className="h-4 w-4" /> : null}
                  {action.label}
                </span>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Root>
      ) : null}
    </div>
  );

  const text = (
    <div className="min-w-0 flex-1">
      <Typography variant="heading-6" color="fg" className="truncate">
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="body-sm" color="muted-fg" className="truncate">
          {subtitle}
        </Typography>
      ) : null}
      {meta.length > 0 ? (
        <Typography variant="caption" color="muted-fg" className="mt-1 block truncate tabular-nums">
          {meta.join(" · ")}
        </Typography>
      ) : null}
    </div>
  );

  if (layout === "list") {
    return (
      <Card.Root className={`flex items-center gap-4 px-4 py-3 ${dimmed ? "opacity-70" : ""}`}>
        {text}
        {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
        {actions}
      </Card.Root>
    );
  }
  return (
    <Card.Root className={`flex h-full flex-col gap-3 p-4 ${dimmed ? "opacity-70" : ""}`}>
      {text}
      {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
      <div className="mt-auto flex justify-end">{actions}</div>
    </Card.Root>
  );
}
