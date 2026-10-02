import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, ImageOff } from "lucide-react";
import { Alert, Button, Checkbox, Lightbox, MediaImage, Modal, Radio, Stack, Stepper, Tag, Typography } from "dettmann-ui";
import { useBackend } from "../../bridge/backend-context";
import { errorMessage, toUIError, type UIError } from "../../bridge/errors";
import type { FomodGroup, FomodOption, FomodSelection, FomodView, FomodWarning, ImportAnswer, QueueItem } from "../../bridge/types";
import { useI18n, type MessageKey, type Translator } from "../../i18n/i18n";
import { useAction } from "../games/use-action";
import { formatSize } from "./mod-labels";

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
  const img = <MediaImage src={src} alt={alt} fit="contain" radius="md" className={className} fallback={<ImageOff aria-hidden="true" className="h-6 w-6 text-fg-muted" />} />;
  if (!onOpen) return img;
  return (
    <button type="button" className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("mods.fomod.enlarge", { name: alt })} onClick={() => onOpen(src)}>
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
export function FomodWizard({ item, onClose }: { item: QueueItem; onClose: () => void }) {
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
  const install = () => void answer({ choice: "install", fomod: selection, requirements: [...requirements] });
  const usePrevious = () => void answer({ choice: "install", fomod: decision.previous });
  const cancel = () => void answer({ choice: "cancel" });

  const focusedOption: FomodOption | undefined = step && focus ? step.groups[focus.group]?.options[focus.option] : undefined;
  const summary = view?.summary;

  return (
    <Modal.Root open onOpenChange={(open) => !open && !busy && cancel()}>
      <Modal.Content size="wide" aria-describedby={undefined} className="flex flex-col">
        <Modal.Header>
          <div className="flex items-center gap-3">
            {decision.hasImage ? (
              <div className="h-12 w-24 shrink-0">
                <FomodImage load={loadImage} image="" alt={decision.module} onOpen={setLightbox} className="h-12 w-24" />
              </div>
            ) : null}
            <div className="min-w-0">
              <Modal.Title>{decision.module || item.label}</Modal.Title>
              <Typography variant="caption" color="muted-fg">
                {current === SUMMARY ? t("mods.fomod.summary") : t("mods.fomod.stepOf", { step: position + 1, total: visible.length })}
              </Typography>
            </div>
          </div>
        </Modal.Header>
        <Modal.Body className="min-h-0 flex-1">
          <Stack gap="md" className="h-full">
            {decision.previous.length > 0 ? (
              <Alert.Root variant="info">
                <Alert.Description>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    {t("mods.fomod.previousLoaded")}
                    <Button size="sm" variant="outline" startIcon={<History aria-hidden="true" />} disabled={busy} onClick={usePrevious}>
                      {t("mods.fomod.usePrevious")}
                    </Button>
                  </span>
                </Alert.Description>
              </Alert.Root>
            ) : null}
            {decision.warnings.map((w, i) => (
              <Alert.Root key={i} variant="warning">
                <Alert.Description>{fomodWarning(i18n, w)}</Alert.Description>
              </Alert.Root>
            ))}
            {error ? (
              <Alert.Root variant="danger">
                <Alert.Description>{errorMessage(i18n, error)}</Alert.Description>
              </Alert.Root>
            ) : null}

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_minmax(12rem,18rem)] gap-4">
              <nav aria-label={t("mods.fomod.steps")} className="min-h-0 overflow-auto border-r border-border pr-3">
                <Stepper.Root value={position} orientation="vertical" interactive onValueChange={(p) => goTo(p === visible.length ? SUMMARY : visible[p]!.index)}>
                  {[
                    ...visible.map((s) => (
                      <Stepper.Step key={s.index} index={visible.indexOf(s)} disabled={!seen.has(s.index)}>
                        <Stepper.StepIndicator />
                        <Stepper.StepLabel>{s.name || t("mods.fomod.unnamedStep", { n: visible.indexOf(s) + 1 })}</Stepper.StepLabel>
                      </Stepper.Step>
                    )),
                    <Stepper.Step key="summary" index={visible.length} disabled={!seen.has(SUMMARY)}>
                      <Stepper.StepIndicator />
                      <Stepper.StepLabel>{t("mods.fomod.summary")}</Stepper.StepLabel>
                    </Stepper.Step>,
                  ]}
                </Stepper.Root>
              </nav>

              <section aria-label={step?.name || t("mods.fomod.summary")} className="min-h-0 overflow-auto">
                {!view ? (
                  <Typography variant="body-sm" color="muted-fg">
                    {t("mods.fomod.loading")}
                  </Typography>
                ) : step ? (
                  <Stack gap="lg">
                    {step.groups.map((g) => (
                      <GroupField
                        key={g.index}
                        group={g}
                        stepIndex={step.index}
                        selected={effective(step.index, g.index)}
                        problem={showProblems ? g.problem : undefined}
                        onChoose={(options) => choose(step.index, g, options)}
                        onFocus={(option) => setFocus({ group: g.index, option })}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Summary
                    view={view}
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
                )}
              </section>

              <aside aria-label={t("mods.fomod.details")} className="min-h-0 overflow-auto border-l border-border pl-3">
                {focusedOption ? (
                  <Stack gap="sm">
                    {focusedOption.image ? <FomodImage load={loadImage} image={focusedOption.image} alt={focusedOption.name} onOpen={setLightbox} className="max-h-60 w-full" /> : null}
                    <Typography variant="heading-6" color="fg">
                      {focusedOption.name}
                    </Typography>
                    <Typography variant="body-sm" color="muted-fg" className="whitespace-pre-line">
                      {focusedOption.description || t("mods.fomod.noDescription")}
                    </Typography>
                  </Stack>
                ) : (
                  <Typography variant="body-sm" color="muted-fg">
                    {current === SUMMARY ? t("mods.fomod.summaryHelp") : t("mods.fomod.focusHelp")}
                  </Typography>
                )}
              </aside>
            </div>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={busy} onClick={cancel}>
            {t("mods.decision.cancelImport")}
          </Button>
          <Button variant="outline" disabled={busy || position === 0} onClick={back}>
            {t("mods.fomod.back")}
          </Button>
          {current === SUMMARY ? (
            <Button disabled={busy || !summary} loading={busy} onClick={install} title={view?.planError ? t(`error.${view.planError}` as MessageKey, { name: item.label }) : undefined}>
              {t("mods.decision.install")}
            </Button>
          ) : (
            <Button disabled={busy || !view} onClick={next}>
              {t("mods.fomod.next")}
            </Button>
          )}
        </Modal.Footer>
      </Modal.Content>
      <Lightbox open={lightbox !== null} items={lightbox ? [{ id: "image", src: lightbox, alt: decision.module }] : []} onClose={() => setLightbox(null)} />
    </Modal.Root>
  );
}

/** One group: radios for single choice (with "None" when optional), checkboxes otherwise. */
function GroupField({
  group,
  stepIndex,
  selected,
  problem,
  onChoose,
  onFocus,
}: {
  group: FomodGroup;
  stepIndex: number;
  selected: readonly number[];
  problem?: string;
  onChoose: (options: number[]) => void;
  onFocus: (option: number) => void;
}) {
  const { t } = useI18n();
  const id = `fomod-${stepIndex}-${group.index}`;
  const single = group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne";
  const hint = t(`mods.fomod.group.${group.type}` as MessageKey);
  const tags = (o: FomodOption) =>
    o.type === "Recommended" || o.type === "Required" ? (
      <Tag size="sm">{t(o.type === "Recommended" ? "mods.fomod.recommended" : "mods.fomod.required")}</Tag>
    ) : null;
  const notUsable = (o: FomodOption) =>
    o.disabled ? (
      <Typography variant="caption" color="muted-fg">
        {t("mods.fomod.notUsable")}
      </Typography>
    ) : null;
  return (
    <fieldset aria-describedby={`${id}-hint`} className="min-w-0">
      <legend className="mb-1">
        <Typography variant="heading-6" color="fg">
          {group.name || t("mods.fomod.unnamedGroup")}
        </Typography>
      </legend>
      <Typography id={`${id}-hint`} variant="caption" color="muted-fg">
        {hint}
      </Typography>
      <div className="mt-2">
        {single ? (
          <Radio.Group name={id} value={selected.length ? String(selected[0]) : NONE} onValueChange={(v) => onChoose(v === NONE ? [] : [Number(v)])}>
            {group.options.map((o) => (
              <div key={o.index} onMouseEnter={() => onFocus(o.index)} onFocus={() => onFocus(o.index)} title={o.disabled ? t("mods.fomod.notUsable") : undefined}>
                <Radio.Item value={String(o.index)} label={o.name} disabled={o.disabled || (o.locked && !o.selected)}>
                  <span className="flex flex-col items-start gap-0.5">
                    {tags(o)}
                    {notUsable(o)}
                  </span>
                </Radio.Item>
              </div>
            ))}
            {group.type === "SelectAtMostOne" ? <Radio.Item value={NONE} label={t("mods.fomod.none")} disabled={group.options.some((o) => o.locked)} /> : null}
          </Radio.Group>
        ) : (
          <Stack gap="xs">
            {group.options.map((o) => (
              <div key={o.index} className="flex flex-col" onMouseEnter={() => onFocus(o.index)} onFocus={() => onFocus(o.index)} title={o.disabled ? t("mods.fomod.notUsable") : undefined}>
                <span className="flex items-center gap-2">
                  <Checkbox
                    label={o.name}
                    checked={o.selected}
                    disabled={o.disabled || o.locked}
                    onCheckedChange={(on) => onChoose(on ? [...selected, o.index] : selected.filter((i) => i !== o.index))}
                  />
                  {tags(o)}
                </span>
                <span className="pl-7">{notUsable(o)}</span>
              </div>
            ))}
          </Stack>
        )}
      </div>
      {problem ? (
        <Alert.Root variant="danger" className="mt-2">
          <Alert.Description>{t(`mods.fomod.problem.${problem}` as MessageKey)}</Alert.Description>
        </Alert.Root>
      ) : null}
    </fieldset>
  );
}

/** The last page: files by destination, warnings, requirements (DLG-06). */
function Summary({ view, requirements, onRequirement }: { view: FomodView; requirements: ReadonlySet<string>; onRequirement: (file: string, on: boolean) => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const s = view.summary;
  if (!s) {
    return (
      <Alert.Root variant="danger">
        <Alert.Description>{t(`mods.fomod.planError.${view.planError ?? "installer_failed"}` as MessageKey)}</Alert.Description>
      </Alert.Root>
    );
  }
  return (
    <Stack gap="lg">
      <Typography variant="body-sm" color="fg">
        {tp("mods.fomod.files", s.files)} · {formatSize(i18n.language, s.size)}
      </Typography>
      <section aria-labelledby="fomod-folders">
        <Typography id="fomod-folders" variant="heading-6" color="fg" className="mb-1">
          {t("mods.fomod.byFolder")}
        </Typography>
        <ul className="flex flex-col gap-0.5 text-sm">
          {s.folders.map((f) => (
            <li key={f.folder} className="flex justify-between gap-4">
              <span className="truncate text-fg">{f.folder || t("mods.fomod.modRoot")}</span>
              <span className="tabular-nums text-fg-muted">{tp("mods.fomod.files", f.files)}</span>
            </li>
          ))}
        </ul>
      </section>
      {s.warnings.length > 0 ? (
        <section aria-labelledby="fomod-warnings">
          <Typography id="fomod-warnings" variant="heading-6" color="fg" className="mb-1">
            {t("mods.fomod.warnings")}
          </Typography>
          <Stack gap="xs">
            {s.warnings.map((w, i) => (
              <Alert.Root key={i} variant="warning">
                <Alert.Description>{fomodWarning(i18n, w)}</Alert.Description>
              </Alert.Root>
            ))}
          </Stack>
        </section>
      ) : null}
      {s.requirements.length > 0 ? (
        <section aria-labelledby="fomod-requirements">
          <Typography id="fomod-requirements" variant="heading-6" color="fg" className="mb-1">
            {t("mods.fomod.requirements")}
          </Typography>
          <Stack gap="xs">
            {s.requirements.map((r) =>
              r.mod ? (
                <Checkbox
                  key={r.file}
                  checked={requirements.has(r.file)}
                  onCheckedChange={(on) => onRequirement(r.file, on)}
                  label={t("mods.fomod.createRequirement", { file: r.file, mod: r.modName ?? "" })}
                />
              ) : (
                <Typography key={r.file} variant="body-sm" color="muted-fg">
                  {t("mods.fomod.requirementNotFound", { file: r.file })}
                </Typography>
              ),
            )}
          </Stack>
        </section>
      ) : null}
    </Stack>
  );
}
