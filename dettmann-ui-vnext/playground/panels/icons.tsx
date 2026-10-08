import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Inline,
  Loader,
  MOTION_LEVELS,
  SegmentedControl,
  Stack,
  Switch,
  ThemeScope,
  Typography,
  type MotionLevel,
  type ThemeConfig,
} from "../../src";
import { CATALOG } from "../../src/icons/catalog";
import type { AnimatedIconComponent, Choreography } from "../../src/icons";
import { MOTION_LABELS } from "./theme-editor";

type Context = "loose" | "low" | "medium" | "high";

const CONTEXTS: readonly { value: Context; label: string }[] = [
  { value: "loose", label: "Solto" },
  { value: "low", label: "Menu (low)" },
  { value: "medium", label: "Botão (medium)" },
  { value: "high", label: "CTA (high)" },
];

const CEILINGS = MOTION_LEVELS.map((value) => ({ value, label: MOTION_LABELS[value] }));
const LOADER_VARIANTS = ["arc", "dots", "pulse", "bars"] as const;
const LOADER_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
const LOADER_INTENTS = ["neutral", "brand", "success"] as const;

/** Técnicas distintas de uma coreografia, na ordem em que aparecem. */
function kindsOf(choreography: Choreography | undefined): string[] {
  const kinds = new Set<string>();
  for (const value of Object.values(choreography ?? {})) {
    for (const technique of Array.isArray(value) ? value : value ? [value] : []) kinds.add(technique.kind);
  }
  return [...kinds];
}

function IconCell({
  Glyph,
  context,
  loop,
  playKey,
}: {
  Glyph: AnimatedIconComponent;
  context: Context;
  loop: boolean;
  playKey: number;
}) {
  const { name, action, loop: loopChoreography } = Glyph.definition;
  const icon = <Glyph size="md" playKey={playKey} loop={loop && !!loopChoreography} />;
  const kinds = [...kindsOf(action), ...kindsOf(loopChoreography).filter((k) => !kindsOf(action).includes(k))];
  let control: ReactNode = icon;
  if (context === "low") {
    control = (
      <Button emphasis="low" size="sm" aria-label={name}>
        {icon}
      </Button>
    );
  } else if (context === "medium") {
    control = (
      <Button emphasis="medium" size="sm" aria-label={name}>
        {icon}
      </Button>
    );
  } else if (context === "high") {
    control = (
      <Button emphasis="high" size="sm" aria-label={name}>
        {icon}
      </Button>
    );
  }
  return (
    <div data-testid="icon-cell" className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-3">
      <div className="flex h-10 items-center justify-center">{control}</div>
      <Typography variant="caption" color="fg" className="font-mono">
        {name}
        {loopChoreography ? (
          <span title="Tem loop" aria-label="Tem loop">
            {" ∞"}
          </span>
        ) : null}
      </Typography>
      <Typography variant="caption" color="muted-fg">
        {kinds.length > 0 ? kinds.join(" · ") : "estático"}
      </Typography>
    </div>
  );
}

/** Define/remove `data-reduce-motion` na raiz enquanto ligado; restaura ao desmontar. */
function useReduceMotion(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.setAttribute("data-reduce-motion", "true");
    return () => root.removeAttribute("data-reduce-motion");
  }, [on]);
}

type LoaderIntent = (typeof LOADER_INTENTS)[number];
const LOADER_INTENT_OPTIONS = LOADER_INTENTS.map((value) => ({ value, label: value }));

/** Matriz variante × tamanho; o intent é escolhido à parte (20 loaders por vez). */
function LoaderMatrix() {
  const [intent, setIntent] = useState<LoaderIntent>("neutral");
  return (
    <Stack gap="md">
      <SegmentedControl aria-label="Intent dos loaders" options={LOADER_INTENT_OPTIONS} value={intent} onChange={setIntent} size="sm" />
      {LOADER_VARIANTS.map((variant) => (
        <div key={variant} data-testid="loader-variant" className="flex flex-col gap-2">
          <Typography variant="caption" color="muted-fg" className="font-mono">
            {variant}
          </Typography>
          <Inline gap="lg" align="center">
            {LOADER_SIZES.map((size) => (
              <Loader key={size} variant={variant} size={size} intent={intent} label={`${variant} ${size}`} />
            ))}
          </Inline>
        </div>
      ))}
    </Stack>
  );
}

/** Página Ícones: catálogo animado por contexto, alternadores de loop/redução/teto e matriz de loaders. */
export function IconsPanel({ config }: { config: ThemeConfig }) {
  const [context, setContext] = useState<Context>("loose");
  const [loop, setLoop] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [ceiling, setCeiling] = useState<MotionLevel>("expressive");
  const [playKey, setPlayKey] = useState(0);
  useReduceMotion(reduce);

  const scoped = useMemo<ThemeConfig>(
    () => ({ ...config, id: `${config.id}-icons`, motion: { ceiling, tune: typeof config.motion === "object" ? config.motion.tune : undefined } }),
    [config, ceiling],
  );

  return (
    <ThemeScope theme={scoped} mode="light" className="rounded-panel bg-canvas p-4 text-fg">
      <Stack gap="md">
        <Inline gap="md" align="center">
          <SegmentedControl aria-label="Contexto" options={CONTEXTS} value={context} onChange={setContext} size="sm" />
          <SegmentedControl aria-label="Teto de movimento" options={CEILINGS} value={ceiling} onChange={setCeiling} size="sm" />
          <Switch label="Loop" checked={loop} onCheckedChange={setLoop} />
          <Switch label="Reduzir movimento" checked={reduce} onCheckedChange={setReduce} />
          <Button size="sm" emphasis="medium" onClick={() => setPlayKey((k) => k + 1)}>
            Tocar todos
          </Button>
          <Badge size="sm">{CATALOG.length} ícones</Badge>
        </Inline>
        {/* Classe arbitrária só do playground não é gerada (`@source not "../../playground"`): colunas via style. */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(8.5rem, 1fr))" }}>
          {CATALOG.map((Glyph) => (
            <IconCell key={Glyph.definition.name} Glyph={Glyph} context={context} loop={loop} playKey={playKey} />
          ))}
        </div>
        <Typography variant="heading-6" color="fg">
          Loaders
        </Typography>
        <LoaderMatrix />
      </Stack>
    </ThemeScope>
  );
}
