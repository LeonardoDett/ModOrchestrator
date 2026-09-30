import { AccordionRoot } from "./accordion.root";
import { AccordionItem } from "./accordion.item";
import { AccordionTrigger } from "./accordion.trigger";
import { AccordionContent } from "./accordion.content";

/**
 * Accordion component with keyboard navigation.
 *
 * @example
 * ```tsx
 * <Accordion.Root defaultValue="item1">
 *   <Accordion.Item value="item1">
 *     <Accordion.Trigger value="item1">Title 1</Accordion.Trigger>
 *     <Accordion.Content value="item1">Content 1</Accordion.Content>
 *   </Accordion.Item>
 * </Accordion.Root>
 * ```
 */
export const Accordion = {
  Root: AccordionRoot,
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
};
