import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Users } from "lucide-react";
import {
  CheckIcon,
  GitCompareIcon,
  LayersIcon,
  ListOrderedIcon,
  MinusIcon,
  PackageIcon,
  PuzzleIcon,
  SearchIcon,
  XIcon,
} from "dettmann-ui/icons";
import { Alert, Button, Checkbox, Indicator, Input, Loader, Modal, Progress, Radio, StatTile, Tag } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import type { ImportPart, ImportPreview, ImportSource } from "../../bridge/types";
import { useAction } from "../games/use-action";
import { gameInitials } from "../games/GameSwitcher";
import { formatSize } from "../mods/mod-labels";
import { ErrorAlert } from "../feedback/ErrorAlert";
import { toUIError, type UIError } from "../../bridge/errors";
import { useI18n, type MessageKey } from "../../i18n/i18n";

/** Where the dialogs were opened from: adding a game, or Mods › Importar. */
export type ImportContext = "add" | "mods";

const MONOGRAM: Record<string, string> = { vortex: "VX", mo2: "MO2" };

function managerName(t: (k: MessageKey) => string, s: ImportSource): string {
  const key = `import.manager.${s.manager}` as MessageKey;
  return t(key);
}

/** Small uppercase title of a block (boards). */
function BlockTitle({ children }: { children: ReactNode }) {
  return <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">{children}</span>;
}

function Monogram({ text, large }: { text: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center border border-border bg-sunken font-bold text-fg-muted ${large ? "size-11 rounded-card text-xs" : "size-9 rounded-control text-[0.6875rem]"}`}
    >
      {text}
    </span>
  );
}

/** "Importar tudo" says what comes: rules and plugins only when there are. */
const ALL_TEXT: Record<string, MessageKey> = {
  "rules-plugins": "import.all.descriptionPlugins",
  "rules-noPlugins": "import.all.description",
  "noRules-plugins": "import.all.descriptionNoRulesPlugins",
  "noRules-noPlugins": "import.all.descriptionNoRules",
};

/** Everything a profile list chooses by default: all of them. */
const allProfiles = (pv: ImportPreview) => pv.profiles.map((p) => p.name);

function rulesCount(pv: ImportPreview) {
  return pv.orderRules + pv.dependencies + pv.incompatibilities;
}

/**
 * The offer to import from another manager (board ImportarOferta): one card
 * per source found, what comes and what does not, "Importar tudo",
 * "Escolher o que importar" and "Começar do zero".
 */
export function ImportOfferDialog({
  instance,
  gameName,
  gameRoot,
  context,
  sources: given,
  onClose,
  onStarted,
}: {
  instance: string;
  gameName: string;
  gameRoot?: string;
  context: ImportContext;
  sources?: ImportSource[];
  onClose: () => void;
  onStarted: (operation: string) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const [sources, setSources] = useState<ImportSource[] | null>(given ?? null);
  const [previews, setPreviews] = useState<Record<number, ImportPreview | UIError>>({});
  const [selected, setSelected] = useState(0);
  const [choosing, setChoosing] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (given) return;
    void run(() => backend.importSources(instance), { quiet: true }).then((r) => setSources(r.ok ? r.value : []));
  }, [backend, given, instance, run]);

  useEffect(() => {
    if (!sources) return;
    let live = true;
    sources.forEach((s, i) => {
      backend.importPreview(instance, s).then(
        (pv) => live && setPreviews((cur) => ({ ...cur, [i]: pv })),
        (raw) => live && setPreviews((cur) => ({ ...cur, [i]: toUIError(raw) })),
      );
    });
    return () => {
      live = false;
    };
  }, [backend, instance, sources]);

  const pointFolder = async () => {
    const picked = await run(() => backend.pickFolder(t("import.pointFolder")), { quiet: true });
    if (!picked.ok || !picked.value) return;
    const found = await run(() => backend.importOpenFolder(picked.value as string));
    if (found.ok && found.value.length > 0) {
      setPreviews({});
      setSelected(0);
      setSources(found.value);
    }
  };

  const source = sources?.[selected];
  const current = previews[selected];
  const pv = current && "parts" in current ? current : null;
  const name = source ? managerName(t, source) : "";

  const importAll = async () => {
    if (!source || !pv) return;
    setBusy(true);
    const r = await run(() => backend.importStart(instance, source, { parts: pv.defaults, profiles: allProfiles(pv), exclude: [] }));
    setBusy(false);
    if (r.ok) onStarted(r.value);
  };

  if (choosing && source) {
    return (
      <ImportChoiceDialog
        instance={instance}
        gameName={gameName}
        context={context}
        preview={choosing}
        onBack={() => setChoosing(null)}
        onClose={onClose}
        onStarted={onStarted}
      />
    );
  }

  const chips = (p: ImportPreview | null, s: ImportSource) => {
    if (!p) return <Loader size="sm" label={t("common.loading")} />;
    const out: { icon: ComponentType<{ className?: string }>; text: string }[] = [
      { icon: PackageIcon, text: t("import.chip.mods", { count: i18n.formatNumber(p.mods), active: i18n.formatNumber(p.active) }) },
    ];
    if (p.parts.includes("order") && p.separators > 0) out.push({ icon: ListOrderedIcon, text: t("import.chip.order", { count: i18n.formatNumber(p.separators) }) });
    if (rulesCount(p) > 0) out.push({ icon: GitCompareIcon, text: t("import.chip.rules", { count: i18n.formatNumber(rulesCount(p)) }) });
    out.push({ icon: Users, text: t("import.chip.profiles", { count: i18n.formatNumber(p.profiles.length) }) });
    if (p.parts.includes("plugins")) out.push({ icon: PuzzleIcon, text: t("import.chip.plugins", { count: i18n.formatNumber(p.plugins) }) });
    void s;
    return (
      <span className="flex flex-wrap gap-1.5">
        {out.map((c) => (
          <Indicator key={c.text} variant="chip" size="sm" icon={c.icon} label={c.text} />
        ))}
      </span>
    );
  };

  const allText = pv
    ? t(ALL_TEXT[`${rulesCount(pv) > 0 ? "rules" : "noRules"}-${pv.parts.includes("plugins") ? "plugins" : "noPlugins"}`] ?? "import.all.description", {
        mods: i18n.formatNumber(pv.mods),
        rules: i18n.formatNumber(rulesCount(pv)),
        perfis: i18n.formatNumber(pv.profiles.length),
        size: formatSize(i18n.language, pv.size),
        free: pv.freeSpace >= 0 ? formatSize(i18n.language, pv.freeSpace) : "?",
      })
    : "";

  return (
    <Modal.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Modal.Content size="custom" className="flex h-[min(48.75rem,95vh)] w-full max-w-[min(67.5rem,96vw)] flex-col" aria-describedby="import-offer-help">
        <Modal.Header>
          <Monogram text={gameInitials(gameName)} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Modal.Title>{context === "add" ? t("import.offer.titleAdd", { game: gameName }) : t("import.offer.titleMods")}</Modal.Title>
            <span className="truncate font-mono text-xs text-fg-muted">{gameRoot ?? sources?.[0]?.gamePath ?? ""}</span>
          </div>
          <Button size="icon" emphasis="low" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
            <XIcon size="sm" />
          </Button>
        </Modal.Header>
        <Modal.Body padding="none" className="grid min-h-0 grid-cols-[minmax(0,1fr)_25rem]">
          <div className="flex min-w-0 flex-col gap-4.5 overflow-auto border-r border-border p-6">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-xl font-semibold text-fg">{t("import.offer.heading")}</h2>
              <p id="import-offer-help" className="text-sm leading-normal text-fg-muted">
                {t("import.offer.help")}
              </p>
            </div>
            {sources === null ? <Loader label={t("common.loading")} /> : null}
            {sources !== null && sources.length === 0 ? (
              <Alert.Root intent="info">
                <Alert.Title>{t("import.none.title")}</Alert.Title>
                <Alert.Description>{t("import.none.description")}</Alert.Description>
              </Alert.Root>
            ) : null}
            {sources && sources.length > 0 ? (
              <Radio.Group name="import-source" aria-label={t("import.offer.sources")} value={String(selected)} onValueChange={(v) => setSelected(Number(v))} className="gap-2.5">
                {sources.map((s, i) => {
                  const p = previews[i];
                  return (
                    <Radio.Item key={`${s.manager}-${s.path}-${s.gameRef}`} value={String(i)} variant="card" media={<Monogram large text={MONOGRAM[s.manager] ?? s.manager.slice(0, 3).toUpperCase()} />}>
                      <span className="flex min-w-0 flex-col gap-2">
                        <span className="flex min-w-0 items-baseline gap-2.5">
                          <span className="shrink-0 whitespace-nowrap text-md font-semibold text-fg">{managerName(t, s)}</span>
                          <span className="truncate font-mono text-xs text-fg-muted">{s.location || s.path}</span>
                        </span>
                        {p && !("parts" in p) ? <span className="text-xs text-danger">{t("import.offer.unreadable")}</span> : chips(p && "parts" in p ? p : null, s)}
                      </span>
                    </Radio.Item>
                  );
                })}
              </Radio.Group>
            ) : null}
            {current && !("parts" in current) ? <ErrorAlert title="import.offer.unreadable" error={current} /> : null}
            {pv?.deployed ? (
              <Alert.Root band intent="warning">
                <Alert.Description>{t("import.offer.deployed", { manager: name })}</Alert.Description>
              </Alert.Root>
            ) : null}
            <div className="mt-auto flex flex-col gap-2.5">
              <Button
                size="tile-lg"
                emphasis="high"
                startIcon={<PackageIcon size="md" />}
                disabled={!pv || busy}
                loading={busy}
                description={allText}
                onClick={() => void importAll()}
              >
                {t("import.all.title", { manager: name })}
              </Button>
              <div className="grid grid-cols-2 gap-2.5">
                <Button size="tile" disabled={!pv || busy} description={t("import.choose.description")} onClick={() => pv && setChoosing(pv)}>
                  {t("import.choose.title")}
                </Button>
                {context === "add" ? (
                  <Button size="tile" disabled={busy} description={t("import.fresh.description")} onClick={onClose}>
                    {t("import.fresh.title")}
                  </Button>
                ) : (
                  <Button size="tile" disabled={busy} description={t("import.point.description")} onClick={() => void pointFolder()}>
                    {t("import.pointFolder")}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <aside aria-label={t("import.comes.title", { manager: name })} className="flex min-w-0 flex-col gap-4.5 overflow-auto bg-sunken px-5 py-6">
            <div className="flex flex-col gap-2.5">
              <BlockTitle>{t("import.comes.title", { manager: name })}</BlockTitle>
              {comes(pv).map((k) => (
                <Fact key={k} icon={<CheckIcon size="sm" className="text-success" />} title={t(`import.comes.${k}` as MessageKey)} text={t(`import.comes.${k}.text` as MessageKey)} />
              ))}
            </div>
            <div className="h-px bg-border-subtle" />
            <div className="flex flex-col gap-2.5">
              <BlockTitle>{t("import.notComes.title")}</BlockTitle>
              {(["installers", "downloads", "saves"] as const).map((k) => (
                <Fact
                  key={k}
                  muted
                  icon={<MinusIcon size="sm" className="text-fg-muted" />}
                  title={t(`import.notComes.${k}` as MessageKey)}
                  text={t(`import.notComes.${k}.text` as MessageKey, { manager: name })}
                />
              ))}
            </div>
          </aside>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

/** What comes, in the board's order, from the parts the source has. */
function comes(pv: ImportPreview | null): string[] {
  if (!pv) return ["mods"];
  const out = ["mods"];
  if (pv.parts.includes("order")) out.push("order");
  if (pv.parts.includes("rules")) out.push("rules");
  if (pv.profiles.length > 0) out.push("profiles");
  if (pv.parts.includes("plugins")) out.push("plugins");
  return out;
}

function Fact({ icon, title, text, muted }: { icon: ReactNode; title: string; text: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-sm">
      <span className="pt-0.5">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className={muted ? "text-fg-muted" : "text-fg"}>{title}</span>
        <span className="text-xs leading-snug text-fg-muted">{text}</span>
      </span>
    </div>
  );
}

function PartIcon({ icon: I }: { icon: ComponentType<{ size?: "sm" | "md" }> }) {
  return (
    <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-control bg-raised text-fg-muted">
      <I size="md" />
    </span>
  );
}

/**
 * Choosing what to import (board ImportarEscolha): the parts, the profiles,
 * the mods ("Escolher mods") and the summary with the disk space.
 */
export function ImportChoiceDialog({
  instance,
  gameName,
  context,
  preview: pv,
  onBack,
  onClose,
  onStarted,
}: {
  instance: string;
  gameName: string;
  context: ImportContext;
  preview: ImportPreview;
  onBack: () => void;
  onClose: () => void;
  onStarted: (operation: string) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const name = managerName(t, pv.source);
  const [parts, setParts] = useState<Set<ImportPart>>(new Set<ImportPart>(["mods", ...pv.defaults]));
  const [profiles, setProfiles] = useState<Set<string>>(new Set(allProfiles(pv)));
  const [exclude, setExclude] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (p: ImportPart, on: boolean) =>
    setParts((cur) => {
      const next = new Set(cur);
      if (on) next.add(p);
      else next.delete(p);
      if (p === "plugins") {
        if (on && pv.parts.includes("load_order")) next.add("load_order");
        if (!on) next.delete("load_order");
      }
      return next;
    });
  const has = (p: ImportPart) => parts.has(p);

  const chosenMods = pv.modList.filter((m) => !exclude.has(m.key));
  const size = chosenMods.reduce((n, m) => n + m.size, 0);
  const rules = has("rules") ? rulesCount(pv) : 0;
  const plugins = has("plugins") ? pv.plugins : 0;
  const usage = pv.freeSpace > 0 ? Math.min(100, Math.round((size / pv.freeSpace) * 100)) : 0;
  const canStart = has("mods") && chosenMods.length > 0 && profiles.size > 0 && !busy && (pv.freeSpace < 0 || size <= pv.freeSpace);

  const start = async () => {
    setBusy(true);
    const r = await run(() =>
      backend.importStart(instance, pv.source, { parts: [...parts], profiles: pv.profiles.filter((p) => profiles.has(p.name)).map((p) => p.name), exclude: [...exclude] }),
    );
    setBusy(false);
    if (r.ok) onStarted(r.value);
  };

  return (
    <Modal.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Modal.Content size="custom" className="flex h-[min(48.75rem,95vh)] w-full max-w-[min(67.5rem,96vw)] flex-col" aria-describedby={undefined}>
        <Modal.Header>
          <Monogram text={MONOGRAM[pv.source.manager] ?? pv.source.manager.slice(0, 3).toUpperCase()} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Modal.Title>{t("import.choice.title", { manager: name })}</Modal.Title>
            <span className="truncate text-xs text-fg-muted">
              {gameName} · <span className="font-mono">{pv.source.location || pv.source.path}</span>
            </span>
          </div>
          <Button size="icon" emphasis="low" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
            <XIcon size="sm" />
          </Button>
        </Modal.Header>
        <Modal.Body padding="none" className="grid min-h-0 grid-cols-[minmax(0,1fr)_22.5rem]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-auto border-r border-border">
            <Checkbox
              variant="band"
              checked={has("mods")}
              onCheckedChange={(on) => toggle("mods", on)}
              media={<PartIcon icon={PackageIcon} />}
              label={t("import.part.mods")}
              description={t("import.part.mods.text", {
                chosen: i18n.formatNumber(chosenMods.length),
                total: i18n.formatNumber(pv.mods),
                size: formatSize(i18n.language, size),
              })}
              action={
                <Button size="sm" onClick={() => setPicking(true)}>
                  {t("import.part.pickMods")}
                </Button>
              }
            />
            {pv.parts.includes("order") ? (
              <Checkbox
                variant="band"
                checked={has("order")}
                onCheckedChange={(on) => toggle("order", on)}
                media={<PartIcon icon={ListOrderedIcon} />}
                label={t("import.part.order")}
                description={t("import.part.order.text", { count: i18n.formatNumber(pv.separators) })}
              />
            ) : null}
            {pv.parts.includes("rules") ? (
              <Checkbox
                variant="band"
                checked={has("rules")}
                onCheckedChange={(on) => toggle("rules", on)}
                media={<PartIcon icon={GitCompareIcon} />}
                label={t("import.part.rules")}
                description={t(rulesCount(pv) === pv.orderRules ? "import.part.rules.textOrder" : "import.part.rules.text", { count: i18n.formatNumber(rulesCount(pv)) })}
              />
            ) : null}
            {pv.parts.includes("plugins") ? (
              <Checkbox
                variant="band"
                checked={has("plugins")}
                onCheckedChange={(on) => toggle("plugins", on)}
                media={<PartIcon icon={PuzzleIcon} />}
                label={t("import.part.plugins")}
                description={t("import.part.plugins.text", { count: i18n.formatNumber(pv.plugins) })}
              />
            ) : null}
            {pv.parts.includes("categories") ? (
              <Checkbox
                variant="band"
                checked={has("categories")}
                onCheckedChange={(on) => toggle("categories", on)}
                media={<PartIcon icon={LayersIcon} />}
                label={t("import.part.categories", { manager: name })}
                description={t("import.part.categories.text", { count: i18n.formatNumber(pv.categories) })}
              />
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 pl-6 pr-5 pt-4 pb-4">
              <div className="flex items-baseline gap-2.5">
                <BlockTitle>{t("import.profiles.title")}</BlockTitle>
                <span className="text-xs text-fg-muted">
                  {t("import.profiles.chosen", { chosen: i18n.formatNumber(profiles.size), total: i18n.formatNumber(pv.profiles.length) })}
                </span>
              </div>
              <div role="group" aria-label={t("import.profiles.group")} className="overflow-hidden rounded-card border border-border">
                {pv.profiles.map((p) => (
                  <Checkbox
                    key={p.name}
                    variant="band-sm"
                    checked={profiles.has(p.name)}
                    onCheckedChange={(on) =>
                      setProfiles((cur) => {
                        const next = new Set(cur);
                        if (on) next.add(p.name);
                        else next.delete(p.name);
                        return next;
                      })
                    }
                    label={p.name}
                    description={
                      pv.parts.includes("plugins")
                        ? t("import.profiles.rowPlugins", { mods: i18n.formatNumber(p.enabled), plugins: i18n.formatNumber(p.plugins) })
                        : t("import.profiles.row", { mods: i18n.formatNumber(p.enabled) })
                    }
                    action={
                      <span className="flex items-center gap-3.5">
                        {p.active ? (
                          <Tag size="sm" shape="pill" outline={false} intent="brand">
                            {t("import.profiles.active", { manager: name })}
                          </Tag>
                        ) : null}
                        {p.lastUsed ? <span className="text-xs text-fg-muted">{t("import.profiles.used", { ago: i18n.formatAgo(p.lastUsed) })}</span> : null}
                      </span>
                    }
                  />
                ))}
              </div>
              <span className="text-xs text-fg-muted">{t("import.profiles.note")}</span>
            </div>
          </div>
          <aside aria-label={t("import.summary.title")} className="flex min-w-0 flex-col gap-4 overflow-auto bg-sunken p-5">
            <BlockTitle>{t("import.summary.title")}</BlockTitle>
            <StatTile.Grid columns={2} className="gap-2">
              <StatTile layout="inline" label={t("import.summary.mods")} value={i18n.formatNumber(has("mods") ? chosenMods.length : 0)} />
              <StatTile layout="inline" label={t("import.summary.rules")} value={i18n.formatNumber(rules)} />
              <StatTile layout="inline" label={t("import.summary.profiles")} value={i18n.formatNumber(profiles.size)} />
              <StatTile layout="inline" label={t("import.summary.plugins")} value={i18n.formatNumber(plugins)} />
            </StatTile.Grid>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-fg">{t("import.disk.title")}</span>
                <span className="text-fg-muted">
                  {pv.freeSpace >= 0
                    ? t("import.disk.value", { size: formatSize(i18n.language, size), free: formatSize(i18n.language, pv.freeSpace) })
                    : formatSize(i18n.language, size)}
                </span>
              </div>
              <Progress.Root value={usage} track="strong" className="h-1.5" aria-label={t("import.disk.label")} intent={usage > 90 ? "warning" : "brand"} />
              <span className="text-xs leading-snug text-fg-muted">{t("import.disk.note", { manager: name })}</span>
            </div>
            {pv.deployed ? (
              <Alert.Root band intent="warning">
                <Alert.Description>{t("import.choice.deployed", { manager: name })}</Alert.Description>
              </Alert.Root>
            ) : null}
            <div className="mt-auto flex flex-col gap-2">
              <Button emphasis="high" size="lg" fullWidth disabled={!canStart} loading={busy} onClick={() => void start()}>
                {context === "add" ? t("import.choice.startAdd") : t("import.choice.start")}
              </Button>
              <Button fullWidth disabled={busy} onClick={onBack}>
                {t("common.back")}
              </Button>
            </div>
          </aside>
        </Modal.Body>
        {picking ? (
          <ModPicker
            preview={pv}
            exclude={exclude}
            onDone={(next) => {
              setExclude(next);
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        ) : null}
      </Modal.Content>
    </Modal.Root>
  );
}

/** "Escolher mods": which mods of the other manager come. */
function ModPicker({
  preview,
  exclude,
  onDone,
  onCancel,
}: {
  preview: ImportPreview;
  exclude: Set<string>;
  onDone: (exclude: Set<string>) => void;
  onCancel: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [out, setOut] = useState(new Set(exclude));
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? preview.modList.filter((m) => m.name.toLowerCase().includes(q)) : preview.modList;
  }, [preview.modList, query]);
  return (
    <Modal.Root open onOpenChange={(o) => !o && onCancel()}>
      <Modal.Content size="lg" aria-describedby={undefined}>
        <Modal.Header>
          <Modal.Title>{t("import.pick.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="flex flex-col gap-3">
          <Input.Root fullWidth value={query} onChange={setQuery}>
            <Input.Box>
              <SearchIcon size="sm" className="text-fg-muted" />
              <Input.Field aria-label={t("import.pick.search")} placeholder={t("import.pick.search")} />
            </Input.Box>
          </Input.Root>
          <div role="group" aria-label={t("import.pick.title")} className="max-h-[55vh] overflow-auto rounded-card border border-border">
            {shown.map((m) => (
              <Checkbox
                key={m.key}
                variant="band-sm"
                checked={!out.has(m.key)}
                onCheckedChange={(on) =>
                  setOut((cur) => {
                    const next = new Set(cur);
                    if (on) next.delete(m.key);
                    else next.add(m.key);
                    return next;
                  })
                }
                label={m.name}
                description={formatSize(i18n.language, m.size)}
              />
            ))}
          </div>
          {preview.skipped.length > 0 ? (
            <Alert.Root intent="info">
              <Alert.Description>{t("import.pick.skipped", { count: i18n.formatNumber(preview.skipped.length) })}</Alert.Description>
            </Alert.Root>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button emphasis="high" onClick={() => onDone(out)}>
            {t("import.pick.done", { count: i18n.formatNumber(preview.modList.length - out.size) })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

