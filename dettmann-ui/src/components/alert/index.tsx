import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { createStrictContext } from "../../utils/create-strict-context";
import { intentData } from "../../theme/emphasis";
import { intentIcon } from "../../icons/intent-icon";
import { XIcon } from "../../icons/glyphs/x";
import { Button } from "../button";
import type { Intent } from "../../theme/engine";

const alertSurface = "bg-intent-subtle text-intent-text border-intent-border";

const alertIntent: Record<AlertVariant, Intent> = {
  default: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

type AlertVariant = "default" | "success" | "warning" | "danger" | "info";

interface AlertContextValue {
  variant: AlertVariant;
}

const [AlertProvider, useAlertContext] = createStrictContext<AlertContextValue>("Alert");

const rootVariants = defineRecipe({
  base: "flex w-full gap-3 text-sm",
  variants: {
    /** `compact`: uma linha (dica, aviso curto), conteúdo e ações centralizados. */
    compact: { true: "", false: "" },
    /** `band`: faixa de ponta a ponta sob o cabeçalho de um diálogo, só com a linha de baixo (D-040). */
    band: {
      true: "items-center border-b py-2.5 pl-6 pr-5",
      false: "rounded-card border",
    },
  },
  compoundVariants: [
    { band: false, compact: true, class: "items-center px-3 py-2" },
    { band: false, compact: false, class: "items-start p-3" },
  ],
  defaultVariants: { compact: false, band: false },
});

interface AlertRootProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** Família de sinal compartilhada com Badge / Toast. `info` é o papel info. */
  variant?: AlertVariant;
  /** Sobrepõe o intent derivado de `variant`. */
  intent?: Intent;
  /** Glifo de status. Padrão: o do intent (status nunca só por cor); `null` remove. */
  icon?: ReactNode | null;
  /** Ações à direita do texto (por exemplo um `Button`). */
  action?: ReactNode;
  /** Mostra o botão de dispensar, último na ordem de foco. Exige `dismissLabel`. */
  onDismiss?: () => void;
  /** Nome acessível e dica do botão de dispensar. */
  dismissLabel?: string;
  /** Uma linha, com conteúdo e ações centralizados. */
  compact?: boolean;
  /** Faixa de ponta a ponta (sem cantos, só a linha de baixo), numa linha. */
  band?: boolean;
}

function AlertRoot({
  children,
  className,
  variant = "default",
  intent,
  icon,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
  compact = false,
  band = false,
  ...props
}: AlertRootProps) {
  const resolved = intent ?? alertIntent[variant];
  const StatusIcon = intentIcon(resolved);
  const glyph = icon === undefined ? <StatusIcon size="sm" trigger="none" /> : icon;
  return (
    <AlertProvider value={{ variant }}>
      <div
        role="alert"
        className={cn(rootVariants({ compact, band }), alertSurface, className)}
        {...intentData(resolved)}
        {...props}
      >
        {glyph ? (
          <span data-slot="alert-icon" aria-hidden="true" className={cn("flex shrink-0", !compact && !band && "mt-0.5")}>
            {glyph}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">{children}</div>
        {action ? (
          <div data-slot="alert-action" className="flex shrink-0 items-center gap-2">
            {action}
          </div>
        ) : null}
        {onDismiss ? (
          <Button
            size="icon-sm"
            emphasis="low"
            aria-label={dismissLabel}
            tooltip={dismissLabel}
            onClick={onDismiss}
            className="-my-1 shrink-0"
          >
            <XIcon size="sm" />
          </Button>
        ) : null}
      </div>
    </AlertProvider>
  );
}

function AlertTitle({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  useAlertContext("Title");
  return <div className={cn("font-semibold", className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  useAlertContext("Description");
  return <div className={cn("", className)} {...props} />;
}

/**
 * Alert is an inline status banner. Same subtle tokens as Badge and Toast.
 *
 * @example
 * ```tsx
 * <Alert.Root variant="success">
 *   <Alert.Title>Saved</Alert.Title>
 *   <Alert.Description>Your changes are live.</Alert.Description>
 * </Alert.Root>
 *
 * <Alert.Root compact variant="info" action={<Button size="sm">Abrir o passo a passo</Button>}
 *   onDismiss={hide} dismissLabel="Dispensar a dica">
 *   <Alert.Description>Não sabe por onde começar?</Alert.Description>
 * </Alert.Root>
 * ```
 */
export const Alert = {
  Root: AlertRoot,
  Title: AlertTitle,
  Description: AlertDescription,
};
