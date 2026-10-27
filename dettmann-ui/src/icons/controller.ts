import { getIconHandle } from "./registry";

/** Controles interativos que disparam o `action` dos ícones com `trigger="auto"` (spec seção 5). */
export const INTERACTIVE_SELECTOR =
  "button, a[href], summary, label, [role=button], [role=link], [role=menuitem], " +
  "[role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=option], " +
  "[role=switch], [role=checkbox], [role=radio], [role=treeitem], [data-icon-trigger]";

const AUTO_ICONS = '[data-animated-icon][data-trigger="auto"]';
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

/** Controle interativo mais próximo de `el` (inclusive), ou `null`. */
export function findControl(el: Element): Element | null {
  return el.closest(INTERACTIVE_SELECTOR);
}

function isDisabled(control: Element): boolean {
  if (control.getAttribute("aria-disabled") === "true") return true;
  try {
    return control.matches(":disabled");
  } catch {
    return false;
  }
}

/** Toca o `action` dos ícones automáticos cujo controle mais próximo é `control`. */
function playControl(control: Element) {
  if (isDisabled(control)) return;
  for (const icon of control.querySelectorAll(AUTO_ICONS)) {
    if (findControl(icon) === control) getIconHandle(icon)?.play();
  }
}

const controlOf = (target: EventTarget | null): Element | null =>
  target && (target as Node).nodeType === 1 ? findControl(target as Element) : null;

/** Instala os listeners delegados no documento; devolve a remoção. */
function install(doc: Document): () => void {
  // Modalidade do último input: teclado até o próximo `pointerdown`.
  let keyboard = false;

  const onPointerOver = (e: Event) => {
    const ev = e as PointerEvent;
    if (ev.pointerType !== "mouse" && ev.pointerType !== "pen") return;
    const control = controlOf(ev.target);
    if (!control) return;
    const related = ev.relatedTarget as Node | null;
    if (related && control.contains(related)) return;
    playControl(control);
  };
  const onPointerDown = (e: Event) => {
    keyboard = false;
    const ev = e as PointerEvent;
    if (ev.button !== 0) return;
    const control = controlOf(ev.target);
    if (control) playControl(control);
  };
  const onKeyDown = () => {
    keyboard = true;
  };
  const onFocusIn = (e: Event) => {
    const target = e.target as Element | null;
    const control = controlOf(target);
    if (!control || !target || !keyboard) return;
    let visible = true;
    try {
      visible = target.matches(":focus-visible");
    } catch {
      // Sem suporte a `:focus-visible`: vale a heurística de teclado.
    }
    if (visible) playControl(control);
  };

  const listeners: [string, (e: Event) => void][] = [
    ["pointerover", onPointerOver],
    ["pointerdown", onPointerDown],
    ["focusin", onFocusIn],
    ["keydown", onKeyDown],
  ];
  for (const [type, fn] of listeners) doc.addEventListener(type, fn, LISTENER_OPTIONS);
  return () => {
    for (const [type, fn] of listeners) doc.removeEventListener(type, fn, LISTENER_OPTIONS);
  };
}

const controllers = new WeakMap<Document, { count: number; uninstall: () => void }>();

/**
 * Garante um controlador delegado por documento (contagem de referências): o primeiro
 * ícone com `trigger="auto"` instala os listeners de captura (`pointerover`, `pointerdown`,
 * `focusin`, `keydown`) e o último a desmontar os remove. Sem documento (SSR), é no-op.
 * O controlador só lê o DOM e chama `IconHandle.play()`; nunca toca em React.
 */
export function retainController(doc: Document | undefined): () => void {
  if (!doc) return () => {};
  let entry = controllers.get(doc);
  if (!entry) {
    entry = { count: 0, uninstall: install(doc) };
    controllers.set(doc, entry);
  }
  entry.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = controllers.get(doc);
    if (!current) return;
    current.count -= 1;
    if (current.count === 0) {
      current.uninstall();
      controllers.delete(doc);
    }
  };
}
