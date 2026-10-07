import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  useRef,
  useState,
  version,
  type ReactElement,
  type Ref,
} from "react";
import { mergeRefs } from "../utils/merge-refs";
import { useIsomorphicLayoutEffect } from "../utils/use-isomorphic-layout-effect";
import { animate, type KeyframesInput } from "./animate";
import type { MotionValues } from "./read-motion";

export interface PresenceProps {
  show: boolean;
  /** Entrada. Padrão: `opacity 0→1` + `translateY(4px × amp)→0`. */
  enter?: KeyframesInput;
  /** Saída. Padrão: o inverso da entrada padrão. */
  exit?: KeyframesInput;
  /**
   * Um único elemento cujo `ref` chega ao nó DOM: um elemento nativo ou um componente que
   * repassa `ref` (prop `ref` no React 19, `forwardRef` no 18). O `ref` do próprio filho é preservado.
   */
  children: ReactElement;
}

const defaultEnter = (m: MotionValues): Keyframe[] => [
  { opacity: 0, transform: `translateY(${4 * m.amp}px)` },
  { opacity: 1, transform: "translateY(0px)" },
];
const defaultExit = (m: MotionValues): Keyframe[] => [...defaultEnter(m)].reverse();

const REACT_19 = Number(version.split(".")[0]) >= 19;

/** `ref` do elemento sem o aviso de acesso a `element.ref` do React 19. */
function elementRef(child: ReactElement): Ref<Element> | undefined {
  return REACT_19
    ? (child.props as { ref?: Ref<Element> }).ref
    : (child as unknown as { ref?: Ref<Element> }).ref;
}

/**
 * Anima a entrada quando `show` vira `true` (inclusive na montagem) e mantém o filho
 * montado até a animação de saída terminar. Sem WAAPI (ou sem nada para animar sob
 * redução de movimento) desmonta na hora. Voltar a `show` durante a saída cancela a saída;
 * desmontar o `Presence` cancela a animação em curso.
 */
export function Presence({ show, enter, exit, children }: PresenceProps) {
  const child = Children.only(children);
  const [present, setPresent] = useState(show);
  const node = useRef<Element | null>(null);
  const running = useRef<Animation | null>(null);
  const lastChild = useRef(child);
  if (show) lastChild.current = child;

  const keyframes = useRef({ enter, exit });
  keyframes.current = { enter, exit };

  useIsomorphicLayoutEffect(
    () => () => {
      // Desmontagem (inclusive no meio da saída): não deixa animação órfã no nó.
      running.current?.cancel();
      running.current = null;
    },
    [],
  );

  useIsomorphicLayoutEffect(() => {
    const el = node.current;
    running.current?.cancel();
    running.current = null;
    if (show) {
      setPresent(true);
      if (el) running.current = animate(el, keyframes.current.enter ?? defaultEnter);
      return;
    }
    const anim = el ? animate(el, keyframes.current.exit ?? defaultExit, { spring: false, fill: "forwards" }) : null;
    if (!anim) {
      setPresent(false);
      return;
    }
    running.current = anim;
    let active = true;
    anim.finished.then(
      () => {
        if (active) setPresent(false);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [show]);

  const rendered = show ? child : lastChild.current;
  const ownRef = isValidElement(rendered) ? elementRef(rendered) : undefined;
  const ref = useMemo(() => mergeRefs<Element | null>([ownRef, node]), [ownRef]);

  if (!show && !present) return null;
  return cloneElement(rendered as ReactElement<{ ref?: Ref<Element> }>, { ref });
}
