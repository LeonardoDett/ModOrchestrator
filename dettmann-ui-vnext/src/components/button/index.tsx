import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Loader } from "../loader";
import { Progress } from "../progress";
import { Tooltip } from "../tooltip";
import { intentData, resolveEmphasis } from "../../theme/emphasis";
import { isDev } from "../../dev/env";
import type { Emphasis, Intent, MotionLevel } from "../../theme/engine";

const buttonVariants = defineRecipe({
  base: [
    "inline-flex items-center gap-2",
    "text-sm font-semibold",
    "rounded-control",
    "motion-transition motion-press",
    "border focus-ring",
    "disabled:pointer-events-none disabled:bg-sunken disabled:text-fg-subtle disabled:border-transparent",
  ].join(" "),
  variants: {
    /** Size variant: altura pelas primitivas de controle. */
    size: {
      sm: "h-control-sm justify-center px-3 text-xs",
      md: "h-control-md justify-center px-4 text-sm",
      lg: "h-control-lg justify-center px-5 text-md",
      icon: "size-control-md justify-center p-0",
      "icon-sm": "size-control-sm justify-center p-0",
      "icon-lg": "size-control-lg justify-center p-0",
      /** D-040: a link inside text ("2 arquivos", "Alterar"): no box, the size of the text around it. */
      inline: "h-auto justify-start rounded-chip px-0.5 py-0 font-medium underline-offset-2 hover:underline",
    },
    /** Full width */
    fullWidth: {
      true: "w-full",
      false: "",
    },
  },
  defaultVariants: {
    size: "md",
    fullWidth: false,
  },
});

type ButtonVariants = VariantProps<typeof buttonVariants>;

interface ButtonProps
  extends ComponentPropsWithoutRef<"button">,
    ButtonVariants {
  /** Camada 60/30/10. Padrão `medium`; `high` sem intent resolve para `brand`. */
  emphasis?: Emphasis;
  /** Significado cromático. Padrão `neutral` (ou `brand` quando `emphasis="high"`). */
  intent?: Intent;
  /** Nível de movimento; padrão derivado da ênfase. */
  motion?: MotionLevel;
  /** Show loading spinner */
  loading?: boolean;
  /** Loading text (optional) */
  loadingText?: string;
  /** Optional icon rendered before the label; gap is applied automatically */
  startIcon?: ReactNode;
  /** Optional icon rendered after the label; gap is applied automatically */
  endIcon?: ReactNode;
  /**
   * Selo sobreposto no canto (contagem, por exemplo). Decorativo: o nome acessível do
   * botão precisa conter a mesma informação ("Fila de instalação, 3 itens").
   */
  badge?: ReactNode;
  /** Intent do selo. Padrão `neutral`. */
  badgeIntent?: Intent;
  /**
   * Progresso de 0 a 100 desenhado como anel em volta do conteúdo (botões `icon*`).
   * Decorativo: o nome acessível precisa conter o valor ("Implantando, 64%").
   */
  progress?: number;
  /** Dica no hover e no foco. Em botões só com ícone, use o mesmo texto do `aria-label`. */
  tooltip?: ReactNode;
}

const RING_SIZE = { icon: 30, "icon-sm": 24, "icon-lg": 38 } as const;
const warned = new Set<string>();

/**
 * Button: aparência resolvida pela tabela central `emphasis × intent`.
 *
 * @example
 * ```tsx
 * <Button>Salvar</Button>
 * <Button emphasis="high">Implantar</Button>
 * <Button emphasis="low" intent="danger">Excluir</Button>
 * <Button startIcon={<Icon icon={Plus} size="sm" />}>Adicionar</Button>
 * <Button size="icon" aria-label="Fila de instalação, 3 itens" tooltip="Fila de instalação" badge={3}>…</Button>
 * <Button size="icon" aria-label="Implantando, 64%" tooltip="Implantando 64%" progress={64}>…</Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      className,
      emphasis,
      intent,
      motion,
      size,
      fullWidth,
      loading = false,
      loadingText,
      startIcon,
      endIcon,
      badge,
      badgeIntent = "neutral",
      progress,
      tooltip,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || loading;
    const hasIcons = Boolean(startIcon || endIcon);
    const resolved = resolveEmphasis({ emphasis, intent, motion });
    const iconOnly = size === "icon" || size === "icon-sm" || size === "icon-lg";
    if (iconOnly && !props["aria-label"] && !props["aria-labelledby"] && isDev()) {
      const key = String(tooltip ?? "button");
      if (!warned.has(key)) {
        warned.add(key);
        console.warn("[dettmann-ui] Button só com ícone precisa de `aria-label` (ou `aria-labelledby`).");
      }
    }
    const overlaid = badge !== undefined && badge !== null || progress !== undefined;

    const button = (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          buttonVariants({ size, fullWidth }),
          resolved.className,
          resolved.emphasis === "medium" ? "border-border" : "border-transparent",
          hasIcons && "gap-2",
          overlaid && "relative",
          className
        )}
        aria-busy={loading || undefined}
        {...resolved.attrs}
        {...props}
      >
        {loading && (
          <Loader
            size={size === "sm" || size === "icon-sm" ? "xs" : "sm"}
            className="shrink-0"
          />
        )}
        {!loading && startIcon ? (
          <span className="inline-flex shrink-0">{startIcon}</span>
        ) : null}
        {loading && loadingText ? loadingText : children}
        {!loading && endIcon ? (
          <span className="inline-flex shrink-0">{endIcon}</span>
        ) : null}
        {progress !== undefined ? (
          <Progress.Circle
            role="presentation"
            aria-hidden="true"
            value={Math.min(100, Math.max(0, progress))}
            size={iconOnly ? RING_SIZE[size] : 30}
            strokeWidth={2}
            className="pointer-events-none absolute inset-0 m-auto"
          />
        ) : null}
        {badge !== undefined && badge !== null ? (
          <span
            aria-hidden="true"
            data-slot="badge"
            className="pointer-events-none absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-intent-fill px-1 text-caption font-semibold leading-none text-on-intent"
            {...intentData(badgeIntent)}
          >
            {badge}
          </span>
        ) : null}
      </button>
    );

    if (tooltip === undefined || tooltip === null) return button;
    return (
      <Tooltip.Root>
        <Tooltip.Trigger>{button}</Tooltip.Trigger>
        <Tooltip.Content>{tooltip}</Tooltip.Content>
      </Tooltip.Root>
    );
  }
);
