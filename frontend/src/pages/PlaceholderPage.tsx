import type { LucideIcon } from "lucide-react";
import { EmptyState, FeaturedIcon, ResourcePage } from "dettmann-ui";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}

/** An honest empty page: no actions are offered until the feature exists. */
export function PlaceholderPage({ title, description, icon, emptyTitle, emptyDescription }: PlaceholderPageProps) {
  return (
    <ResourcePage title={title} description={description}>
      <EmptyState.Root className="rounded-xl border border-border bg-surface">
        <EmptyState.Icon>
          <FeaturedIcon icon={icon} color="neutral" />
        </EmptyState.Icon>
        <EmptyState.Title>{emptyTitle}</EmptyState.Title>
        <EmptyState.Description>{emptyDescription}</EmptyState.Description>
      </EmptyState.Root>
    </ResourcePage>
  );
}
