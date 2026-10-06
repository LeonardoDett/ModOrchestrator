import { TabsRoot } from "./tabs.root";
import { TabsList } from "./tabs.list";
import { TabsTrigger } from "./tabs.trigger";
import { TabsPanel } from "./tabs.panel";

/**
 * Tabs component with keyboard navigation.
 *
 * @example
 * ```tsx
 * <Tabs.Root defaultValue="tab1">
 *   <Tabs.List>
 *     <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
 *     <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
 *   </Tabs.List>
 *   <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
 *   <Tabs.Panel value="tab2">Content 2</Tabs.Panel>
 * </Tabs.Root>
 * ```
 */
export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Panel: TabsPanel,
};
