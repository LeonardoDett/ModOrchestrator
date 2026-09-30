import { DrawerRoot } from "./drawer.root";
import { DrawerContent } from "./drawer.content";
import { DrawerHeader } from "./drawer.header";
import { DrawerTitle } from "./drawer.title";
import { DrawerBody } from "./drawer.body";
import { DrawerFooter } from "./drawer.footer";
import { DrawerCloseButton } from "./drawer.close-button";

/**
 * Drawer is a compound overlay that slides in from an edge.
 *
 * @example
 * ```tsx
 * <Drawer.Root open={open} onOpenChange={setOpen}>
 *   <Drawer.Content side="right">
 *     <Drawer.Header>
 *       <Drawer.Title>Filters</Drawer.Title>
 *       <Drawer.CloseButton />
 *     </Drawer.Header>
 *     <Drawer.Body>Content</Drawer.Body>
 *     <Drawer.Footer>Actions</Drawer.Footer>
 *   </Drawer.Content>
 * </Drawer.Root>
 * ```
 */
export const Drawer = {
  Root: DrawerRoot,
  Content: DrawerContent,
  Header: DrawerHeader,
  Title: DrawerTitle,
  Body: DrawerBody,
  Footer: DrawerFooter,
  CloseButton: DrawerCloseButton,
};
