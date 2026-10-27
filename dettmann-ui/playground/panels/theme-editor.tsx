import { useId, useState, type ReactNode } from "react";
import {
  Button,
  Input,
  PRESETS,
  SegmentedControl,
  Slider,
  Stack,
  Inline,
  Switch,
  Tag,
  Typography,
  MOTION_DEFAULTS,
  MOTION_LEVELS,
  ROLE_NAMES,
  parseColor,
  toHex,
  type MotionLevel,
  type MotionSpec,
  type PresetId,
  type RoleName,
  type ThemeConfig,
} from "../../src";

export const MOTION_LABELS: Record<MotionLevel, string> = { calm: "Calmo", responsive: "Responsivo", expressive: "Expressivo" };

const NEUTRAL_OPTIONS = [
  { value: "cool", label: "Frio" },
  { value: "neutral", label: "Neutro" },
  { value: "warm", label: "Quente" },
] as const;
const CONTRAST_OPTIONS = [
  { value: "standard", label: "Padrão" },
  { value: "high", label: "Alto" },
] as const;
const SHAPE_OPTIONS = [
  { value: "precise", label: "Precisa" },
  { value: "balanced", label: "Equilibrada" },
  { value: "soft", label: "Suave" },
] as const;
const DENSITY_OPTIONS = [
  { value: "compact", label: "Compacta" },
  { value: "comfortable", label: "Confortável" },
  { value: "spacious", label: "Espaçosa" },
] as const;
const MODE_OPTIONS = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
] as const;
const MOTION_OPTIONS = MOTION_LEVELS.map((value) => ({ value, label: MOTION_LABELS[value] }));

const TUNE_FIELDS: { key: keyof MotionSpec; label: string; step: number }[] = [
  { key: "stiffness", label: "Rigidez", step: 10 },
  { key: "damping", label: "Amortecimento", step: 1 },
  { key: "mass", label: "Massa", step: 0.1 },
  { key: "duration", label: "Duração (ms)", step: 10 },
  { key: "amplitude", label: "Amplitude", step: 0.05 },
  { key: "pressScale", label: "Escala no toque", step: 0.005 },
  { key: "stagger", label: "Escalonamento (ms)", step: 5 },
];

const OVERRIDABLE = ROLE_NAMES.filter((r) => r !== "overlay");

/** Hex para o `<input type="color">`; texto que não faz parse cai no preto. */
const pickerValue = (value: string | undefined) => {
  const parsed = value ? parseColor(value) : null;
  return parsed ? toHex(parsed) : "#000000";
};

function Knob({ label, children, hint }: { label: string; children: (labelId: string) => ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <Stack gap="xs">
      <Inline justify="between" wrap={false}>
        <Typography variant="label" id={id} className="text-fg-muted">
          {label}
        </Typography>
        {hint}
      </Inline>
      {children(id)}
    </Stack>
  );
}

/** Seletor nativo + campo de texto livre (aceita hex, rgb(), hsl(), oklch()). */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Inline gap="sm" wrap={false} align="end">
      <input
        type="color"
        aria-label={label}
        value={pickerValue(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-control-md w-12 shrink-0 cursor-pointer rounded-control border border-border bg-surface p-1"
      />
      <Input.Root fullWidth value={value} onChange={onChange}>
        <Input.Label className="sr-only">{`${label} (texto)`}</Input.Label>
        <Input.Box>
          <Input.Field spellCheck={false} className="font-mono" />
        </Input.Box>
      </Input.Root>
    </Inline>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="md" as="section" className="border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <Typography variant="caption" className="font-semibold uppercase tracking-wide text-fg-subtle">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

const motionOf = (config: ThemeConfig) => {
  const m = config.motion;
  if (m === undefined) return { ceiling: "expressive" as MotionLevel, tune: {} };
  if (typeof m === "string") return { ceiling: m, tune: {} };
  return { ceiling: m.ceiling ?? "expressive", tune: m.tune ?? {} };
};

export interface ThemeEditorProps {
  draft: ThemeConfig;
  presetId: PresetId;
  onPresetChange: (id: PresetId) => void;
  onChange: (next: ThemeConfig) => void;
}

export function ThemeEditor({ draft, presetId, onPresetChange, onChange }: ThemeEditorProps) {
  const set = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => onChange({ ...draft, [key]: value });
  const motion = motionOf(draft);
  const [tuneLevel, setTuneLevel] = useState<MotionLevel>("expressive");
  const [overrideRole, setOverrideRole] = useState<RoleName>("emphasis-fill");
  const [overrideMode, setOverrideMode] = useState<"light" | "dark">("light");
  const [overrideColor, setOverrideColor] = useState("#000000");

  const setTune = (key: keyof MotionSpec, raw: string) => {
    const n = Number(raw);
    const levelTune = { ...motion.tune[tuneLevel] };
    if (raw === "" || !Number.isFinite(n)) delete levelTune[key];
    else levelTune[key] = n;
    const tune = { ...motion.tune, [tuneLevel]: levelTune };
    if (Object.keys(levelTune).length === 0) delete tune[tuneLevel];
    set("motion", { ceiling: motion.ceiling, tune });
  };
  const resetTune = () => {
    const tune = { ...motion.tune };
    delete tune[tuneLevel];
    set("motion", { ceiling: motion.ceiling, tune });
  };

  const overrides = draft.overrides ?? {};
  const applyOverride = () =>
    set("overrides", { ...overrides, [overrideMode]: { ...overrides[overrideMode], [overrideRole]: overrideColor } });
  const removeOverride = (mode: "light" | "dark", role: string) => {
    const next = { ...overrides[mode] };
    delete next[role as RoleName];
    set("overrides", { ...overrides, [mode]: next });
  };
  const overrideList = (["light", "dark"] as const).flatMap((mode) =>
    Object.entries(overrides[mode] ?? {}).map(([role, value]) => ({ mode, role, value: value as string })),
  );

  return (
    <Stack gap="lg">
      <Section title="Base">
        <Input.Root fullWidth value={presetId} onChange={(v: string) => onPresetChange(v as PresetId)}>
          <Input.Label>Preset</Input.Label>
          <Input.Box>
            <Input.Select
              options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))}
            />
          </Input.Box>
        </Input.Root>
        <Input.Root fullWidth value={draft.label} onChange={(v: string) => set("label", v)}>
          <Input.Label>Nome</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      </Section>

      <Section title="Cor">
        <Knob label="Marca">{() => <ColorField label="Cor da marca" value={draft.brand} onChange={(v: string) => set("brand", v)} />}</Knob>
        <Switch
          size="sm"
          label="Accent automático (marca + 150°)"
          checked={draft.accent === undefined}
          onCheckedChange={(auto) => set("accent", auto ? undefined : pickerValue(draft.brand))}
        />
        {draft.accent !== undefined && (
          <Knob label="Accent">
            {() => <ColorField label="Cor do accent" value={draft.accent ?? ""} onChange={(v: string) => set("accent", v)} />}
          </Knob>
        )}
        <Knob label="Temperatura dos neutros">
          {(id) => (
            <SegmentedControl
              aria-labelledby={id}
              size="sm"
              options={NEUTRAL_OPTIONS}
              value={draft.neutral ?? "neutral"}
              onChange={(v) => set("neutral", v)}
            />
          )}
        </Knob>
        <Knob
          label="Vibração"
          hint={
            <Typography variant="caption" className="font-mono text-fg-muted">
              {(draft.vibrance ?? 0.5).toFixed(2)}
            </Typography>
          }
        >
          {(id) => (
            <Slider.Root value={draft.vibrance ?? 0.5} onValueChange={(v) => set("vibrance", v)} min={0} max={1} step={0.05}>
              <Slider.Track>
                <Slider.Range />
              </Slider.Track>
              <Slider.Thumb aria-labelledby={id} />
            </Slider.Root>
          )}
        </Knob>
        <Knob label="Contraste">
          {(id) => (
            <SegmentedControl
              aria-labelledby={id}
              size="sm"
              options={CONTRAST_OPTIONS}
              value={draft.contrast ?? "standard"}
              onChange={(v) => set("contrast", v)}
            />
          )}
        </Knob>
      </Section>

      <Section title="Forma e densidade">
        <Knob label="Forma">
          {(id) => (
            <SegmentedControl
              aria-labelledby={id}
              size="sm"
              options={SHAPE_OPTIONS}
              value={draft.shape ?? "balanced"}
              onChange={(v) => set("shape", v)}
            />
          )}
        </Knob>
        <Knob label="Densidade">
          {(id) => (
            <SegmentedControl
              aria-labelledby={id}
              size="sm"
              options={DENSITY_OPTIONS}
              value={draft.density ?? "comfortable"}
              onChange={(v) => set("density", v)}
            />
          )}
        </Knob>
        <Input.Root fullWidth value={draft.font?.sans ?? "Plus Jakarta Sans"} onChange={(v: string) => set("font", { ...draft.font, sans: v })}>
          <Input.Label>Fonte do texto</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
        <Input.Root fullWidth value={draft.font?.mono ?? "JetBrains Mono"} onChange={(v: string) => set("font", { ...draft.font, mono: v })}>
          <Input.Label>Fonte monoespaçada</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      </Section>

      <Section title="Movimento">
        <Knob label="Teto de movimento">
          {(id) => (
            <SegmentedControl
              aria-labelledby={id}
              size="sm"
              options={MOTION_OPTIONS}
              value={motion.ceiling}
              onChange={(v) => set("motion", { ceiling: v, tune: motion.tune })}
            />
          )}
        </Knob>
        <Knob
          label="Ajuste fino do nível"
          hint={
            <Button size="sm" emphasis="low" onClick={resetTune} disabled={!motion.tune[tuneLevel]}>
              Restaurar
            </Button>
          }
        >
          {(id) => (
            <Stack gap="sm">
              <SegmentedControl aria-labelledby={id} size="sm" options={MOTION_OPTIONS} value={tuneLevel} onChange={setTuneLevel} />
              <div className="grid grid-cols-2 gap-2">
                {TUNE_FIELDS.map(({ key, label, step }) => (
                  <Input.Root
                    key={`${tuneLevel}-${key}`}
                    fullWidth
                    value={String(motion.tune[tuneLevel]?.[key] ?? MOTION_DEFAULTS[tuneLevel][key])}
                    onChange={(v: string) => setTune(key, v)}
                  >
                    <Input.Label className="text-caption">{label}</Input.Label>
                    <Input.Box>
                      <Input.Number step={step} min={0} />
                    </Input.Box>
                  </Input.Root>
                ))}
              </div>
            </Stack>
          )}
        </Knob>
      </Section>

      <Section title="Overrides de papel">
        <Input.Root fullWidth value={overrideRole} onChange={(v: string) => setOverrideRole(v as RoleName)}>
          <Input.Label>Papel</Input.Label>
          <Input.Box>
            <Input.Select options={OVERRIDABLE.map((r) => ({ value: r, label: r }))} />
          </Input.Box>
        </Input.Root>
        <Knob label="Modo">
          {(id) => (
            <SegmentedControl aria-labelledby={id} size="sm" options={MODE_OPTIONS} value={overrideMode} onChange={setOverrideMode} />
          )}
        </Knob>
        <ColorField label="Cor do override" value={overrideColor} onChange={setOverrideColor} />
        <Button size="sm" onClick={applyOverride} disabled={!parseColor(overrideColor)}>
          Aplicar override
        </Button>
        {overrideList.length > 0 && (
          <Inline gap="xs">
            {overrideList.map(({ mode, role, value }) => (
              <Tag
                key={`${mode}:${role}`}
                size="sm"
                value={`${mode}:${role}`}
                removeLabel={`Remover override ${role} (${mode === "light" ? "claro" : "escuro"})`}
                onRemove={() => removeOverride(mode, role)}
              >
                <span className="font-mono">
                  {mode === "light" ? "claro" : "escuro"} · {role} · {value}
                </span>
              </Tag>
            ))}
          </Inline>
        )}
        {overrideList.length === 0 && (
          <Typography variant="caption" className="text-fg-subtle">
            Nenhum override aplicado.
          </Typography>
        )}
      </Section>
    </Stack>
  );
}
