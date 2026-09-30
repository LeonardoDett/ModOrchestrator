import { Badge, Stack, Typography } from "dettmann-ui";
import type { DiscoveredGame, ManagedGame } from "../../bridge/types";
import { useI18n, type MessageKey } from "../../i18n/i18n";
import { useFindingLabel } from "./ForeignAlert";

export function useStoreLabel() {
  const { t, has } = useI18n();
  return (store: string) => {
    const key = `store.${store}`;
    return has(key) ? t(key) : store;
  };
}

function Path({ label, value }: { label: MessageKey; value: string }) {
  const { t } = useI18n();
  return (
    <>
      <dt className="text-fg-muted">{t(label)}</dt>
      <dd className="break-all font-mono text-xs text-fg">{value}</dd>
    </>
  );
}

/** Details of a managed instance (Vortex GameInfoPopover, core/11 §4). */
export function ManagedDetails({ game }: { game: ManagedGame }) {
  const { t } = useI18n();
  const store = useStoreLabel();
  const finding = useFindingLabel();
  return (
    <Stack gap="md">
      <Typography variant="heading-6" color="fg">
        {game.name}
      </Typography>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-fg-muted">{t("games.details.game")}</dt>
        <dd className="text-fg">{game.custom ? t("games.generic") : game.gameName}</dd>
        <dt className="text-fg-muted">{t("games.details.store")}</dt>
        <dd className="text-fg">{store(game.store)}</dd>
        {game.version ? (
          <>
            <dt className="text-fg-muted">{t("games.details.version")}</dt>
            <dd className="tabular-nums text-fg">{game.version}</dd>
          </>
        ) : null}
        <Path label="games.details.root" value={game.root} />
        {game.targets.map((target) => (
          <Path key={target.id} label="games.details.target" value={`${target.id}: ${target.path}`} />
        ))}
        <Path label="games.details.staging" value={game.staging} />
        <Path label="games.details.archives" value={game.archiveStore} />
        <Path label="games.details.backups" value={game.backupStore} />
        <dt className="text-fg-muted">{t("games.details.method")}</dt>
        <dd className="text-fg">{t(`method.${game.method}` as MessageKey)}</dd>
      </dl>
      {game.modTypes.length > 0 ? (
        <Stack gap="xs">
          <Typography variant="caption" color="muted-fg">
            {t("games.details.modTypes")}
          </Typography>
          <div className="flex flex-wrap gap-1.5">
            {game.modTypes.map((mt) => (
              <Badge key={mt.id} variant="outline">
                {mt.name} → {mt.target}
              </Badge>
            ))}
          </div>
        </Stack>
      ) : null}
      {game.capabilities.length > 0 ? (
        <Stack gap="xs">
          <Typography variant="caption" color="muted-fg">
            {t("games.details.capabilities")}
          </Typography>
          <div className="flex flex-wrap gap-1.5">
            {game.capabilities.map((c) => (
              <Badge key={c} variant="muted">
                {c}
              </Badge>
            ))}
          </div>
        </Stack>
      ) : null}
      {game.foreign.length > 0 ? (
        <Stack gap="xs">
          <Typography variant="caption" color="muted-fg">
            {t("foreign.title")}
          </Typography>
          <ul className="list-disc pl-5 text-sm text-fg">
            {game.foreign.map((f) => (
              <li key={`${f.kind}|${f.target ?? ""}|${f.name}`}>{finding(f)}</li>
            ))}
          </ul>
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Details of an installation found but not managed yet. */
export function DiscoveredDetails({ game }: { game: DiscoveredGame }) {
  const { t } = useI18n();
  const store = useStoreLabel();
  return (
    <Stack gap="md">
      <Typography variant="heading-6" color="fg">
        {game.gameName}
      </Typography>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-fg-muted">{t("games.details.store")}</dt>
        <dd className="text-fg">{store(game.store)}</dd>
        {game.version ? (
          <>
            <dt className="text-fg-muted">{t("games.details.version")}</dt>
            <dd className="tabular-nums text-fg">{game.version}</dd>
          </>
        ) : null}
        <Path label="games.details.root" value={game.root} />
      </dl>
    </Stack>
  );
}
