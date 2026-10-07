import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { createStrictContext } from "../../utils/create-strict-context";
import { intentData } from "../../theme/emphasis";
import type { Intent } from "../../theme/engine";

const alertSurface = "bg-intent-subtle text-intent-text border border-intent-border";

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
  base: "flex w-full flex-col items-start gap-1 rounded-card p-4 text-sm",
});

interface AlertRootProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** Família de sinal compartilhada com Badge / Toast. `info` é o papel info. */
  variant?: AlertVariant;
  /** Sobrepõe o intent derivado de `variant`. */
  intent?: Intent;
}

function AlertRoot({ children, className, variant = "default", intent, ...props }: AlertRootProps) {
  const resolved = intent ?? alertIntent[variant];
  return (
    <AlertProvider value={{ variant }}>
      <div
        role="alert"
        className={cn(rootVariants(), alertSurface, className)}
        {...intentData(resolved)}
        {...props}
      >
        {children}
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
 * ```
 */
export const Alert = {
  Root: AlertRoot,
  Title: AlertTitle,
  Description: AlertDescription,
};
