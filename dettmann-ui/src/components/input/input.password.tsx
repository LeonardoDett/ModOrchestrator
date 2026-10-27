"use client";

import { useRef, type ComponentPropsWithoutRef, type FocusEvent } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { useControllableState } from "../../hooks/use-controllable-state";
import { resolveEmphasis } from "../../theme/emphasis";
import { EyeIcon } from "../../icons/glyphs/eye";
import { EyeOffIcon } from "../../icons/glyphs/eye-off";
import { inputValueAsString, useInputContext } from "./input.context";
import type { InputRootOwnedNativeProps } from "./input.owned-props";

const passwordFieldVariants = defineRecipe({
  base: [
    "w-full min-w-0 flex-1",
    "bg-transparent",
    "text-fg text-sm",
    "placeholder:text-fg-subtle",
    "focus-bare",
    "disabled:cursor-not-allowed disabled:text-fg-subtle",
  ].join(" "),
});

const toggleVariants = defineRecipe({
  base: [
    "-my-1 -mr-1.5 ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-chip",
    "motion-transition focus-ring-inset",
    "disabled:pointer-events-none disabled:text-fg-subtle",
  ].join(" "),
});

interface InputPasswordProps
  extends Omit<ComponentPropsWithoutRef<"input">, InputRootOwnedNativeProps | "type"> {
  /** Whether the value is shown in clear text (controlled). */
  revealed?: boolean;
  /** Initial reveal state (uncontrolled). Default `false`. */
  defaultRevealed?: boolean;
  /** Called with the requested reveal state. */
  onRevealedChange?: (revealed: boolean) => void;
  /** Mask the value again when focus leaves the field and its button. Default `true`. */
  hideOnBlur?: boolean;
  /** Render the reveal button. `false` for data that must never be shown. Default `true`. */
  revealable?: boolean;
  /** Accessible name of the button while the value is masked (localize it). */
  revealLabel?: string;
  /** Accessible name of the button while the value is shown (localize it). */
  hideLabel?: string;
}

/**
 * Input.Password is a masked field for sensitive data (password, token, API key)
 * with a button that reveals the value. `value`/`onChange` live on `Input.Root`.
 *
 * @example
 * ```tsx
 * <Input.Root name="apiKey" value={key} onChange={setKey}>
 *   <Input.Label>Chave da API</Input.Label>
 *   <Input.Box>
 *     <Input.Password autoComplete="off" revealLabel="Mostrar" hideLabel="Ocultar" />
 *   </Input.Box>
 * </Input.Root>
 * ```
 */
export function InputPassword({
  className,
  revealed: controlledRevealed,
  defaultRevealed = false,
  onRevealedChange,
  hideOnBlur = true,
  revealable = true,
  revealLabel = "Show value",
  hideLabel = "Hide value",
  autoComplete = "current-password",
  spellCheck = false,
  autoCapitalize = "off",
  placeholder,
  onFocus,
  onBlur,
  ...props
}: InputPasswordProps) {
  const { id, name, disabled, value, onChange, setIsFocused, hasFloatingLabel, hasValue, isFocused } =
    useInputContext("Password");
  const [revealed, setRevealed] = useControllableState({
    value: controlledRevealed,
    defaultValue: defaultRevealed,
    onChange: onRevealedChange,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Desabilitar não dispara blur: um campo desabilitado nunca fica revelado.
  const shown = revealable && Boolean(revealed) && !disabled;
  const low = resolveEmphasis({ emphasis: "low" });

  /** O foco passou entre o campo e o botão: continua "dentro" (não mascara nem tira o foco do Box). */
  const staysInside = (e: FocusEvent) =>
    e.relatedTarget !== null && (e.relatedTarget === inputRef.current || e.relatedTarget === buttonRef.current);

  const handleLeave = (e: FocusEvent) => {
    if (staysInside(e)) return;
    setIsFocused(false);
    if (hideOnBlur && shown) setRevealed(false);
  };

  const toggle = () => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? null;
    const end = input?.selectionEnd ?? null;
    setRevealed(!shown);
    if (!input) return;
    input.focus();
    // Trocar `type` reposiciona o cursor em alguns navegadores: restaura depois do commit.
    requestAnimationFrame(() => {
      if (start !== null && end !== null && document.activeElement === input) input.setSelectionRange(start, end);
    });
  };

  const showPlaceholder = !hasFloatingLabel || hasValue || isFocused;

  return (
    <>
      <input
        {...props}
        ref={inputRef}
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        disabled={disabled}
        value={inputValueAsString(value)}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        autoCapitalize={autoCapitalize}
        placeholder={showPlaceholder ? placeholder : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          handleLeave(e);
          onBlur?.(e);
        }}
        className={cn(passwordFieldVariants(), className)}
      />
      {revealable ? (
        <button
          ref={buttonRef}
          type="button"
          aria-label={shown ? hideLabel : revealLabel}
          aria-pressed={shown}
          aria-controls={id}
          disabled={disabled}
          // O clique do mouse não tira o foco do campo (nem dispara o hideOnBlur).
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          onFocus={() => setIsFocused(true)}
          onBlur={handleLeave}
          className={cn(toggleVariants(), low.className)}
          {...low.attrs}
        >
          {shown ? <EyeOffIcon size="sm" /> : <EyeIcon size="sm" />}
        </button>
      ) : null}
    </>
  );
}
