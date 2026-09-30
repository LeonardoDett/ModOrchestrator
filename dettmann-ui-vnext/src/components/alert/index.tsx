import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { createStrictContext } from "../../utils/create-strict-context";
import { toneData, type Tone } from "../../theme/tone";

const alertSoft = "bg-tone-subtle text-tone-text border border-tone-border";
const alertNeutral = "bg-secondary-subtle text-secondary-text border border-secondary-border";

const alertTone: Record<AlertVariant, Tone | undefined> = {
  default: undefined,
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
  base: "flex w-full flex-col items-start gap-1 rounded-xl p-4 text-sm",
});

interface AlertRootProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** Família de sinal compartilhada com Badge / Toast. `info` é o papel info. */
  variant?: AlertVariant;
  tone?: Tone;
}

function AlertRoot({ children, className, variant = "default", tone, ...props }: AlertRootProps) {
  const resolved = tone ?? alertTone[variant];
  return (
    <AlertProvider value={{ variant }}>
      <div
        role="alert"
        className={cn(rootVariants(), resolved ? alertSoft : alertNeutral, className)}
        {...toneData(resolved)}
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
