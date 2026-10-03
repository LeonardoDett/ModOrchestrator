import { useMemo, useState } from "react";
import { Puzzle, X } from "lucide-react";
import { Alert, Badge, Button, DataTable, Inspector, Spinner, Stack, Tag, Typography, type DataTableColumn } from "dettmann-ui";
import { useSettings } from "../app/settings-context";
import { useExtensions } from "../bridge/queries";
import type { Extension } from "../bridge/types";
import { ErrorAlert } from "../features/feedback/ErrorAlert";
import { useI18n, type Translator } from "../i18n/i18n";
import { HonestEmpty, PageBody } from "./PageBody";

/** Label of a capability code (core/11 §1 catalog), by code (D044). */
export function capabilityLabel(i18n: Translator, cap: string): string {
  const key = `capability.${cap}`;
  return i18n.has(key) ? i18n.t(key) : cap;
}

/**
 * Extensions (ui/telas/settings-extensions.md, core/11 §7): in V1 the list
 * of built-in adapters (name, version, games, capabilities, type
 * "Embutido", state "Ativo") with an Inspector. Third-party extensions are
 * V2: the screen says so and offers no install/search/update action
 * (anti-pattern 18).
 */
export function ExtensionsPage() {
  const i18n = useI18n();
  const { t } = i18n;
  const { density } = useSettings();
  const query = useExtensions();
  const [selected, setSelected] = useState<string | null>(null);

  const columns = useMemo<DataTableColumn<Extension>[]>(
    () => [
      { id: "name", label: t("extensions.column.name"), cell: (e) => e.name, width: 180, grow: true },
      { id: "version", label: t("extensions.column.version"), cell: (e) => e.version, width: 110 },
      { id: "games", label: t("extensions.column.games"), cell: (e) => e.games.map((g) => g.name).join(", "), width: 260, grow: true },
      { id: "type", label: t("extensions.column.type"), cell: (e) => <Badge variant="outline">{t(e.builtIn ? "extensions.builtIn" : "extensions.external")}</Badge>, width: 130 },
      { id: "state", label: t("extensions.column.state"), cell: (e) => <Badge tone={e.active ? "success" : undefined}>{t(e.active ? "extensions.active" : "extensions.inactive")}</Badge>, width: 110 },
    ],
    [t],
  );

  let body;
  switch (query.status) {
    case "loading":
      body = <Spinner label={t("common.loading")} />;
      break;
    case "unavailable":
      body = (
        <Alert.Root variant="info">
          <Alert.Description>{t("app.offlineHint")}</Alert.Description>
        </Alert.Root>
      );
      break;
    case "error":
      body = <ErrorAlert title="extensions.loadError" error={query.error} onRetry={query.reload} />;
      break;
    case "ready": {
      const current = query.data.find((e) => e.name === selected) ?? null;
      body =
        query.data.length === 0 ? (
          <HonestEmpty icon={Puzzle} title="extensions.emptyTitle" description="extensions.emptyDescription" />
        ) : (
          <div className="flex min-h-0 flex-1 gap-4">
            <DataTable
              aria-label={t("nav.extensions")}
              className="min-h-0 flex-1"
              columns={columns}
              rows={query.data}
              getRowId={(e) => e.name}
              density={density}
              selectionMode="single"
              selectedIds={selected ? new Set([selected]) : new Set()}
              onSelectedIdsChange={(ids) => setSelected(ids.values().next().value ?? null)}
              labels={{ resizeColumn: t("table.resizeColumn"), loading: t("common.loading") }}
            />
            {current ? <ExtensionInspector extension={current} onClose={() => setSelected(null)} /> : null}
          </div>
        );
    }
  }

  return (
    <PageBody fill>
      <Stack gap="md" className="min-h-0 flex-1">
        <Alert.Root variant="info">
          <Alert.Description>{t("extensions.thirdPartyLater")}</Alert.Description>
        </Alert.Root>
        {body}
      </Stack>
    </PageBody>
  );
}

function ExtensionInspector({ extension, onClose }: { extension: Extension; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <Inspector
      sticky={false}
      aria-label={extension.name}
      title={extension.name}
      description={t("extensions.versionLine", { version: extension.version })}
      className="flex w-[22rem] shrink-0 flex-col overflow-auto rounded-xl border"
      actions={
        <Button variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={onClose}>
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      }
    >
      <Stack gap="md">
        <div className="flex gap-2">
          <Badge variant="outline">{t(extension.builtIn ? "extensions.builtIn" : "extensions.external")}</Badge>
          <Badge tone={extension.active ? "success" : undefined}>{t(extension.active ? "extensions.active" : "extensions.inactive")}</Badge>
        </div>
        {extension.games.map((g) => (
          <Stack key={g.id} gap="xs" as="section" aria-label={g.name}>
            <Typography variant="label">{g.name}</Typography>
            {g.custom ? (
              <Typography variant="caption" color="muted-fg">
                {t("extensions.customTargets")}
              </Typography>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {g.capabilities.map((c) => (
                <Tag key={c} size="sm">
                  {capabilityLabel(i18n, c)}
                </Tag>
              ))}
            </div>
          </Stack>
        ))}
      </Stack>
    </Inspector>
  );
}
