"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";

const rowVariants = defineRecipe({
  slots: {
    root: "flex w-full items-center gap-4 border-b border-border-subtle py-3 last:border-b-0",
    text: "flex min-w-0 flex-1 flex-col gap-0.5",
    label: "text-sm font-medium text-fg",
    description: "text-xs text-fg-muted",
    status: "shrink-0 text-xs text-fg-muted",
    control: "flex shrink-0 items-center gap-2",
  },
  variants: {
    disabled: {
      true: { label: "text-fg-subtle", description: "text-fg-subtle" },
      false: {},
    },
  },
  defaultVariants: { disabled: false },
});

export interface SettingRowProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  label: ReactNode;
  /** O que a opção faz; com o controle desabilitado, diga aqui o motivo. */
  description?: ReactNode;
  /** Estado à esquerda do controle ("Efetivo", "Bloqueado: precisa de Plugins"). */
  status?: ReactNode;
  /** Switch, select ou botão. Sem ele, a linha só informa (recurso sempre ligado). */
  control?: ReactNode;
  /** Id do controle: o rótulo vira `<label htmlFor>`. Sem ele, o controle recebe o nome por `aria-labelledby` do grupo. */
  controlId?: string;
  disabled?: boolean;
}

/**
 * SettingRow is one line of a settings list: label and description on the left, status
 * and control on the right. It never saves: the screen calls the backend.
 *
 * @example
 * ```tsx
 * <SettingRow label="Ordem de carga" description="Ordena os plugins. Depende de Plugins."
 *   status="Bloqueado: precisa de Plugins" controlId="feat-lo"
 *   control={<Switch id="feat-lo" checked={on} onCheckedChange={set} />} />
 * ```
 */
export function SettingRow({ label, description, status, control, controlId, disabled = false, className, ...props }: SettingRowProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-description` : undefined;
  const s = rowVariants({ disabled });
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      aria-disabled={disabled || undefined}
      className={cn(s.root(), className)}
      {...props}
    >
      <div className={s.text()}>
        {controlId ? (
          <label id={labelId} htmlFor={controlId} className={s.label()}>
            {label}
          </label>
        ) : (
          <span id={labelId} className={s.label()}>
            {label}
          </span>
        )}
        {description ? (
          <span id={descriptionId} className={s.description()}>
            {description}
          </span>
        ) : null}
      </div>
      {status ? <span className={s.status()}>{status}</span> : null}
      {control ? <div className={s.control()}>{control}</div> : null}
    </div>
  );
}
