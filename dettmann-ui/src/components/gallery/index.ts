import { GalleryRoot } from "./gallery.root";
import { GalleryList } from "./gallery.list";
import { GalleryAdd } from "./gallery.add";

/**
 * Gallery lays out cells in a grid with a dashed add action.
 *
 * @example
 * ```tsx
 * <Gallery.Root columns={4} gap="compact">
 *   <Gallery.List>
 *     <img alt="" src="/a.jpg" />
 *   </Gallery.List>
 *   <Gallery.Add onClick={onAdd} />
 * </Gallery.Root>
 * ```
 */
export const Gallery = {
  Root: GalleryRoot,
  List: GalleryList,
  Add: GalleryAdd,
};

export type { GalleryGap } from "./gallery.root";
