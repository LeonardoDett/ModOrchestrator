import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { EmptyState, FeaturedIcon } from "dettmann-ui";
import { useI18n, type MessageKey } from "../i18n/i18n";

/** Page content frame below the top bar (the top bar holds the page title). */
export function PageBody({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return (
    <div className={fill ? "flex h-full min-h-0 flex-col p-4 md:p-6" : "mx-auto w-full max-w-container-2xl p-4 md:p-6"}>
      {children}
    </div>
  );
}

interface HonestEmptyProps {
  icon: LucideIcon;
  title: MessageKey;
  description: MessageKey;
  children?: ReactNode;
}

/** An honest empty state: no action is offered until the feature exists. */
export function HonestEmpty({ icon, title, description, children }: HonestEmptyProps) {
  const { t } = useI18n();
  return (
    <EmptyState.Root className="rounded-xl border border-border bg-surface">
      <EmptyState.Icon>
        <FeaturedIcon icon={icon} color="neutral" />
      </EmptyState.Icon>
      <EmptyState.Title>{t(title)}</EmptyState.Title>
      <EmptyState.Description>{t(description)}</EmptyState.Description>
      {children ? <EmptyState.Actions>{children}</EmptyState.Actions> : null}
    </EmptyState.Root>
  );
}
