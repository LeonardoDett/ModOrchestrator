"use client";
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { isDev } from "../dev/env";
import { ICON_SIZE_CLASS, ICON_STROKE } from "../primitives/icon";
import { intentData } from "../theme/emphasis";
import { cn } from "../utils/cn";
import { useMergedRef } from "../utils/merge-refs";
import { retainController } from "./controller";
import { playChoreography } from "./play";
import { registerIcon } from "./registry";
import type {
  AnimatedIconComponent,
  AnimatedIconProps,
  Choreography,
  IconDefinition,
  IconHandle,
  IconMode,
  Technique,
} from "./types";

const ROOT = "root";
const DEFAULT_ORIGIN = "50% 50%";
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRAWABLE = new Set(["path", "line", "polyline", "polygon", "circle", "rect", "ellipse"]);
const STROKE_TECHNIQUES = new Set(["draw", "undraw", "trail"]);

/** Nomes que já emitiram o aviso de `loop` sem coreografia (um por nome). */
const warnedLoop = new Set<string>();

const fillBox = (origin: string): CSSProperties => ({ transformBox: "fill-box", transformOrigin: origin });

function techniquesOf(choreo: Choreography | undefined): [string, Technique][] {
  if (!choreo) return [];
  return Object.entries(choreo).flatMap(([key, value]) =>
    value === undefined ? [] : (Array.isArray(value) ? value : [value as Technique]).map((t) => [key, t] as [string, Technique]),
  );
}

function validate(def: IconDefinition): string[] {
  const errors: string[] = [];
  if (!KEBAB.test(def.name)) errors.push(`nome "${def.name}" não está em kebab-case`);
  if (ROOT in def.parts) errors.push(`"${ROOT}" é reservado e não pode ser nome de parte`);
  const known = (key: string) => key in def.parts;
  for (const key of Object.keys(def.origin ?? {})) {
    if (!known(key)) errors.push(`origin referencia parte inexistente "${key}"`);
  }
  for (const mode of ["action", "loop"] as const) {
    for (const [key, t] of techniquesOf(def[mode])) {
      if (key !== ROOT && !known(key)) errors.push(`${mode} referencia parte inexistente "${key}"`);
      if (!t.modes.includes(mode)) errors.push(`técnica "${t.kind}" (parte "${key}") não suporta o modo ${mode}`);
    }
  }
  return errors;
}

/** Clona `path|line|polyline|polygon|circle|rect|ellipse` com `pathLength=1`, descendo em fragments e grupos. */
function withPathLength(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{ children?: ReactNode; pathLength?: number }>;
    if (typeof el.type === "string" && DRAWABLE.has(el.type)) return cloneElement(el, { pathLength: 1 });
    if (el.props.children === undefined) return el;
    return cloneElement(el, undefined, withPathLength(el.props.children));
  });
}

interface IconState {
  handle: IconHandle;
  /** Verdadeiro enquanto a coreografia `loop` roda: gatilhos de `action` são ignorados. */
  looping: boolean;
  cancelAction(): void;
  run(choreo: Choreography, mode: IconMode): Animation[];
}

/** Estado imperativo de uma instância: animações do `action` em curso e o handle registrado. */
function createIconState(getSvg: () => SVGSVGElement | null, action: Choreography | undefined): IconState {
  let actionAnims: Animation[] = [];
  const settled = new WeakSet<Animation>();
  const isPlaying = () =>
    actionAnims.some((a) => !settled.has(a) && (a.playState === undefined || a.playState === "running"));
  const state: IconState = {
    looping: false,
    run(choreo, mode) {
      const svg = getSvg();
      if (!svg) return [];
      const anims = playChoreography(svg, choreo, mode);
      for (const a of anims) {
        // `cancel()` rejeita `finished`: o segundo handler evita rejeição não tratada.
        a.finished.then(
          () => settled.add(a),
          () => settled.add(a),
        );
      }
      return anims;
    },
    cancelAction() {
      for (const a of actionAnims) a.cancel();
      actionAnims = [];
    },
    handle: {
      play() {
        if (!action || state.looping || isPlaying()) return;
        actionAnims = state.run(action, "action");
      },
      isPlaying,
    },
  };
  return state;
}

function pascal(name: string): string {
  return name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/**
 * Define um ícone animado a partir de partes SVG (viewBox 24) e coreografias de técnicas.
 * Em dev, definição inválida (nome fora de kebab-case, parte inexistente, técnica no modo errado)
 * lança; em produção o ícone renderiza estático (sem `action`/`loop`).
 *
 * @example
 * ```tsx
 * import { defineIcon, lift, squash } from "dettmann-ui/icons";
 *
 * export const TrashIcon = defineIcon({
 *   name: "trash",
 *   parts: { lid: <path d="M3 6h18" />, body: <path d="M19 6v14H5V6" /> },
 *   origin: { lid: "100% 100%" },
 *   action: { lid: lift({ y: -2.5, rotate: 14 }), body: squash({ amount: 0.06, delay: 40 }) },
 * });
 *
 * <button><TrashIcon size="sm" /> Excluir</button>
 * ```
 */
export function defineIcon(def: IconDefinition): AnimatedIconComponent {
  const errors = validate(def);
  if (errors.length > 0 && isDev()) {
    throw new Error(`defineIcon("${def.name}"): ${errors.join("; ")}.`);
  }
  const definition: IconDefinition =
    errors.length > 0 ? { name: def.name, parts: def.parts, ...(def.origin ? { origin: def.origin } : {}) } : def;
  const { name, action, loop: loopChoreo } = definition;

  const drawn = new Set(
    [...techniquesOf(action), ...techniquesOf(loopChoreo)]
      .filter(([, t]) => STROKE_TECHNIQUES.has(t.kind))
      .map(([key]) => key),
  );
  const content = Object.entries(definition.parts).map(([key, node]) => (
    <g key={key} data-part={key} style={fillBox(definition.origin?.[key] ?? DEFAULT_ORIGIN)}>
      {drawn.has(ROOT) || drawn.has(key) ? withPathLength(node) : node}
    </g>
  ));

  const Component = forwardRef<SVGSVGElement, AnimatedIconProps>(function AnimatedIcon(
    { size = "md", intent, label, strokeWidth, trigger = "auto", playKey, loop = false, className, ...rest },
    forwardedRef,
  ) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const ref = useMergedRef<SVGSVGElement>([svgRef, forwardedRef]);
    const lastPlayKey = useRef(playKey);
    const stateRef = useRef<IconState | null>(null);
    if (!stateRef.current) stateRef.current = createIconState(() => svgRef.current, action);
    const state = stateRef.current;

    // Montagem: registro do handle (lido pelo controlador delegado) e limpeza do action.
    useEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const unregister = registerIcon(svg, state.handle);
      return () => {
        unregister();
        state.cancelAction();
      };
    }, [state]);

    // Gatilho herdado: um controlador delegado por documento (contagem de referências).
    useEffect(() => {
      if (trigger === "auto") return retainController(svgRef.current?.ownerDocument);
    }, [trigger]);

    useEffect(() => {
      if (!loop) return;
      if (!loopChoreo) {
        if (isDev() && !warnedLoop.has(name)) {
          warnedLoop.add(name);
          console.warn(`dettmann-ui: o ícone "${name}" não tem coreografia de loop; a prop \`loop\` é ignorada.`);
        }
        return;
      }
      state.cancelAction();
      state.looping = true;
      const anims = state.run(loopChoreo, "loop");
      return () => {
        state.looping = false;
        for (const a of anims) a.cancel();
      };
    }, [loop, state]);

    useEffect(() => {
      if (Object.is(lastPlayKey.current, playKey)) return;
      lastPlayKey.current = playKey;
      state.cancelAction();
      state.handle.play();
    }, [playKey, state]);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth ?? ICON_STROKE[size]}
        strokeLinecap="round"
        strokeLinejoin="round"
        overflow="visible"
        data-animated-icon={name}
        data-trigger={trigger}
        {...intentData(intent)}
        className={cn("shrink-0", ICON_SIZE_CLASS[size], intent && "text-intent-fill", className)}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        role={label ? "img" : undefined}
        {...rest}
      >
        <g data-part={ROOT} style={fillBox(DEFAULT_ORIGIN)}>
          {content}
        </g>
      </svg>
    );
  });
  Component.displayName = `${pascal(name)}Icon`;
  return Object.assign(Component, { definition }) as AnimatedIconComponent;
}
