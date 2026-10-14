import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, HardDrive, Image as ImageGlyph, ImageOff } from "lucide-react";
import { ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, FolderIcon, HistoryIcon, LockIcon, XIcon } from "dettmann-ui/icons";
import { Alert, Button, Checkbox, Input, Lightbox, MediaImage, Modal, Radio, StatTile, Stepper, Tag, TagAdd, Icon } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import { useCategories, useTags } from "../../bridge/queries";
import type { FomodGroup, FomodOption, FomodSelection, FomodStep, FomodView, FomodWarning, ImportAnswer, QueueItem } from "../../bridge/types";
import { useI18n, type MessageKey, type Translator } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { categoryOptions, formatSize } from "./mod-labels";
import { paletteColor, tagIndex } from "./category-look";

const SUMMARY = -1;
const NONE = "none";

const groupKey = (step: number, group: number) => `${step}:${group}`;

/** Translates a FOMOD warning code with its parameters. */
export function fomodWarning(i18n: Translator, w: FomodWarning): string {
  return i18n.t(`mods.fomod.warning.${w.code}` as MessageKey, w.params);
}

/** Loads installer images as data URLs; the backend refuses anything else. */
function useFomodImages(operationId: string) {
  const backend = useBackend();
  const cache = useRef(new Map<string, Promise<string>>());
  return useCallback(
    (image: string) => {
      let p = cache.current.get(image);
      if (!p) {
        p = backend.fomodImage(operationId, image).catch(() => "");
        cache.current.set(image, p);
      }
      return p;
    },
    [backend, operationId],
  );
}

function FomodImage({ load, image, alt, onOpen, className }: { load: (image: string) => Promise<string>; image: string; alt: string; onOpen?: (src: string) => void; className?: string }) {
  const { t } = useI18n();
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    void load(image).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [load, image]);
  if (!src) return null;
  const img = <MediaImage src={src} alt={alt} fit="contain" radius="md" className={className} fallback={<Icon icon={ImageOff} size="lg" className="text-fg-muted" />} />;
  if (!onOpen) return img;
  return (
    <button type="button" className="focus-ring block w-full rounded-control" aria-label={t("mods.fomod.enlarge", { name: alt })} onClick={() => onOpen(src)}>
      {img}
    </button>
  );
}

/**
 * The FOMOD wizard (DLG-06, core/03 §5). The user's clicks only compose the
 * answer (the groups visited and what was picked); every state shown —
 * visibility, option types, defaults, locks, problems, the summary — comes
 * from the backend, which evaluates each change (anti-pattern 1).
 */
export function FomodWizard({ instance, item, onClose }: { instance: string; item: QueueItem; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const backend = useBackend();
  const run = useAction();
  const decision = item.decision!.fomod!;
  const op = item.operationId;
  const loadImage = useFomodImages(op);

  const [visited, setVisited] = useState<ReadonlyMap<string, number[]>>(() => new Map(decision.previous.map((s) => [groupKey(s.step, s.group), s.options])));
  const [view, setView] = useState<FomodView | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set());
  const [focus, setFocus] = useState<{ group: number; option: number } | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [requirements, setRequirements] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<UIError | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Organize the mod when the install completes (B10, D124).
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<readonly string[]>([]);
  const previous = useMemo(() => new Map(decision.previous.map((s) => [groupKey(s.step, s.group), s.options])), [decision.previous]);

  const selection = useMemo<FomodSelection[]>(
    () => [...visited].map(([k, options]) => ({ step: Number(k.split(":")[0]), group: Number(k.split(":")[1]), options })),
    [visited],
  );
  useEffect(() => {
    let live = true;
    backend
      .fomodState(op, selection)
      .then((v) => {
        if (!live) return;
        setView(v);
        setError(null);
      })
      .catch((e) => live && setError(toUIError(e)));
    return () => {
      live = false;
    };
  }, [backend, op, selection]);

  const visible = useMemo(() => view?.steps.filter((s) => s.visible) ?? [], [view]);
  useEffect(() => {
    if (current === null && visible.length > 0) {
      setCurrent(visible[0]!.index);
      setSeen(new Set([visible[0]!.index]));
    }
  }, [current, visible]);
  // A step that became hidden is left for the nearest visible one before it.
  const step = current === SUMMARY ? null : (visible.find((s) => s.index === current) ?? visible.filter((s) => s.index < (current ?? 0)).pop() ?? visible[0] ?? null);
  const position = current === SUMMARY ? visible.length : step ? visible.indexOf(step) : 0;

  const groupProblems = (stepIndex: number) => view?.problems.filter((p) => p.step === stepIndex) ?? [];
  const effective = (stepIndex: number, group: number) => view?.selection.find((s) => s.step === stepIndex && s.group === group)?.options ?? [];

  const choose = (stepIndex: number, group: FomodGroup, options: number[]) => {
    setVisited((v) => new Map(v).set(groupKey(stepIndex, group.index), options));
  };
  // Leaving a step records what it shows, defaults included, as visited.
  const commitStep = (stepIndex: number) => {
    setVisited((v) => {
      const next = new Map(v);
      for (const s of view?.selection ?? []) if (s.step === stepIndex && !next.has(groupKey(s.step, s.group))) next.set(groupKey(s.step, s.group), s.options);
      return next;
    });
  };
  const goTo = (target: number) => {
    if (step) commitStep(step.index);
    setShowProblems(false);
    setFocus(null);
    setCurrent(target);
    setSeen((s) => new Set(s).add(target));
  };
  const next = () => {
    if (!step) return;
    if (groupProblems(step.index).length > 0) return setShowProblems(true);
    const after = visible[position + 1];
    goTo(after ? after.index : SUMMARY);
  };
  const back = () => {
    if (current === SUMMARY) return goTo(visible[visible.length - 1]?.index ?? SUMMARY);
    const before = visible[position - 1];
    if (before) goTo(before.index);
  };

  const answer = async (a: ImportAnswer) => {
    setBusy(true);
    const result = await run(() => backend.resolveImport(op, a), { quiet: true });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  const organize = { ...(category ? { category } : {}), ...(tags.length ? { tags: [...tags] } : {}) };
  const install = () => void answer({ choice: "install", fomod: selection, requirements: [...requirements], ...organize });
  const usePrevious = () => void answer({ choice: "install", fomod: decision.previous, ...organize });
  const cancel = () => void answer({ choice: "cancel" });

  const focusedOption: FomodOption | undefined = step && focus ? step.groups[focus.group]?.options[focus.option] : undefined;
  const summary = view?.summary;

  let stepTitle = t("mods.fomod.summary");
  if (step) stepTitle = step.name || t("mods.fomod.unnamedStep", { n: position + 1 });
  let center: React.ReactNode;
  if (!view) {
    center = <p className="text-sm text-fg-muted">{t("mods.fomod.loading")}</p>;
  } else if (step) {
    center = (
      <>
        <h2 className="text-xl font-semibold text-fg">{stepTitle}</h2>
        {step.groups.map((g) => (
          <GroupField
            key={g.index}
            group={g}
            stepIndex={step.index}
            selected={effective(step.index, g.index)}
            previous={previous.get(groupKey(step.index, g.index))}
            problem={showProblems ? g.problem : undefined}
            onChoose={(options) => choose(step.index, g, options)}
            onFocus={(option) => setFocus({ group: g.index, option })}
          />
        ))}
      </>
    );
  } else {
    center = (
      <Summary
        view={view}
        visible={visible}
        effective={effective}
        previous={previous}
        onChange={goTo}
        requirements={requirements}
        onRequirement={(file, on) =>
          setRequirements((r) => {
            const n = new Set(r);
            if (on) n.add(file);
            else n.delete(file);
            return n;
          })
        }
      />
    );
  }

  let aside: React.ReactNode;
  if (current === SUMMARY && summary) {
    aside = <SummaryAside instance={instance} target={summary.target} files={summary.files} size={summary.size} folders={summary.folders} category={category} onCategory={setCategory} tags={tags} onTags={setTags} />;
  } else if (focusedOption) {
    aside = (
      <>
        {focusedOption.image ? <FomodImage load={loadImage} image={focusedOption.image} alt={focusedOption.name} onOpen={setLightbox} className="h-50 w-full" /> : null}
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-fg">{focusedOption.name}</span>
          {focusedOption.type === "Recommended" ? (
            <Tag size="sm" outline={false} intent="success">
              {t("mods.fomod.recommended")}
            </Tag>
          ) : null}
        </span>
        <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg-muted">{focusedOption.description || t("mods.fomod.noDescription")}</p>
        <p className="mt-auto text-xs leading-normal text-fg-muted">{t("mods.fomod.panelHelp")}</p>
      </>
    );
  } else {
    aside = <p className="text-xs leading-normal text-fg-muted">{current === SUMMARY ? t("mods.fomod.summaryHelp") : t("mods.fomod.panelHelp")}</p>;
  }

  let primary: React.ReactNode;
  if (current === SUMMARY) {
    primary = (
      <Button emphasis="high" disabled={busy || !summary} loading={busy} onClick={install} title={view?.planError ? t(`error.${view.planError}` as MessageKey, { name: item.label }) : undefined}>
        {t("mods.decision.install")}
      </Button>
    );
  } else {
    primary = (
      <Button emphasis="high" disabled={busy || !view} endIcon={<ChevronRightIcon size="sm" />} onClick={next}>
        {t("mods.fomod.next")}
      </Button>
    );
  }

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content size="custom" aria-describedby={undefined} className="flex h-[min(50rem,95vh)] w-full max-w-[min(72.5rem,96vw)] flex-col">
        <Modal.Header layout="bar">
          {decision.hasImage ? (
            <div className="h-13 w-26 shrink-0 overflow-hidden rounded-control border border-border">
              <FomodImage load={loadImage} image="" alt={decision.module} onOpen={setLightbox} className="h-13 w-26" />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-0.75">
            <Modal.Title className="truncate">{decision.module || item.label}</Modal.Title>
            <span className="text-[0.8125rem] text-fg-muted">{current === SUMMARY ? t("mods.fomod.summary") : t("mods.fomod.stepOf", { step: position + 1, total: visible.length })}</span>
          </div>
          <Button size="icon" emphasis="low" aria-label={t("common.close")} title={t("common.close")} disabled={busy} onClick={onClose}>
            <XIcon size="sm" />
          </Button>
        </Modal.Header>
        {decision.previous.length > 0 ? (
          <Alert.Root
            band
            intent="info"
            action={
              <Button size="sm" disabled={busy} onClick={usePrevious}>
                {t("mods.fomod.usePrevious")}
              </Button>
            }
          >
            <Alert.Description>{t("mods.fomod.previousLoaded")}</Alert.Description>
          </Alert.Root>
        ) : null}
        {decision.warnings.map((w, i) => (
          <Alert.Root key={i} band intent="warning">
            <Alert.Description>{fomodWarning(i18n, w)}</Alert.Description>
          </Alert.Root>
        ))}
        {error ? (
          <Alert.Root band intent="danger">
            <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
          </Alert.Root>
        ) : null}

        <Modal.Body padding="none" className="grid grid-cols-[14.375rem_minmax(0,1fr)_21.25rem]">
          <nav aria-label={t("mods.fomod.steps")} className="flex min-h-0 flex-col overflow-auto border-r border-border bg-sunken px-3.5 py-4.5">
            <Stepper.Root variant="list" value={position} orientation="vertical" interactive onValueChange={(p) => goTo(p === visible.length ? SUMMARY : visible[p]!.index)}>
              {[
                ...visible.map((s) => (
                  <Stepper.Step key={s.index} index={visible.indexOf(s)} disabled={!seen.has(s.index)}>
                    <Stepper.StepIndicator />
                    <Stepper.StepLabel>
                      <span className="truncate">{s.name || t("mods.fomod.unnamedStep", { n: visible.indexOf(s) + 1 })}</span>
                      {seen.has(s.index) && s.index !== current ? (
                        <span className="truncate text-xs font-normal text-fg-muted">{stepNote(s, effective, t("mods.fomod.nothingChosen"))}</span>
                      ) : null}
                    </Stepper.StepLabel>
                  </Stepper.Step>
                )),
                <Stepper.Step key="summary" index={visible.length} disabled={!seen.has(SUMMARY)}>
                  <Stepper.StepIndicator />
                  <Stepper.StepLabel>{t("mods.fomod.summary")}</Stepper.StepLabel>
                </Stepper.Step>,
              ]}
            </Stepper.Root>
            <p className="mt-auto px-2.5 pt-4 text-xs leading-normal text-fg-muted">{t("mods.fomod.stepsMayChange")}</p>
          </nav>

          <section aria-label={stepTitle} className="flex min-h-0 min-w-0 flex-col gap-5 overflow-auto px-6 py-5">
            {center}
          </section>

          <aside aria-label={current === SUMMARY ? t("mods.fomod.byFolder") : t("mods.fomod.details")} className="flex min-h-0 min-w-0 flex-col gap-3.5 overflow-auto border-l border-border bg-sunken p-5">
            {aside}
          </aside>
        </Modal.Body>
        <Modal.Footer size="lg">
          <Button emphasis="low" disabled={busy} onClick={cancel}>
            {t("mods.decision.cancelImport")}
          </Button>
          <span className="flex-1" />
          <Button disabled={busy || position === 0} startIcon={<ChevronLeftIcon size="sm" />} onClick={back}>
            {t("mods.fomod.back")}
          </Button>
          {primary}
        </Modal.Footer>
      </Modal.Content>
      <Lightbox open={lightbox !== null} items={lightbox ? [{ id: "image", src: lightbox, alt: decision.module }] : []} onClose={() => setLightbox(null)} />
    </Modal.Root>
  );
}

/** One group (board JogoFomod): 44 px option rows, radios for single choice (with "None" when optional), checkboxes otherwise. */
function GroupField({
  group,
  stepIndex,
  selected,
  problem,
  previous,
  onChoose,
  onFocus,
}: {
  group: FomodGroup;
  stepIndex: number;
  selected: readonly number[];
  /** Options of this group in the previous installation (reinstall). */
  previous?: readonly number[];
  problem?: string;
  onChoose: (options: number[]) => void;
  onFocus: (option: number) => void;
}) {
  const { t } = useI18n();
  const id = `fomod-${stepIndex}-${group.index}`;
  const single = group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne";
  const hint = t(`mods.fomod.group.${group.type}` as MessageKey);
  const badges = (o: FomodOption) => (
    <>
      {previous?.includes(o.index) ? (
        <Tag size="sm" outline={false} intent="info" icon={HistoryIcon}>
          {t("mods.fomod.previousChoice")}
        </Tag>
      ) : null}
      {o.type === "Recommended" ? (
        <Tag size="sm" outline={false} intent="success">
          {t("mods.fomod.recommended")}
        </Tag>
      ) : null}
      {o.type === "Required" ? (
        <Tag size="sm" outline={false} icon={LockIcon}>
          {t("mods.fomod.required")}
        </Tag>
      ) : null}
      <span className="flex w-4 justify-center text-fg-muted">{o.image ? <Icon icon={ImageGlyph} size="sm" label={t("mods.fomod.hasImage")} /> : null}</span>
    </>
  );
  let options: React.ReactNode;
  if (single) {
    options = (
      <Radio.Group name={id} value={selected.length ? String(selected[0]) : NONE} onValueChange={(v) => onChoose(v === NONE ? [] : [Number(v)])}>
        {group.options.map((o) => (
          <div key={o.index} onMouseEnter={() => onFocus(o.index)} onFocus={() => onFocus(o.index)}>
            <Radio.Item variant="row" value={String(o.index)} label={o.name} aria-label={o.name} disabled={o.disabled || (o.locked && !o.selected)} action={badges(o)}>
              {o.disabled ? <span className="text-xs text-fg-muted">{t("mods.fomod.notUsable")}</span> : null}
            </Radio.Item>
          </div>
        ))}
        {group.type === "SelectAtMostOne" ? <Radio.Item variant="row" value={NONE} label={t("mods.fomod.none")} aria-label={t("mods.fomod.none")} disabled={group.options.some((o) => o.locked)} /> : null}
      </Radio.Group>
    );
  } else {
    options = (
      <div className="flex flex-col gap-1.5">
        {group.options.map((o) => (
          <div key={o.index} onMouseEnter={() => onFocus(o.index)} onFocus={() => onFocus(o.index)}>
            <Checkbox
              variant="row"
              label={o.name}
              checked={o.selected}
              disabled={o.disabled || o.locked}
              description={o.disabled ? t("mods.fomod.notUsable") : undefined}
              action={badges(o)}
              onCheckedChange={(on) => onChoose(on ? [...selected, o.index] : selected.filter((i) => i !== o.index))}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <fieldset aria-describedby={`${id}-hint`} className="flex min-w-0 flex-col gap-1.5">
      <legend className="contents">
        <span className="flex items-baseline gap-2.5 pb-1">
          <span className="text-sm font-semibold text-fg">{group.name || t("mods.fomod.unnamedGroup")}</span>
          <span id={`${id}-hint`} className="text-xs text-fg-muted">
            {hint}
          </span>
        </span>
      </legend>
      {options}
      {problem ? (
        <Alert.Root intent="danger" className="mt-1">
          <Alert.Description>{t(`mods.fomod.problem.${problem}` as MessageKey)}</Alert.Description>
        </Alert.Root>
      ) : null}
    </fieldset>
  );
}

/** Small uppercase title of a block (boards). */
function BlockTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </h3>
  );
}

/** The last page (board JogoFomodResumo): your choices by step, warnings, requirements (DLG-06). */
function Summary({
  view,
  visible,
  effective,
  previous,
  onChange,
  requirements,
  onRequirement,
}: {
  view: FomodView;
  visible: readonly FomodStep[];
  effective: (step: number, group: number) => number[];
  previous: ReadonlyMap<string, number[]>;
  onChange: (step: number) => void;
  requirements: ReadonlySet<string>;
  onRequirement: (file: string, on: boolean) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const s = view.summary;
  if (!s) {
    return (
      <Alert.Root intent="danger">
        <Alert.Description>{t(`mods.fomod.planError.${view.planError ?? "installer_failed"}` as MessageKey)}</Alert.Description>
      </Alert.Root>
    );
  }
  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-fg">{t("mods.fomod.summary")}</h2>
        <p className="text-[0.8125rem] text-fg-muted">{t("mods.fomod.summaryIntro")}</p>
      </div>
      <section aria-labelledby="fomod-choices" className="flex flex-col gap-2">
        <BlockTitle id="fomod-choices">{t("mods.fomod.yourChoices")}</BlockTitle>
        <ul className="overflow-hidden rounded-card border border-border">
          {visible.map((st) => (
            <li key={st.index} className="grid grid-cols-[8.75rem_minmax(0,1fr)_auto] items-start gap-4 border-b border-border-subtle px-4 py-2.75 last:border-b-0">
              <span className="text-[0.8125rem] font-semibold text-fg">{st.name || t("mods.fomod.unnamedStep", { n: visible.indexOf(st) + 1 })}</span>
              <span className="flex min-w-0 flex-col gap-2.5">
                {st.groups.map((g) => {
                  const chosen = effective(st.index, g.index);
                  const before = previous.get(groupKey(st.index, g.index));
                  const same = before !== undefined && before.length === chosen.length && before.every((o) => chosen.includes(o));
                  return (
                    <span key={g.index} className="flex flex-col gap-0.5">
                      <span className="text-xs text-fg-muted">{g.name || t("mods.fomod.unnamedGroup")}</span>
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium leading-snug text-fg">
                        {chosen.length ? chosen.map((o) => g.options[o]?.name ?? "").join(", ") : t("mods.fomod.nothingChosen")}
                        {same && previous.size > 0 ? (
                          <Tag size="xs" intent="info" icon={HistoryIcon}>
                            {t("mods.fomod.previousChoice")}
                          </Tag>
                        ) : null}
                      </span>
                    </span>
                  );
                })}
              </span>
              <Button size="inline" emphasis="low" intent="brand" onClick={() => onChange(st.index)} aria-label={t("mods.fomod.changeStep", { step: st.name })}>
                {t("mods.fomod.change")}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {s.warnings.length > 0 ? (
        <section aria-labelledby="fomod-warnings" className="flex flex-col gap-2">
          <BlockTitle id="fomod-warnings">{t("mods.fomod.warnings")}</BlockTitle>
          {s.warnings.map((w, i) => (
            <Alert.Root key={i} intent="warning">
              <Alert.Description>{fomodWarning(i18n, w)}</Alert.Description>
            </Alert.Root>
          ))}
        </section>
      ) : null}
      {s.requirements.length > 0 ? (
        <section aria-labelledby="fomod-requirements" className="flex flex-col gap-2">
          <BlockTitle id="fomod-requirements">{t("mods.fomod.requirements")}</BlockTitle>
          {s.requirements.map((r) =>
            r.mod ? (
              <Checkbox
                key={r.file}
                size="sm"
                checked={requirements.has(r.file)}
                onCheckedChange={(on) => onRequirement(r.file, on)}
                label={t("mods.fomod.createRequirement", { file: r.file, mod: r.modName ?? "" })}
              />
            ) : (
              <span key={r.file} className="flex items-center gap-2.5 text-[0.8125rem] text-fg-muted">
                <CircleAlertIcon size="sm" />
                {t("mods.fomod.requirementNotFound", { file: r.file })}
              </span>
            ),
          )}
        </section>
      ) : null}
    </div>
  );
}

/** The choices of a step in one line, for the step list. */
function stepNote(step: FomodStep, effective: (step: number, group: number) => number[], none: string): string {
  const names = step.groups.flatMap((g) => effective(step.index, g.index).map((o) => g.options[o]?.name ?? ""));
  return names.filter(Boolean).join(", ") || none;
}

/**
 * Right side of the summary (board JogoFomodResumo): the two numbers, files
 * by destination (the target comes from the instance definition) and the
 * category and tags the mod gets when the install completes (B10).
 */
function SummaryAside({
  instance,
  target,
  files,
  size,
  folders,
  category,
  onCategory,
  tags,
  onTags,
}: {
  instance: string;
  target?: string;
  files: number;
  size: number;
  folders: readonly { folder: string; files: number }[];
  category: string;
  onCategory: (id: string) => void;
  tags: readonly string[];
  onTags: (tags: readonly string[]) => void;
}) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const categories = useCategories(instance);
  const defs = useTags(instance);
  const index = tagIndex(defs.status === "ready" ? defs.data : []);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim();
    setDraft("");
    setAdding(false);
    if (name && !tags.some((x) => x.toLowerCase() === name.toLowerCase())) onTags([...tags, name]);
  };
  const where = (folder: string) => [target, folder].filter(Boolean).join("/") || t("mods.fomod.modRoot");
  let adder: React.ReactNode;
  if (adding) {
    adder = (
      <Input.Root value={draft} onChange={setDraft}>
        <Input.Box className="h-6 w-32">
          <Input.Field
            autoFocus
            aria-label={t("mods.detail.newTag")}
            list="fomod-tags"
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
                setDraft("");
              }
            }}
          />
        </Input.Box>
        <datalist id="fomod-tags">
          {[...index.values()].map((d) => (
            <option key={d.name} value={d.name} />
          ))}
        </datalist>
      </Input.Root>
    );
  } else {
    adder = (
      <TagAdd size="md" onClick={() => setAdding(true)}>
        + {t("mods.detail.addTag").toLowerCase()}
      </TagAdd>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 pb-3.5">
        <StatTile layout="inline" icon={FileText} label={t("mods.fomod.kpiFiles")} value={i18n.formatNumber(files)} />
        <StatTile layout="inline" icon={HardDrive} label={t("mods.fomod.kpiSize")} value={formatSize(i18n.language, size)} />
      </div>
      <section aria-labelledby="fomod-folders" className="flex flex-col">
        <span className="pb-1.5">
          <BlockTitle id="fomod-folders">{t("mods.fomod.byFolder")}</BlockTitle>
        </span>
        <ul className="flex flex-col">
          {folders.map((f) => (
            <li key={f.folder} className="grid h-9 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border-subtle">
              <FolderIcon size="sm" className="text-fg-muted" />
              <span className="truncate font-mono text-xs text-fg">{f.folder ? where(f.folder) : t("mods.fomod.targetRoot", { target: target ?? "" })}</span>
              <span className="text-xs tabular-nums text-fg-muted">{tp("mods.fomod.files", f.files)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="fomod-organize" className="mt-auto flex flex-col gap-3 border-t border-border-subtle pt-3.5">
        <BlockTitle id="fomod-organize">{t("mods.fomod.organize")}</BlockTitle>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">{t("mods.field.category")}</span>
          <Input.Root fullWidth value={category} onChange={onCategory}>
            <Input.Box className="h-8.5">
              <Input.Select aria-label={t("mods.field.category")} options={[{ value: "", label: t("mods.noCategory") }, ...(categories.status === "ready" ? categoryOptions(categories.data) : [])]} />
            </Input.Box>
          </Input.Root>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">{t("mods.organize.tags")}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {tags.map((g) => {
              const c = paletteColor(index.get(g.toLowerCase())?.color);
              return (
                <Tag key={g} outline={false} dot value={g} {...(c ? { color: c } : {})} removeLabel={t("mods.detail.removeTag", { name: g })} onRemove={(v) => onTags(tags.filter((x) => x !== v))}>
                  {g}
                </Tag>
              );
            })}
            {adder}
          </span>
        </div>
      </section>
    </>
  );
}
